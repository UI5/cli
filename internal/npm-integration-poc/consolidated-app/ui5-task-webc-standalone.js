/**
 * UI5 Custom Task: WebComponents & NPM Modules Bundler (Standalone Plugin)
 *
 * Output: /resources/thirdparty/<module-name>.js
 */

import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";
import {WebComponentsBundler} from "../lib/core/webcomponents-bundler.js";
import {WorkspaceWriter} from "../lib/core/output-writer.js";
import {PathResolver} from "../lib/utils/path-resolver.js";
import {DEFAULT_CONFIG, createPluginOptions, createBundlerOptions} from "../lib/config/standalone-config.js";
import {createRollupConfig, generateAMDBundle} from "../scenarios/shared-config.js";
import {
	SCAN_RESULT,
	getBundleOrder,
	getExternals,
	getPathsMapping,
	sanitizePackageName,
	createProductionPlugin
} from "./bundler-config.js";

/**
 * Custom task entry point
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.workspace Workspace
 * @param {@ui5/logger/Logger} parameters.log Logger instance
 * @param {object} parameters.taskUtil TaskUtil instance
 * @returns {Promise<undefined>} Promise resolving when task is complete
 */
export default async function({workspace, log, taskUtil}) {
	log.info("Running WebComponents & NPM Modules bundler task...");

	const {resourceFactory} = taskUtil;
	const $metadata = {};
	const productionPlugin = createProductionPlugin();

	try {
		// ========== 1. Bundle WebComponents ==========
		log.info("📦 Phase 1: Bundling WebComponents...");

		const plugin = ui5WebComponentsPlugin(createPluginOptions(log, $metadata));
		const pathResolver = new PathResolver(DEFAULT_CONFIG.namespace, DEFAULT_CONFIG.thirdpartyNamespace);
		const workspaceWriter = new WorkspaceWriter(pathResolver, workspace, resourceFactory);
		const bundler = new WebComponentsBundler(createBundlerOptions(log, plugin));

		const output = await bundler.bundle("@ui5/webcomponents/dist/MessageStrip.js");
		await bundler.processOutput(output, workspaceWriter, $metadata);
		log.info("✅ WebComponents bundled successfully");

		// ========== 2. Bundle NPM Packages from Scan Result ==========
		log.info("📦 Phase 2: Bundling NPM packages from scan result...");

		const bundleOrder = getBundleOrder();
		log.info(`  Bundle order: ${bundleOrder.join(" → ")}`);

		for (const packageName of bundleOrder) {
			const scanInfo = SCAN_RESULT[packageName];
			const externals = getExternals(packageName);
			const paths = getPathsMapping(packageName);
			const outputName = scanInfo.outputName || sanitizePackageName(packageName);
			const outputPath = `/resources/thirdparty/${outputName}.js`;

			try {
				// Use first entry point (packages typically have one main entry)
				const entryPoint = scanInfo.entryPoints[0];
				const config = createRollupConfig(entryPoint, [productionPlugin], {
					external: externals.length > 0 ? externals : undefined
				});

				const outputOptions = {
					...scanInfo.outputOptions,
					...(Object.keys(paths).length > 0 ? {paths} : {})
				};

				const code = await generateAMDBundle(config, outputOptions);
				await workspace.write(resourceFactory.createResource({path: outputPath, string: code}));

				const externalsInfo = externals.length > 0 ? ` [ext: ${externals.join(", ")}]` : "";
				log.info(`  ✅ ${packageName} → ${outputPath} (${(code.length / 1024).toFixed(1)} KB)${externalsInfo}`);
			} catch (error) {
				log.error(`  ❌ Failed to bundle ${packageName}: ${error.message}`);
			}
		}

		log.info("✅ All packages bundled successfully");
	} catch (error) {
		log.error(`❌ Error in bundler task: ${error.message}`);
		log.error(error.stack);
		throw error;
	}
}
