/**
 * UI5 Custom Task: WebComponents Bundler (Reusing ui5-tooling-modules plugin)
 *
 * This task reuses the rollup-plugin-webcomponents.js from ui5-tooling-modules
 * to bundle @ui5/webcomponents during the build process.
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

/**
 * Custom task entry point
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.workspace Workspace
 * @param {@ui5/logger/Logger} parameters.log Logger instance
 * @param {object} parameters.taskUtil TaskUtil instance
 * @param {object} parameters.options Options
 * @returns {Promise<undefined>} Promise resolving when task is complete
 */
export default async function({workspace, log, taskUtil}) {
	log.info("Running WebComponents bundler task (reusing ui5-tooling-modules plugin)...");

	const {resourceFactory} = taskUtil;
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

	// Configuration for the webcomponents plugin - matching ui5-tooling-modules
	const pluginOptions = {
		skip: false,
		scoping: true,
		scopeSuffix: "custom",
		enrichBusyIndicator: false,
		includeAssets: false,
		skipJSDoc: true,
		skipDtsGeneration: true,
		removeCLDRData: true,
		namespace: webComponentsNamespace,
		thirdpartyNamespace: thirdpartyNamespace
	};

	const $metadata = {};
	const emittedFiles = [];

	try {
		// Create the webcomponents plugin instance - matching ui5-tooling-modules configuration
		const plugin = webcomponentsPlugin({
			log,
			resolveModule: (id) => {
				try {
					return require.resolve(id);
				} catch {
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

		// Bundle the MessageStrip webcomponent
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
					name: "capture-emitted-files",
					generateBundle(options, bundle) {
						// Capture files that the webcomponents plugin emits
						Object.keys(bundle).forEach((fileName) => {
							if (bundle[fileName].type === "chunk" || bundle[fileName].type === "asset") {
								emittedFiles.push({
									fileName,
									source: bundle[fileName].code || bundle[fileName].source
								});
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

		// Write files to workspace using UI5 build API (will only appear in dist/)
		// The plugin emits files, we need to organize them into gen/ and thirdparty/
		for (const file of emittedFiles) {
			const fileName = file.fileName;

			// UI5 control wrappers go to gen/
			// Native webcomponents and chunks go to thirdparty/
			if (fileName.startsWith("@ui5/webcomponents/dist/") ||
				fileName.startsWith("@ui5/webcomponents.") ||
				fileName.startsWith("@ui5/webcomponents-base.")) {
				// UI5 wrapper or package export - goes to gen/
				const resourcePath = `/resources/${namespace}/${webComponentsNamespace}/${fileName}`;
				const resource = resourceFactory.createResource({
					path: resourcePath,
					string: file.source
				});
				await workspace.write(resource);
				log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);

				// Package exports also need to go to thirdparty/ for thirdparty wrappers to work
				if (fileName.startsWith("@ui5/webcomponents.") || fileName.startsWith("@ui5/webcomponents-base.")) {
					const thirdpartyResourcePath = `/resources/${namespace}/${thirdpartyNamespace}/${fileName}`;
					const thirdpartyResource = resourceFactory.createResource({
						path: thirdpartyResourcePath,
						string: file.source
					});
					await workspace.write(thirdpartyResource);
					log.info(`✅ Generated: ${thirdpartyResourcePath.replace("/resources/", "")}`);
				}
			} else {
				// Native webcomponent chunk or base file - goes to thirdparty/
				const resourcePath = `/resources/${namespace}/${thirdpartyNamespace}/${fileName}`;
				const resource = resourceFactory.createResource({
					path: resourcePath,
					string: file.source
				});
				await workspace.write(resource);
				log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);
			}
		}

		// Write main bundle chunks
		for (const chunk of output) {
			if (chunk.type === "chunk") {
				const fileName = chunk.fileName;

				// UI5 control wrappers go to gen/, everything else to thirdparty/
				if (fileName.startsWith("@ui5/webcomponents/dist/") ||
					fileName.startsWith("@ui5/webcomponents.") ||
					fileName.startsWith("@ui5/webcomponents-base.")) {
					const resourcePath = `/resources/${namespace}/${webComponentsNamespace}/${fileName}`;
					const resource = resourceFactory.createResource({
						path: resourcePath,
						string: chunk.code
					});
					await workspace.write(resource);
					log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);

					// Package exports also to thirdparty/
					if (fileName.startsWith("@ui5/webcomponents.") || fileName.startsWith("@ui5/webcomponents-base.")) {
						const thirdpartyResourcePath = `/resources/${namespace}/${thirdpartyNamespace}/${fileName}`;
						const thirdpartyResource = resourceFactory.createResource({
							path: thirdpartyResourcePath,
							string: chunk.code
						});
						await workspace.write(thirdpartyResource);
						log.info(`✅ Generated: ${thirdpartyResourcePath.replace("/resources/", "")}`);
					}
				} else {
					const resourcePath = `/resources/${namespace}/${thirdpartyNamespace}/${fileName}`;
					const resource = resourceFactory.createResource({
						path: resourcePath,
						string: chunk.code
					});
					await workspace.write(resource);
					log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);
				}
			}
		}

		// Create thirdparty wrappers with absolute namespace paths (matching ui5-tooling-modules behavior)
		// These are needed because the view uses com.example.app.thirdparty namespace
		for (const [moduleName] of Object.entries($metadata.controls || {})) {
			const wrapperPath = `${thirdpartyNamespace}/${moduleName}.js`;

			// Find the corresponding gen wrapper
			const genWrapperFileName = `${moduleName}.js`;
			const genWrapper = emittedFiles.find((f) => f.fileName === genWrapperFileName) ||
				output.find((c) => c.fileName === genWrapperFileName);

			if (genWrapper) {
				const genCode = genWrapper.source || genWrapper.code;

				// Transform relative paths to absolute namespace paths
				const thirdpartyCode = genCode
					.replace(/"\.\.\/..\/..\/@ui5\/webcomponents"/g, `"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents"`)
					.replace(/"\.\.\/..\/..\/@ui5\/webcomponents-base"/g, `"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents-base"`)
					.replace(/"\.\.\/..\/..\//g, `"${namespace}/${thirdpartyNamespace}/`)
					// Update qualified names to include thirdparty namespace
					.replace(/@ui5\.webcomponents/g, `${namespace.replace(/\//g, ".")}.${thirdpartyNamespace}.@ui5.webcomponents`)
					.replace(/namespace:"@ui5\/webcomponents"/g, `namespace:"${namespace}/${thirdpartyNamespace}/@ui5/webcomponents"`)
					.replace(/qualifiedNamespace:"@ui5\.webcomponents"/g, `qualifiedNamespace:"${namespace.replace(/\//g, ".")}.${thirdpartyNamespace}.@ui5.webcomponents"`);

				const resourcePath = `/resources/${namespace}/${wrapperPath}`;
				const resource = resourceFactory.createResource({
					path: resourcePath,
					string: thirdpartyCode
				});
				await workspace.write(resource);
				log.info(`✅ Generated thirdparty wrapper: ${resourcePath.replace("/resources/", "")}`);
			}
		}

		log.info("✅ WebComponents bundled successfully using ui5-tooling-modules plugin");
		log.info(`   Metadata: ${JSON.stringify($metadata, null, 2)}`);
	} catch (error) {
		log.error(`❌ Error bundling WebComponents: ${error.message}`);
		log.error(error.stack);
		throw error;
	}
};
