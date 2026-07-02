import middlewareRepository from "./middlewareRepository.js";
import MiddlewareUtil from "./MiddlewareUtil.js";
import {getLogger} from "@ui5/logger";
const hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);
const log = getLogger("server:MiddlewareManager");

/**
 * @private
 * @typedef {object} MiddlewareResources
 * @property {@ui5/fs/AbstractReader} all Reader or Collection to read resources of the
 *                                        root project and its dependencies
 * @property {@ui5/fs/AbstractReader} rootProject Reader or Collection to read resources of
 *                                        the project the server is started in
 * @memberof @ui5/server/internal/MiddlewareManager
 */

/**
 * The MiddlewareManager
 *
 * @private
 * @class
 * @alias @ui5/server/internal/MiddlewareManager
 */
class MiddlewareManager {
	constructor({graph, rootProject, sources, resources, buildReader, options = {}}) {
		if (!graph || !rootProject || !resources || !resources.all ||
			!resources.rootProject || !resources.dependencies) {
			throw new Error("[MiddlewareManager]: One or more mandatory parameters not provided");
		}
		this.graph = graph;
		this.rootProject = rootProject;
		this.sources = sources;
		this.resources = resources;
		this.buildReader = buildReader;
		this.options = {
			sendSAPTargetCSP: false,
			serveCSPReports: false,
			simpleIndex: false,
			...options,
			liveReload: {
				active: false,
				token: null,
				...options.liveReload,
			},
		};

		this.middleware = Object.create(null);
		this.middlewareExecutionOrder = [];
		this.legacyMiddlewarePlaceholders = new Set();
		this.middlewareUtil = new MiddlewareUtil({graph, project: rootProject});
	}

	/**
	 * Applies the middleware to
	 *
	 * @private
	 * @param {object} app The express application object
	 * @returns {Promise<Array<undefined>>} Promise resolving to an Array with a length of the number
	 *      of added middlewares. The entries of the Array have a value of <code>undefined</code>.
	 */
	async applyMiddleware(app) {
		await this.addStandardMiddleware();
		await this.addCustomMiddleware();

		// Strip legacy placeholders for removed standard middlewares — they only existed
		// in middlewareExecutionOrder to preserve slots for custom beforeMiddleware /
		// afterMiddleware references and are not backed by an actual middleware.
		return this.middlewareExecutionOrder
			.filter((name) => !this.legacyMiddlewarePlaceholders.has(name))
			.map((name) => {
				const m = this.middleware[name];
				app.use(m.mountPath, m.middleware);
			});
	}

	/**
	 * Adds the given middleware configuration
	 *
	 * @private
	 * @param {string} middlewareName The name of the middleware
	 * @param {object} [options] The Options of the middleware
	 * @param {object} [options.customMiddleware] The custom middleware
	 * @param {Function} [options.wrapperCallback] Callback called when middleware is called
	 * @param {string} [options.mountPath="/"] The path hosting the middleware
	 * @param {string} [options.beforeMiddleware] The name of the middleware called before the added middleware
	 * @param {string} [options.afterMiddleware] The name of the middleware called after the added middleware
	 */
	async addMiddleware(middlewareName, {
		customMiddleware, wrapperCallback, mountPath = "/",
		beforeMiddleware, afterMiddleware
	} = {}) {
		if (this.#isMiddlewareNameKnown(middlewareName)) {
			throw new Error(`A middleware with the name ${middlewareName} has already been added`);
		}

		let middlewareCallback;
		if (customMiddleware) {
			middlewareCallback = customMiddleware;
		} else {
			const middlewareInfo = await middlewareRepository.getMiddleware(middlewareName);
			if (wrapperCallback) {
				middlewareCallback = wrapperCallback(middlewareInfo);
			} else {
				middlewareCallback = middlewareInfo.middleware;
			}
		}

		if (this.middlewareExecutionOrder.includes(middlewareName)) {
			throw new Error(`Middleware ${middlewareName} already added to execution order. This should not happen.`);
		}

		if (beforeMiddleware || afterMiddleware) {
			const refMiddlewareName = beforeMiddleware || afterMiddleware;
			let refMiddlewareIdx = this.middlewareExecutionOrder.indexOf(refMiddlewareName);

			if (refMiddlewareName === "connectUi5Proxy") {
				throw new Error(
					`Standard middleware "connectUi5Proxy", referenced by middleware "${middlewareName}" ` +
					`in project ${this.middlewareUtil.getProject()}, ` +
					`has been removed in this version of UI5 CLI and can't be referenced anymore. ` +
					`Please see the migration guide at https://ui5.github.io/cli/updates/migrate-v3/`);
			}

			// Warn when a removed standard middleware is referenced. The reference still resolves
			// because the removed middleware is kept as a placeholder in middlewareExecutionOrder
			// (see #addLegacyMiddlewarePlaceholder), preserving the original execution slot.
			if (this.legacyMiddlewarePlaceholders.has(refMiddlewareName)) {
				log.warn(
					`Standard middleware "${refMiddlewareName}" has been removed. ` +
					`Custom middleware "${middlewareName}" defined in project ` +
					`"${this.middlewareUtil.getProject()}" still references it. ` +
					`The custom middleware will be executed in the slot the removed middleware ` +
					`originally occupied, but the reference should be updated. ` +
					`For details, see the migration guide at ` +
					`https://ui5.github.io/cli/next/updates/migrate-v5`);
			}

			if (refMiddlewareIdx === -1) {
				throw new Error(`Could not find middleware ${refMiddlewareName}, referenced by custom ` +
					`middleware ${middlewareName}`);
			}
			if (afterMiddleware) {
				// Insert after index of referenced middleware
				refMiddlewareIdx++;
			}
			this.middlewareExecutionOrder.splice(refMiddlewareIdx, 0, middlewareName);
		} else {
			this.middlewareExecutionOrder.push(middlewareName);
		}

		this.middleware[middlewareName] = {
			middleware: await Promise.resolve(middlewareCallback({
				resources: this.resources,
				middlewareUtil: this.middlewareUtil
			})),
			mountPath
		};
	}

	/**
	 * Adds all registered standard middlewares
	 *
	 * @private
	 * @returns {Promise} Resolving to <code>undefined</code> once all standard middlewares are added
	 */
	async addStandardMiddleware() {
		await this.addMiddleware("csp", {
			wrapperCallback: ({middleware: cspModule}) => {
				const oCspConfig = {
					allowDynamicPolicySelection: true,
					allowDynamicPolicyDefinition: true,
					definedPolicies: {
						"sap-target-level-1":
							"default-src 'self'; " +
							"script-src  'self' 'unsafe-eval'; " +
							"style-src   'self' 'unsafe-inline'; " +
							"font-src    'self' data:; " +
							"img-src     'self' https: http: data: blob:; " +
							"media-src   'self' https: http: data: blob:; " +
							"object-src  blob:; " +
							"frame-src   'self' https: gap: data: blob: mailto: tel:; " +
							"worker-src  'self' blob:; " +
							"child-src   'self' blob:; " +
							"connect-src 'self' https: wss:; " +
							"base-uri    'self';",
						"sap-target-level-2":
							"default-src 'self'; " +
							"script-src  'self'; " +
							"style-src   'self' 'unsafe-inline'; " +
							"font-src    'self' data:; " +
							"img-src     'self' https: http: data: blob:; " +
							"media-src   'self' https: http: data: blob:; " +
							"object-src  blob:; " +
							"frame-src   'self' https: gap: data: blob: mailto: tel:; " +
							"worker-src  'self' blob:; " +
							"child-src   'self' blob:; " +
							"connect-src 'self' https: wss:; " +
							"base-uri    'self';",
						"sap-target-level-3":
							"default-src 'self'; " +
							"script-src  'self'; " +
							"style-src   'self'; " +
							"font-src    'self'; " +
							"img-src     'self' https:; " +
							"media-src   'self' https:; " +
							"object-src  'self'; " +
							"frame-src   'self' https: gap: mailto: tel:; " +
							"worker-src  'self'; " +
							"child-src   'self'; " +
							"connect-src 'self' https: wss:; " +
							"base-uri    'self';"
					}
				};
				if (this.options.sendSAPTargetCSP) {
					const defaultSAPTargetConfig = {
						defaultPolicy: "sap-target-level-1",
						defaultPolicyIsReportOnly: true,
						defaultPolicy2: "sap-target-level-3",
						defaultPolicy2IsReportOnly: true,
						ignorePaths: ["test-resources/sap/ui/qunit/testrunner.html"]
					};
					Object.assign(oCspConfig, defaultSAPTargetConfig);

					if (typeof this.options.sendSAPTargetCSP === "object") {
						for (const [name, value] of Object.entries(this.options.sendSAPTargetCSP)) {
							if (!hasOwn(defaultSAPTargetConfig, name)) {
								throw new TypeError(
									`Unknown SAP Target CSP configuration option '${name}'. Allowed options are ` +
									`${Object.keys(defaultSAPTargetConfig)}`);
							}
							oCspConfig[name] = value;
						}
					}
				}
				if (this.options.serveCSPReports) {
					Object.assign(oCspConfig, {
						serveCSPReports: true,
					});
				}
				return () => {
					return cspModule("sap-ui-xx-csp-policy", oCspConfig);
				};
			}
		});
		await this.addMiddleware("compression");
		await this.addMiddleware("cors");
		await this.addMiddleware("liveReloadClient", {
			wrapperCallback: ({middleware}) =>
				({middlewareUtil}) => middleware({
					middlewareUtil,
					active: this.options.liveReload.active,
					token: this.options.liveReload.token,
				})
		});
		await this.addMiddleware("discovery", {
			mountPath: "/discovery"
		});
		await this.addMiddleware("serveResources", {
			wrapperCallback: ({middleware}) => {
				return ({resources, middlewareUtil}) => middleware({
					resources,
					middlewareUtil,
					injectLiveReloadClient: this.options.liveReload.active
				});
			}
		});
		this.#addLegacyMiddlewarePlaceholder("testRunner");
		this.#addLegacyMiddlewarePlaceholder("serveThemes");
		await this.addMiddleware("versionInfo", {
			mountPath: "/resources/sap-ui-version.json"
		});
		// Handle anything but read operations *before* the serveIndex middleware
		//	as it will reject them with a 405 (Method not allowed) instead of 404 like our old tooling
		await this.addMiddleware("nonReadRequests");
		await this.addMiddleware("serveIndex", {
			wrapperCallback: ({middleware}) => {
				return ({resources, middlewareUtil}) => middleware({
					resources,
					middlewareUtil,
					simpleIndex: this.options.simpleIndex
				});
			}
		});
	}

	/**
	 * Adds all registered custom middlewares
	 *
	 * @private
	 * @returns {Promise} Resolving to <code>undefined</code> once all custom middlewares are added
	 */
	async addCustomMiddleware() {
		const project = this.graph.getRoot();
		const projectCustomMiddleware = project.getCustomMiddleware();
		if (projectCustomMiddleware.length === 0) {
			return; // No custom middleware defined
		}

		for (let i = 0; i < projectCustomMiddleware.length; i++) {
			const middlewareDef = projectCustomMiddleware[i];
			if (!middlewareDef.name) {
				throw new Error(`Missing name for custom middleware definition of project ${project.getName()} ` +
					`at index ${i}`);
			}
			if (middlewareDef.beforeMiddleware && middlewareDef.afterMiddleware) {
				throw new Error(
					`Custom middleware definition ${middlewareDef.name} of project ${project.getName()} ` +
					`defines both "beforeMiddleware" and "afterMiddleware" parameters. Only one must be defined.`);
			}
			if (!middlewareDef.beforeMiddleware && !middlewareDef.afterMiddleware) {
				throw new Error(
					`Custom middleware definition ${middlewareDef.name} of project ${project.getName()} ` +
					`defines neither a "beforeMiddleware" nor an "afterMiddleware" parameter. One must be defined.`);
			}
			const customMiddleware = this.graph.getExtension(middlewareDef.name);
			if (!customMiddleware) {
				throw new Error(
					`Could not find custom middleware ${middlewareDef.name}, ` +
					`referenced by project ${project.getName()}`);
			}

			let middlewareName = middlewareDef.name;
			if (this.#isMiddlewareNameKnown(middlewareName)) {
				// Middleware is already known
				// => add a suffix to allow for multiple configurations of the same middleware
				let suffixCounter = 0;
				while (this.#isMiddlewareNameKnown(middlewareName)) {
					suffixCounter++; // Start at 1
					middlewareName = `${middlewareDef.name}--${suffixCounter}`;
				}
			}

			await this.addMiddleware(middlewareName, {
				customMiddleware: async ({resources, middlewareUtil}) => {
					const params = {
						resources,
						options: {
							configuration: middlewareDef.configuration
						}
					};

					const specVersion = customMiddleware.getSpecVersion();
					if (specVersion.gte("3.0")) {
						params.options.middlewareName = middlewareName;
						params.log = getLogger(`server:custom-middleware:${middlewareDef.name}`);
					}
					const middlewareUtilInterface = middlewareUtil.getInterface(specVersion);
					if (middlewareUtilInterface) {
						params.middlewareUtil = middlewareUtilInterface;
					}
					return (await customMiddleware.getMiddleware())(params);
				},
				mountPath: middlewareDef.mountPath,
				beforeMiddleware: middlewareDef.beforeMiddleware,
				afterMiddleware: middlewareDef.afterMiddleware
			});
		}
	}

	/**
	 * Inserts a no-op placeholder for a removed standard middleware into the execution order.
	 * Placeholders preserve the original slot so custom middlewares referencing the removed
	 * middleware via beforeMiddleware / afterMiddleware keep their intended position.
	 * They are stripped in applyMiddleware() before mounting on the express app.
	 *
	 * @private
	 * @param {string} middlewareName Name of the removed standard middleware
	 */
	#addLegacyMiddlewarePlaceholder(middlewareName) {
		this.legacyMiddlewarePlaceholders.add(middlewareName);
		this.middlewareExecutionOrder.push(middlewareName);
	}

	/**
	 * Returns whether the given middleware name is already known — either registered
	 * in <code>this.middleware</code> or occupying a legacy placeholder slot.
	 * Placeholder names are treated as known to avoid collisions in the execution order:
	 * a custom middleware named e.g. "testRunner" would otherwise clash with the
	 * placeholder inserted to preserve its original slot.
	 *
	 * @private
	 * @param {string} middlewareName Middleware name to check
	 * @returns {boolean}
	 */
	#isMiddlewareNameKnown(middlewareName) {
		return !!(this.middleware[middlewareName] || this.legacyMiddlewarePlaceholders.has(middlewareName));
	}
}

export default MiddlewareManager;
