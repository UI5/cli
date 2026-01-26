/**
 * UI5 Custom Task: WebComponents Bundler (Standalone Plugin)
 *
 * Uses the custom standalone rollup-plugin-ui5-webcomponents.js
 * to bundle @ui5/webcomponents during the build process.
 */

import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";
import {WebComponentsBundler} from "../lib/core/webcomponents-bundler.js";
import {WorkspaceWriter} from "../lib/core/output-writer.js";
import {PathResolver} from "../lib/utils/path-resolver.js";
import {DEFAULT_CONFIG, createPluginOptions, createBundlerOptions} from "../lib/config/standalone-config.js";

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
	log.info("Running WebComponents bundler task (standalone plugin)...");

	const {resourceFactory} = taskUtil;
	const $metadata = {};

	try {
		// Create plugin instance
		const plugin = ui5WebComponentsPlugin(createPluginOptions(log, $metadata));

		// Create path resolver
		const pathResolver = new PathResolver(
			DEFAULT_CONFIG.namespace,
			DEFAULT_CONFIG.thirdpartyNamespace
		);

		// Create workspace writer
		const workspaceWriter = new WorkspaceWriter(pathResolver, workspace, resourceFactory);

		// Create bundler instance
		const bundler = new WebComponentsBundler(createBundlerOptions(log, plugin));

		// Bundle the MessageStrip webcomponent
		const output = await bundler.bundle("@ui5/webcomponents/dist/MessageStrip.js");

		// Process output and write to workspace
		await bundler.processOutput(output, workspaceWriter, $metadata);

		log.info("✅ WebComponents bundled successfully using standalone plugin");
	} catch (error) {
		log.error(`❌ Error bundling WebComponents: ${error.message}`);
		log.error(error.stack);
		throw error;
	}
}
