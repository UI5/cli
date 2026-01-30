/**
 * Scenario 3: UI5 Web Components - Standalone Plugin Integration
 *
 * Demonstrates the standalone plugin approach for bundling @ui5/webcomponents
 * Uses the custom rollup-plugin-ui5-webcomponents.js with metadata extraction
 */

import {mkdir, writeFile} from "fs/promises";
import path from "path";
import {fileURLToPath} from "url";
import {
	createRollupConfig,
	generateAMDBundleWithOutput,
	printScenarioHeader
} from "./shared-config.js";
import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";
import {DEFAULT_CONFIG, createPluginOptions} from "../lib/config/standalone-config.js";
import {ThirdpartyGenerator} from "../lib/utils/thirdparty-generator.js";
import {PathResolver} from "../lib/utils/path-resolver.js";

const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/03-webcomponents-integration");

printScenarioHeader(3, "UI5 Web Components - Standalone Plugin", "Complex WebComponents with custom plugin");

async function bundleWebComponents() {
	console.log("\n📦 Bundling @ui5/webcomponents/dist/MessageStrip.js...\n");

	const $metadata = {};

	try {
		// Create plugin with metadata collection
		const plugin = ui5WebComponentsPlugin(createPluginOptions(console, $metadata));

		// Use shared configuration (DRY principle)
		const config = createRollupConfig(
			"@ui5/webcomponents/dist/MessageStrip.js",
			[plugin],
			{external: [/^sap\//]}
		);

		// Generate bundle with full output (needed for chunks)
		const output = await generateAMDBundleWithOutput(config);

		console.log("\n✅ Bundle generated successfully!\n");

		// Show output info
		for (const chunk of output) {
			if (chunk.type === "chunk") {
				console.log(`📦 Chunk: ${chunk.fileName} (${(chunk.code.length / 1024).toFixed(2)} KB)`);
			}
		}

		if ($metadata.controls) {
			console.log("\n🎨 Detected Controls:");
			for (const [, controlMeta] of Object.entries($metadata.controls)) {
				const {componentName, ui5Metadata} = controlMeta;
				console.log(`   - ${componentName}`);
				console.log(`     Tag: ${ui5Metadata.tag}`);
				console.log(`     Properties: ${Object.keys(ui5Metadata.properties).length}`);
				console.log(`     Events: ${Object.keys(ui5Metadata.events).length}`);
			}
		}

		if ($metadata.packages) {
			console.log("\n📦 Package Exports:");
			for (const [fileName, packageMeta] of Object.entries($metadata.packages)) {
				console.log(`   - ${fileName} (${packageMeta.packageName} v${packageMeta.version})`);
			}
		}

		console.log("\n✨ Standalone plugin integration successful!");
		console.log("   Generated single-namespace structure:");
		console.log(`   - ${DEFAULT_CONFIG.thirdpartyNamespace}/ namespace: Native bundles (AMD-wrapped)`);
		console.log(`   - ${DEFAULT_CONFIG.thirdpartyNamespace}/@ui5/webcomponents/dist/: UI5 control wrappers`);
		console.log(`   - ${DEFAULT_CONFIG.thirdpartyNamespace}/@ui5/webcomponents.js: Package export`);
		console.log("   All files use absolute paths for application use");

		// Write all outputs
		await mkdir(outputDir, {recursive: true});
		console.log("\n💾 Writing files to disk:");

		// Write chunks (native bundles)
		for (const item of output) {
			if (item.type === "chunk") {
				const filePath = path.join(outputDir, item.fileName);
				await mkdir(path.dirname(filePath), {recursive: true});
				await writeFile(filePath, item.code, "utf-8");
				console.log(`   ✅ ${item.fileName}`);
			}
		}

		// Generate UI5 control wrappers and package exports
		const pathResolver = new PathResolver(DEFAULT_CONFIG.namespace, DEFAULT_CONFIG.thirdpartyNamespace);
		const thirdpartyGenerator = new ThirdpartyGenerator(pathResolver);

		// Write UI5 control wrappers
		if ($metadata.controls && Object.keys($metadata.controls).length > 0) {
			console.log("\n📝 Generating UI5 control wrappers:");
			const controlWrappers = thirdpartyGenerator.generateControlWrappers($metadata, null);
			for (const [wrapperPath, wrapperCode] of controlWrappers) {
				const filePath = path.join(outputDir, wrapperPath + ".js");
				await mkdir(path.dirname(filePath), {recursive: true});
				await writeFile(filePath, wrapperCode, "utf-8");
				console.log(`   ✅ ${wrapperPath}.js`);
			}
		}

		// Write package exports
		if ($metadata.packages && Object.keys($metadata.packages).length > 0) {
			console.log("\n📝 Generating package exports:");
			const packageExports = thirdpartyGenerator.generatePackageExports($metadata, null);
			for (const [exportPath, exportCode] of packageExports) {
				const filePath = path.join(outputDir, exportPath + ".js");
				await mkdir(path.dirname(filePath), {recursive: true});
				await writeFile(filePath, exportCode, "utf-8");
				console.log(`   ✅ ${exportPath}.js`);
			}
		}

		console.log(`\n📁 Output directory: ${outputDir}`);

		return output;
	} catch (error) {
		console.error("\n❌ Error:", error.message);
		console.error(error.stack);
		throw error;
	}
}

bundleWebComponents();

