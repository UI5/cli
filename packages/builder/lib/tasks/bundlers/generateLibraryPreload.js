import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:bundlers:generateLibraryPreload");
import moduleBundler from "../../processors/bundlers/moduleBundler.js";
import {applyDefaultsToBundleDefinition} from "./utils/applyDefaultsToBundleDefinition.js";
import {negateFilters} from "../../lbt/resources/ResourceFilterList.js";
import createModuleNameMapping from "./utils/createModuleNameMapping.js";

function getDefaultLibraryPreloadFilters(namespace, excludes) {
	const filters = [
		`${namespace}/`,
		`${namespace}/**/manifest.json`,
		`!${namespace}/**/*-preload.js`, // exclude all bundles
		`!${namespace}/designtime/`,
		`!${namespace}/**/*.designtime.js`,
		`!${namespace}/**/*.support.js`
	];

	if (Array.isArray(excludes)) {
		const allFilterExcludes = negateFilters(excludes);
		// Add configured excludes at the end of filter list
		allFilterExcludes.forEach((filterExclude) => {
			// Allow all excludes (!) and limit re-includes (+) to the library namespace
			if (filterExclude.startsWith("!") || filterExclude.startsWith(`+${namespace}/`)) {
				filters.push(filterExclude);
			} else {
				log.warn(`Configured preload exclude contains invalid re-include: !${filterExclude.substr(1)}. ` +
				`Re-includes must start with the library's namespace ${namespace}`);
			}
		});
	}

	return filters;
}

function getBundleDefinition(namespace, excludes) {
	// Note: This configuration is only used when no bundle definition in ui5.yaml exists (see "skipBundles" parameter)

	// TODO: Remove this hardcoded bundle definition once support for relevant versions has ended.
	// sap.ui.core ui5.yaml contains a configuration since UI5 1.103.0 (specVersion 2.4)
	// so this is still required to build UI5 versions <= 1.102.0 (such as 1.84 and 1.96)
	if (namespace === "sap/ui/core") {
		return {
			name: `${namespace}/library-preload.js`,
			sections: [
				{
					// exclude the content of sap-ui-core by declaring it as 'provided'
					mode: "provided",
					filters: [
						"ui5loader-autoconfig.js",
						"sap/ui/core/Core.js"
					],
					resolve: true
				},
				{
					mode: "preload",
					filters: [
						// Note: Don't pass configured preload excludes for sap.ui.core
						// as they are already hardcoded below.
						...getDefaultLibraryPreloadFilters(namespace),

						`!${namespace}/cldr/`,
						"*.js",
						"sap/base/",
						"sap/ui/base/",
						"sap/ui/dom/",
						"sap/ui/events/",
						"sap/ui/model/",
						"sap/ui/security/",
						"sap/ui/util/",
						"sap/ui/Global.js",

						// include only thirdparty that is very likely to be used
						"sap/ui/thirdparty/crossroads.js",
						"sap/ui/thirdparty/caja-html-sanitizer.js",
						"sap/ui/thirdparty/hasher.js",
						"sap/ui/thirdparty/signals.js",
						"sap/ui/thirdparty/jquery-mobile-custom.js",
						"sap/ui/thirdparty/jqueryui/jquery-ui-core.js",
						"sap/ui/thirdparty/jqueryui/jquery-ui-position.js",

						// other excludes (not required for productive scenarios)
						"!sap-ui-*.js",
						"!sap/ui/core/support/",
						"!sap/ui/core/plugin/DeclarativeSupport.js",
						"!sap/ui/core/plugin/LessSupport.js"

					],
					resolve: false,
					resolveConditional: false,
					renderer: true
				}
			]
		};
	}
	return {
		name: `${namespace}/library-preload.js`,
		sections: [
			{
				mode: "preload",
				filters: getDefaultLibraryPreloadFilters(namespace, excludes),
				resolve: false,
				resolveConditional: false,
				renderer: true
			}
		]
	};
}

function getDesigntimeBundleDefinition(namespace) {
	return {
		name: `${namespace}/designtime/library-preload.designtime.js`,
		sections: [
			{
				mode: "preload",
				filters: [
					`${namespace}/**/*.designtime.js`,
					`${namespace}/designtime/`,
					`!${namespace}/**/*-preload.designtime.js`,
					`!${namespace}/designtime/**/*.properties`,
					`!${namespace}/designtime/**/*.svg`,
					`!${namespace}/designtime/**/*.xml`
				],
				resolve: false,
				resolveConditional: false,
				renderer: false
			}
		]
	};
}

function getSupportFilesBundleDefinition(namespace) {
	return {
		name: `${namespace}/library-preload.support.js`,
		sections: [
			{
				mode: "preload",
				filters: [
					`${namespace}/**/*.support.js`,
					`!${namespace}/**/*-preload.support.js`
				],
				resolve: false,
				resolveConditional: false,
				renderer: false
			}
		]
	};
}

function getModuleBundlerOptions(config) {
	const moduleBundlerOptions = {};

	// required in sap-ui-core-nojQuery.js and sap-ui-core-nojQuery-dbg.js
	const providedSection = {
		mode: "provided",
		filters: [
			"jquery-ui-core.js",
			"jquery-ui-datepicker.js",
			"jquery-ui-position.js",
			"sap/ui/thirdparty/jquery.js",
			"sap/ui/thirdparty/jquery/*",
			"sap/ui/thirdparty/jqueryui/*"
		]
	};

	moduleBundlerOptions.bundleOptions = {
		optimize: config.preload,
		decorateBootstrapModule: config.preload,
		addTryCatchRestartWrapper: config.preload
	};

	moduleBundlerOptions.bundleDefinition = getSapUiCoreBunDef(config.name, config.filters, config.preload);

	if (config.provided) {
		moduleBundlerOptions.bundleDefinition.sections.unshift(providedSection);
	}

	if (config.moduleNameMapping) {
		moduleBundlerOptions.moduleNameMapping = config.moduleNameMapping;
	}

	return moduleBundlerOptions;
}

function getSapUiCoreBunDef(name, filters, preload) {
	const bundleDefinition = {
		name,
		sections: []
	};

	// add raw section
	bundleDefinition.sections.push({
		// include all 'raw' modules that are needed for the UI5 loader
		mode: "raw",
		filters,
		resolve: true, // dependencies for raw modules are taken from shims in .library files
		sort: true, // topological sort on raw modules is mandatory
		declareModules: false
	});

	if (preload) {
		// add preload section
		bundleDefinition.sections.push({
			mode: "preload",
			filters: [
				"sap/ui/core/Core.js"
			],
			resolve: true
		});
	}

	// add require section
	bundleDefinition.sections.push({
		mode: "require",
		filters: [
			"sap/ui/core/Core.js"
		]
	});

	return bundleDefinition;
}

/**
 * @public
 * @module @ui5/builder/tasks/bundlers/generateLibraryPreload
 */

/**
 * Task for library bundling.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string[]} [parameters.options.skipBundles] Names of bundles that should not be created
 * @param {string[]} [parameters.options.excludes=[]] List of modules declared as glob patterns (resource name patterns)
 * that should be excluded from the library-preload.js bundle.
 * A pattern ending with a slash '/' will, similarly to the use of a single '*' or double '**' asterisk,
 * denote an arbitrary number of characters or folder names.
 * Re-includes should be marked with a leading exclamation mark '!'. The order of filters is relevant; a later
 * inclusion overrides an earlier exclusion, and vice versa.
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, options: {skipBundles = [], excludes = [], projectName}}) {
	let nonDbgWorkspace = workspace;
	if (taskUtil) {
		nonDbgWorkspace = taskUtil.resourceFactory.createFilterReader({
			reader: workspace,
			callback: function(resource) {
				// Remove any debug variants
				return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
			}
		});
	}
	const coreVersion = taskUtil?.getProject("sap.ui.core")?.getVersion();
	const allowStringBundling = taskUtil?.getProject().getSpecVersion().lt("4.0");
	const execModuleBundlerIfNeeded = ({options, resources}) => {
		if (skipBundles.includes(options.bundleDefinition.name)) {
			log.verbose(`Skipping generation of bundle ${options.bundleDefinition.name}`);
			return null;
		}
		if (coreVersion) {
			options.targetUi5CoreVersion = coreVersion;
		}
		options.bundleDefinition = applyDefaultsToBundleDefinition(options.bundleDefinition, taskUtil);
		options.allowStringBundling = allowStringBundling;
		return moduleBundler({options, resources});
	};

	return nonDbgWorkspace.byGlob("/**/*.{js,json,xml,html,properties,library,js.map}").then(async (resources) => {
		// Find all libraries and create a library-preload.js bundle

		let p = Promise.resolve();

		// Create core bundles for older versions (<1.97.0) which don't define bundle configuration in the ui5.yaml
		// See: https://github.com/SAP/openui5/commit/ff127fd2d009162ea43ad312dec99d759ebc23a0
		if (projectName === "sap.ui.core") {
			// Instead of checking the sap.ui.core library version, the specVersion is checked against all versions
			// that have been defined for sap.ui.core before the bundle configuration has been introduced.
			// This is mainly to have an easier check without version parsing or using semver.
			// If no project/specVersion is available, the bundles should also be created to not break potential
			// existing use cases without a properly formed/formatted project tree.
			if (!taskUtil || taskUtil.getProject().getSpecVersion().lte("2.0")) {
				const isEvo = resources.find((resource) => {
					return resource.getPath() === "/resources/ui5loader.js";
				});

				let unoptimizedModuleNameMapping;
				let unoptimizedResources = resources;
				if (taskUtil) {
					const unoptimizedWorkspace = taskUtil.resourceFactory.createFilterReader({
						reader: workspace,
						callback: function(resource) {
							// Remove any non-debug variants
							return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.HasDebugVariant);
						}
					});
					unoptimizedResources =
						await unoptimizedWorkspace.byGlob("/**/*.{js,json,xml,html,properties,library,js.map}");

					unoptimizedModuleNameMapping = createModuleNameMapping({
						resources: unoptimizedResources,
						taskUtil
					});
				}

				let filters;
				if (isEvo) {
					filters = ["ui5loader-autoconfig.js"];
				} else {
					filters = ["jquery.sap.global.js"];
				}
				p = Promise.all([
					execModuleBundlerIfNeeded({
						options: getModuleBundlerOptions({name: "sap-ui-core.js", filters, preload: true}),
						resources
					}),
					execModuleBundlerIfNeeded({
						options: getModuleBundlerOptions({
							name: "sap-ui-core-dbg.js", filters, preload: false,
							moduleNameMapping: unoptimizedModuleNameMapping
						}),
						resources: unoptimizedResources
					}),
					execModuleBundlerIfNeeded({
						options: getModuleBundlerOptions({
							name: "sap-ui-core-nojQuery.js", filters, preload: true, provided: true
						}),
						resources
					}),
					execModuleBundlerIfNeeded({
						options: getModuleBundlerOptions({
							name: "sap-ui-core-nojQuery-dbg.js", filters, preload: false, provided: true,
							moduleNameMapping: unoptimizedModuleNameMapping
						}),
						resources: unoptimizedResources
					}),
				]).then((results) => {
					const bundles = Array.prototype.concat.apply([], results).filter(Boolean);
					return Promise.all(bundles.map(({bundle, sourceMap}) => {
						if (taskUtil) {
							taskUtil.setTag(bundle, taskUtil.STANDARD_TAGS.IsBundle);
							if (sourceMap) {
								// Clear tag that might have been set by the minify task, in cases where
								// the bundle name is identical to a source file
								taskUtil.clearTag(sourceMap, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
							}
						}
						const writes = [workspace.write(bundle)];
						if (sourceMap) {
							writes.push(workspace.write(sourceMap));
						}
						return Promise.all(writes);
					}));
				});
			}
		}

		return p.then(() => {
			return workspace.byGlob("/resources/**/.library").then((libraryIndicatorResources) => {
				if (libraryIndicatorResources.length > 0) {
					return libraryIndicatorResources;
				} else {
					// Fallback to "library.js" as library indicator
					log.verbose(
						`Could not find a ".library" file for project ${projectName}, ` +
						`falling back to "library.js".`);
					return workspace.byGlob("/resources/**/library.js");
				}
			}).then((libraryIndicatorResources) => {
				if (libraryIndicatorResources.length < 1) {
					// No library found - nothing to do
					log.verbose(
						`Could not find a ".library" or "library.js" file for project ${projectName}. ` +
						`Skipping library preload bundling.`);
					return;
				}

				return Promise.all(libraryIndicatorResources.map(async (libraryIndicatorResource) => {
					// Determine library namespace from library indicator file path
					// ending with either ".library" or "library.js" (see fallback logic above)
					// e.g. /resources/sap/foo/.library => sap/foo
					//      /resources/sap/bar/library.js => sap/bar
					const libraryNamespacePattern = /^\/resources\/(.*)\/(?:\.library|library\.js)$/;
					const libraryIndicatorPath = libraryIndicatorResource.getPath();
					const libraryNamespaceMatch = libraryIndicatorPath.match(libraryNamespacePattern);
					if (libraryNamespaceMatch && libraryNamespaceMatch[1]) {
						const libraryNamespace = libraryNamespaceMatch[1];
						const results = await Promise.all([
							execModuleBundlerIfNeeded({
								options: {
									bundleDefinition: getBundleDefinition(libraryNamespace, excludes),
									bundleOptions: {
										optimize: true,
										ignoreMissingModules: true
									}
								},
								resources
							}),
							execModuleBundlerIfNeeded({
								options: {
									bundleDefinition: getDesigntimeBundleDefinition(libraryNamespace),
									bundleOptions: {
										optimize: true,
										ignoreMissingModules: true,
										skipIfEmpty: true
									}
								},
								resources
							}),
							execModuleBundlerIfNeeded({
								options: {
									bundleDefinition: getSupportFilesBundleDefinition(libraryNamespace),
									bundleOptions: {
										optimize: false,
										ignoreMissingModules: true,
										skipIfEmpty: true
									}
									// Note: Although the bundle uses optimize=false, there is
									// no moduleNameMapping needed, as support files are excluded from minification.
								},
								resources
							})
						]);
						const bundles = Array.prototype.concat.apply([], results).filter(Boolean);
						return Promise.all(bundles.map(({bundle, sourceMap} = {}) => {
							if (bundle) {
								if (taskUtil) {
									taskUtil.setTag(bundle, taskUtil.STANDARD_TAGS.IsBundle);
									if (sourceMap) {
										// Clear tag that might have been set by the minify task, in cases where
										// the bundle name is identical to a source file
										taskUtil.clearTag(sourceMap,
											taskUtil.STANDARD_TAGS.OmitFromBuildResult);
									}
								}
								const writes = [workspace.write(bundle)];
								if (sourceMap) {
									writes.push(workspace.write(sourceMap));
								}
								return Promise.all(writes);
							}
						}));
					} else {
						log.verbose(
							`Could not determine library namespace from file "${libraryIndicatorPath}" ` +
							`for project ${projectName}. Skipping library preload bundling.`);
						return Promise.resolve();
					}
				}));
			});
		});
	});
}
