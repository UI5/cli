/**
 * Scenario 3: UI5 Web Components - Standalone Plugin Integration
 *
 * Demonstrates the standalone plugin approach for bundling @ui5/webcomponents
 * Uses the custom rollup-plugin-ui5-webcomponents.js with metadata extraction
 *
 * Compares: Custom Rollup bundler vs ui5-tooling-modules
 * Note: Both have specialized WebComponents handling!
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
import {
	bundleWithUI5ToolingModules,
	writeUI5ToolingOutput
} from "../lib/utils/ui5-tooling-modules-bundler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO_NAME = "03-webcomponents-integration";
const WEB_COMPONENT = "@ui5/webcomponents/dist/MessageStrip.js";

printScenarioHeader(3, "UI5 Web Components - Standalone Plugin", "Complex WebComponents bundling\nCompares: Custom Rollup vs ui5-tooling-modules");

/**
 * Custom Rollup with WebComponents plugin
 */
async function bundleWithCustomRollup() {
	console.log("\n🔧 Custom Rollup Bundler (WebComponents plugin):");
	const startTime = Date.now();
	const outputDir = path.join(__dirname, `../dist/${SCENARIO_NAME}/custom`);

	const $metadata = {};
	const plugin = ui5WebComponentsPlugin(createPluginOptions(console, $metadata));

	const config = createRollupConfig(WEB_COMPONENT, [plugin], {external: [/^sap\//]});
	const output = await generateAMDBundleWithOutput(config);

	// Write chunks
	await mkdir(outputDir, {recursive: true});
	let totalSize = 0;
	const files = [];

	for (const item of output) {
		if (item.type === "chunk") {
			const filePath = path.join(outputDir, item.fileName);
			await mkdir(path.dirname(filePath), {recursive: true});
			await writeFile(filePath, item.code, "utf-8");
			totalSize += item.code.length;
			files.push({name: item.fileName, size: item.code.length});
			console.log(`   ✅ ${item.fileName} (${(item.code.length / 1024).toFixed(2)} KB)`);
		}
	}

	// Generate wrappers
	const pathResolver = new PathResolver(DEFAULT_CONFIG.namespace, DEFAULT_CONFIG.thirdpartyNamespace);
	const thirdpartyGenerator = new ThirdpartyGenerator(pathResolver);

	if ($metadata.controls && Object.keys($metadata.controls).length > 0) {
		const controlWrappers = thirdpartyGenerator.generateControlWrappers($metadata, null);
		for (const [wrapperPath, wrapperCode] of controlWrappers) {
			const filePath = path.join(outputDir, wrapperPath + ".js");
			await mkdir(path.dirname(filePath), {recursive: true});
			await writeFile(filePath, wrapperCode, "utf-8");
			totalSize += wrapperCode.length;
			files.push({name: wrapperPath + ".js", size: wrapperCode.length, type: "wrapper"});
			console.log(`   ✅ ${wrapperPath}.js (wrapper)`);
		}
	}

	if ($metadata.packages && Object.keys($metadata.packages).length > 0) {
		const packageExports = thirdpartyGenerator.generatePackageExports($metadata, null);
		for (const [exportPath, exportCode] of packageExports) {
			const filePath = path.join(outputDir, exportPath + ".js");
			await mkdir(path.dirname(filePath), {recursive: true});
			await writeFile(filePath, exportCode, "utf-8");
			totalSize += exportCode.length;
			files.push({name: exportPath + ".js", size: exportCode.length, type: "package"});
			console.log(`   ✅ ${exportPath}.js (package)`);
		}
	}

	const duration = Date.now() - startTime;
	console.log(`   Total: ${files.length} files, ${(totalSize / 1024).toFixed(2)} KB - ${duration}ms`);

	// Show detected controls
	if ($metadata.controls) {
		console.log(`   🎨 Controls: ${Object.keys($metadata.controls).join(", ")}`);
	}

	return {files, totalSize, duration, metadata: $metadata};
}

/**
 * ui5-tooling-modules (has built-in WebComponents support)
 */
async function bundleWithUI5Tooling() {
	console.log("\n📦 ui5-tooling-modules (WebComponents mode):");
	const startTime = Date.now();

	// ui5-tooling-modules has WebComponents support via pluginOptions
	const bundleInfo = await bundleWithUI5ToolingModules([WEB_COMPONENT], {
		pluginOptions: {
			webcomponents: {
				force: true // Force WebComponents transformation
			}
		}
	});

	const files = await writeUI5ToolingOutput(SCENARIO_NAME, bundleInfo);
	const duration = Date.now() - startTime;
	const totalSize = files.reduce((sum, f) => sum + f.size, 0);

	for (const file of files) {
		const typeStr = file.type !== "module" ? ` (${file.type})` : "";
		console.log(`   ✅ ${file.name}.js (${(file.size / 1024).toFixed(2)} KB)${typeStr}`);
	}
	console.log(`   Total: ${files.length} files, ${(totalSize / 1024).toFixed(2)} KB - ${duration}ms`);

	return {files, totalSize, duration, bundleInfo};
}

async function run() {
	console.log(`\n   Component: ${WEB_COMPONENT}`);

	try {
		const [customResult, ui5Result] = await Promise.all([
			bundleWithCustomRollup(),
			bundleWithUI5Tooling()
		]);

		console.log("\n" + "═".repeat(60));
		console.log("📊 COMPARISON SUMMARY");
		console.log("═".repeat(60));

		console.log("\n📁 Output locations:");
		console.log(`   Custom:           dist/${SCENARIO_NAME}/custom/`);
		console.log(`   ui5-tooling:      dist/${SCENARIO_NAME}/ui5-tooling-modules/`);

		console.log("\n📏 Size comparison:");
		console.log(`   Custom:           ${(customResult.totalSize / 1024).toFixed(2)} KB (${customResult.files.length} files)`);
		console.log(`   ui5-tooling:      ${(ui5Result.totalSize / 1024).toFixed(2)} KB (${ui5Result.files.length} files)`);

		console.log("\n⏱️  Build time:");
		console.log(`   Custom:           ${customResult.duration}ms`);
		console.log(`   ui5-tooling:      ${ui5Result.duration}ms`);

		console.log("\n🎨 WebComponents handling:");
		console.log("   Custom:           Custom plugin with metadata extraction");
		console.log("   ui5-tooling:      Built-in Seamless WebComponents support");

		console.log("\n💾 Saved to: dist/" + SCENARIO_NAME + "/");
	} catch (error) {
		console.error("❌ Error:", error.message);
		throw error;
	}
}

run();
