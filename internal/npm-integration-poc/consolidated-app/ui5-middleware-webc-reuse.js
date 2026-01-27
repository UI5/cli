/**
 * UI5 Custom Middleware: WebComponents Bundler (Reusing ui5-tooling-modules plugin)
 *
 * This middleware reuses the rollup-plugin-webcomponents.js from ui5-tooling-modules
 * to serve @ui5/webcomponents on-demand during development.
 */

import {rollup} from "rollup";
import {nodeResolve} from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {readFileSync} from "fs";
import {join, dirname} from "path";
import {fileURLToPath} from "url";
import {createRequire} from "module";

// Create require function for loading the webcomponents plugin
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the webcomponents plugin from ui5-tooling-modules
const webcomponentsPlugin = require("./node_modules/ui5-tooling-modules/lib/rollup-plugin-webcomponents.js");

// Load package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

// Cache for bundled modules
const bundleCache = new Map();

/**
 * Custom middleware entry point
 *
 * @param {object} parameters Parameters
 * @param {@ui5/logger/Logger} parameters.log Logger instance
 * @returns {Function} Middleware function to use
 */
export default function({log}) {
	const namespace = "com/example/app";
	const thirdpartyNamespace = "thirdparty";
	const webComponentsNamespace = "gen";

	const projectInfo = {
		name: "consolidated-app",
		namespace: namespace,
		pkgJson: packageJson,
		framework: {
			name: "SAPUI5",
			version: "1.120.0"
		}
	};

	const pluginOptions = {
		skip: false,
		scoping: true,
		scopeSuffix: "custom",
		enrichBusyIndicator: false,
		includeAssets: false,
		skipJSDoc: true,
		skipDtsGeneration: true,
		removeCLDRData: true,
		namespace: webComponentsNamespace
	};

	return async function(req, res, next) {
		log.info(`🌐 Request: ${req.path}`);

		// During dev server, requests come as /thirdparty/... or /gen/...
		// not /resources/com/example/app/thirdparty/...
		if (!req.path.startsWith(`/${webComponentsNamespace}/`) &&
			!req.path.startsWith(`/${thirdpartyNamespace}/`)) {
			return next();
		}

		log.info(`✅ Handling webcomponents request: ${req.path}`);

		// Extract module path (e.g., "gen/@ui5/webcomponents/dist/MessageStrip" or "thirdparty/@ui5/webcomponents/dist/MessageStrip")
		const modulePath = req.path.substring(1).replace(/\.js$/, ""); // Remove leading / and .js

		log.info(`📝 Module path: ${modulePath}`);

		try {
			let bundledCode = bundleCache.get(modulePath);

			if (!bundledCode) {
				log.info(`📦 Bundling webcomponent on-demand: ${modulePath}`);

				const $metadata = {};
				const emittedFiles = new Map();

				// Create the webcomponents plugin instance - matching ui5-tooling-modules
				const plugin = webcomponentsPlugin({
					log,
					resolveModule: (id) => {
						try {
							return require.resolve(id);
						} catch (e) {
							return null;
						}
					},
					projectInfo,
					getPackageJson: (packageJsonPath) => {
						try {
							return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
						} catch {
							return null;
						}
					},
					options: pluginOptions,
					thirdpartyNamespace,
					namespace,
					$metadata
				});

				// Bundle the requested webcomponent
				const bundle = await rollup({
					input: "@ui5/webcomponents/dist/MessageStrip.js",
					plugins: [
						nodeResolve({
							browser: true,
							preferBuiltins: false
						}),
						commonjs(),
						plugin,
						{
							name: "capture-emitted",
							generateBundle(options, bundle) {
								Object.keys(bundle).forEach((fileName) => {
									const item = bundle[fileName];
									if (item.type === "chunk" || item.type === "asset") {
										emittedFiles.set(fileName, item.code || item.source);
									}
								});
							}
						}
					],
					external: [
						/^sap\//
					]
				});

				// Generate the bundle
				const {output} = await bundle.generate({
					format: "amd",
					amd: {
						define: "sap.ui.define"
					}
				});

				// Cache all generated files with proper paths
				for (const chunk of output) {
					if (chunk.type === "chunk") {
						const fileName = chunk.fileName;

						if (fileName.startsWith("@ui5/webcomponents/dist/") ||
						fileName.startsWith("@ui5/webcomponents.") ||
						fileName.startsWith("@ui5/webcomponents-base.")) {
							// UI5 wrapper or package export - cache in gen/
							const cachePath = `${webComponentsNamespace}/${fileName}`.replace(/\.js$/, "");
							bundleCache.set(cachePath, chunk.code);

							// Package exports also need to be in thirdparty/
							if (fileName.startsWith("@ui5/webcomponents.") || fileName.startsWith("@ui5/webcomponents-base.")) {
								const thirdpartyCachePath = `${thirdpartyNamespace}/${fileName}`.replace(/\.js$/, "");
								bundleCache.set(thirdpartyCachePath, chunk.code);
							}
						} else {
							// Native webcomponent - cache in thirdparty/
							const cachePath = `${thirdpartyNamespace}/${fileName}`.replace(/\.js$/, "");
							bundleCache.set(cachePath, chunk.code);
						}
					}
				}

				for (const [fileName, code] of emittedFiles) {
					if (fileName.startsWith("@ui5/webcomponents/dist/") ||
						fileName.startsWith("@ui5/webcomponents.") ||
						fileName.startsWith("@ui5/webcomponents-base.")) {
						// UI5 wrapper or package export - cache in gen/
						const cachePath = `${webComponentsNamespace}/${fileName}`.replace(/\.js$/, "");
						bundleCache.set(cachePath, code);

						// Package exports also need to be in thirdparty/
						if (fileName.startsWith("@ui5/webcomponents.") || fileName.startsWith("@ui5/webcomponents-base.")) {
							const thirdpartyCachePath = `${thirdpartyNamespace}/${fileName}`.replace(/\.js$/, "");
							bundleCache.set(thirdpartyCachePath, code);
						}
					} else {
						// Native webcomponent - cache in thirdparty/
						const cachePath = `${thirdpartyNamespace}/${fileName}`.replace(/\.js$/, "");
						bundleCache.set(cachePath, code);
					}
				}

				// Generate thirdparty wrappers with absolute namespace paths
				log.info(`📊 Metadata controls: ${JSON.stringify(Object.keys($metadata.controls || {}))}`);

				for (const [moduleName] of Object.entries($metadata.controls || {})) {
					const wrapperPath = `${thirdpartyNamespace}/${moduleName}`.replace(/\.js$/, "");

					// Find the corresponding gen wrapper
					const genWrapperPath = `${webComponentsNamespace}/${moduleName}`.replace(/\.js$/, "");
					const genCode = bundleCache.get(genWrapperPath);

					log.info(`🔍 Looking for gen wrapper: ${genWrapperPath}, found: ${!!genCode}`);

					if (genCode) {
						// Transform relative paths to absolute namespace paths
						const thirdpartyCode = genCode
							.replace(/"\.\.\/..\/..\/@ui5\/webcomponents"/g, `"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents"`)
							.replace(/"\.\.\/..\/..\/@ui5\/webcomponents-base"/g, `"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents-base"`)
							.replace(/"\.\.\/..\/..\//g, `"${namespace}/${thirdpartyNamespace}/`)
							// Update qualified names to include thirdparty namespace
							.replace(/@ui5\.webcomponents/g, `${namespace.replace(/\//g, ".")}.${thirdpartyNamespace}.@ui5.webcomponents`)
							.replace(/namespace:"@ui5\/webcomponents"/g, `namespace:"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents"`)
							.replace(/qualifiedNamespace:"@ui5\.webcomponents"/g, `qualifiedNamespace:"${namespace.replace(/\//g, ".")}.${thirdpartyNamespace}.@ui5.webcomponents"`);

						bundleCache.set(wrapperPath, thirdpartyCode);
						log.info(`✅ Generated thirdparty wrapper: ${wrapperPath}`);
					}
				}

				bundledCode = bundleCache.get(modulePath);

				log.info(`🔍 All cached keys: ${JSON.stringify(Array.from(bundleCache.keys()))}`);
				log.info(`🔍 Looking for: ${modulePath}, found: ${!!bundledCode}`);

				if (bundledCode) {
					log.info(`✅ Bundled and cached: ${modulePath}`);
				} else {
					log.warn(`⚠️ Module not found in bundle output: ${modulePath}`);
					return next();
				}
			} else {
				log.info(`📋 Serving from cache: ${modulePath}`);
			}

			res.setHeader("Content-Type", "application/javascript");
			res.end(bundledCode);
		} catch (error) {
			log.error(`❌ Error bundling ${modulePath}: ${error.message}`);
			log.error(error.stack);
			next(error);
		}
	};
}
