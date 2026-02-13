/**
 * UI5 Custom Task: WebComponents & NPM Modules Bundler (Standalone Plugin)
 *
 * Bundles:
 * 1. @ui5/webcomponents using rollup-plugin-ui5-webcomponents.js
 * 2. NPM dependencies from package.json using shared Rollup config
 *
 * Output: /resources/thirdparty/<module-name>.js
 */

import {readFile} from "fs/promises";
import {join, dirname} from "path";
import {fileURLToPath} from "url";

import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";
import {WebComponentsBundler} from "../lib/core/webcomponents-bundler.js";
import {WorkspaceWriter} from "../lib/core/output-writer.js";
import {PathResolver} from "../lib/utils/path-resolver.js";
import {DEFAULT_CONFIG, createPluginOptions, createBundlerOptions} from "../lib/config/standalone-config.js";
import {createRollupConfig, generateAMDBundle} from "../scenarios/shared-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * NPM packages to exclude from bundling (UI5 internal, dev deps, tooling)
 */
const EXCLUDED_PACKAGES = [
	"ui5-tooling-modules",
	"@ui5/webcomponents",       // Handled separately by WebComponents bundler
	"@ui5/webcomponents-base",
	"@ui5/webcomponents-theming",
	"@ui5/webcomponents-icons"
];

/**
 * Read and parse package.json dependencies
 *
 * @returns {Promise<string[]>} List of dependency names to bundle
 */
async function getPackageDependencies() {
	const packageJsonPath = join(__dirname, "package.json");
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

	const dependencies = Object.keys(packageJson.dependencies || {});

	// Filter out excluded packages
	return dependencies.filter((dep) => !EXCLUDED_PACKAGES.includes(dep));
}

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
	log.info("Running WebComponents & NPM Modules bundler task...");

	const {resourceFactory} = taskUtil;
	const $metadata = {};

	try {
		// ========== 1. Bundle WebComponents ==========
		log.info("📦 Phase 1: Bundling WebComponents...");

		const plugin = ui5WebComponentsPlugin(createPluginOptions(log, $metadata));
		const pathResolver = new PathResolver(
			DEFAULT_CONFIG.namespace,
			DEFAULT_CONFIG.thirdpartyNamespace
		);
		const workspaceWriter = new WorkspaceWriter(pathResolver, workspace, resourceFactory);
		const bundler = new WebComponentsBundler(createBundlerOptions(log, plugin));

		const output = await bundler.bundle("@ui5/webcomponents/dist/MessageStrip.js");
		await bundler.processOutput(output, workspaceWriter, $metadata);

		log.info("✅ WebComponents bundled successfully");

		// ========== 2. Bundle NPM Packages ==========
		log.info("📦 Phase 2: Bundling NPM packages from package.json...");

		const dependencies = await getPackageDependencies();
		log.info(`  Found ${dependencies.length} dependencies to bundle: ${dependencies.join(", ")}`);

		for (const packageName of dependencies) {
			try {
				// Reuse shared Rollup config and AMD generator (DRY)
				const config = createRollupConfig(packageName);
				const code = await generateAMDBundle(config);

				// Sanitize package name for path (handle scoped packages)
				const sanitizedName = packageName.replace(/^@/, "").replace(/\//g, "-");
				const outputPath = `/resources/thirdparty/${sanitizedName}.js`;

				const resource = resourceFactory.createResource({
					path: outputPath,
					string: code
				});

				await workspace.write(resource);
				log.info(`  ✅ ${packageName} → ${outputPath} (${(code.length / 1024).toFixed(1)} KB)`);
			} catch (error) {
				log.error(`  ❌ Failed to bundle ${packageName}: ${error.message}`);
			}
		}

		log.info("✅ All NPM packages bundled successfully");
	} catch (error) {
		log.error(`❌ Error in bundler task: ${error.message}`);
		log.error(error.stack);
		throw error;
	}
}
