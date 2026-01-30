/**
 * Shared Rollup Configuration for Scenarios
 *
 * Common bundling setup to reduce duplication across scenarios
 */

import {rollup} from "rollup";
import {nodeResolve} from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import nodePolyfills from "rollup-plugin-polyfill-node";
import {mkdir, writeFile} from "fs/promises";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import ui5AmdExportsPlugin from "../lib/plugins/rollup-plugin-ui5-amd-exports.js";
import {
	bundleWithUI5ToolingModules,
	writeUI5ToolingOutput,
	getMainBundleCode
} from "../lib/utils/ui5-tooling-modules-bundler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Base rollup configuration
 *
 * @param input
 * @param extraPlugins
 * @param options Additional rollup options (e.g., external)
 */
export function createRollupConfig(input, extraPlugins = [], options = {}) {
	return {
		input,
		plugins: [
			nodeResolve({
				browser: true,
				preferBuiltins: false
			}),
			commonjs({
				transformMixedEsModules: true
			}),
			nodePolyfills(),
			...extraPlugins
		],
		...options
	};
}

/**
 * Generate AMD bundle
 *
 * @param config
 */
export async function generateAMDBundle(config) {
	const bundle = await rollup(config);

	const {output} = await bundle.generate({
		format: "amd",
		amd: {
			define: "sap.ui.define"
		},
		plugins: [ui5AmdExportsPlugin()]
	});

	return output[0].code;
}

/**
 * Generate AMD bundle with full output (for multi-chunk scenarios)
 *
 * @param config
 * @returns {Promise<Array>} Full output array with all chunks
 */
export async function generateAMDBundleWithOutput(config) {
	const bundle = await rollup(config);

	const {output} = await bundle.generate({
		format: "amd",
		amd: {
			define: "sap.ui.define"
		},
		plugins: [ui5AmdExportsPlugin()]
	});

	return output;
}

/**
 * Write output to scenario dist folder
 *
 * @param scenarioNumber
 * @param fileName
 * @param code
 */
export async function writeScenarioOutput(scenarioNumber, fileName, code) {
	const outputDir = join(__dirname, `../dist/${scenarioNumber}`);
	await mkdir(outputDir, {recursive: true});

	const outputFile = join(outputDir, fileName);
	await writeFile(outputFile, code, "utf-8");

	return outputFile;
}

/**
 * Print bundle info
 *
 * @param code
 * @param packageName
 * @param format
 */
export function printBundleInfo(code, packageName, format = "AMD") {
	console.log("✅ Bundle generated successfully!");
	console.log(`   Package: ${packageName}`);
	console.log(`   Size: ${(code.length / 1024).toFixed(2)} KB`);
	console.log(`   Format: ${format} (UI5-compatible)`);
	console.log(`\n📝 First 200 characters:\n${code.substring(0, 200)}...`);
}

/**
 * Print scenario header
 *
 * @param number
 * @param title
 * @param description
 */
export function printScenarioHeader(number, title, description) {
	console.log("=".repeat(60));
	console.log(`SCENARIO ${number}: ${title}`);
	console.log(description);
	console.log("=".repeat(60));
}

/**
 * Run dual bundling - both Custom Rollup and ui5-tooling-modules in parallel
 *
 * @param {object} options Configuration
 * @param {string} options.scenarioName Scenario folder name (e.g., "01-esm-integration")
 * @param {string|string[]} options.packageNames Package(s) to bundle
 * @param {Function} options.customBundler Custom bundler function (receives packageName, returns code)
 * @param {object} options.ui5Options Options for ui5-tooling-modules
 * @returns {Promise<object>} Results from both bundlers
 */
export async function runDualBundling({
	scenarioName,
	packageNames,
	customBundler,
	ui5Options = {}
}) {
	const packages = Array.isArray(packageNames) ? packageNames : [packageNames];

	// Custom bundler
	const customBundlerTask = async () => {
		console.log("\n🔧 Custom Rollup Bundler:");
		const startTime = Date.now();
		const results = [];

		for (const pkg of packages) {
			const code = await customBundler(pkg);
			const outputDir = join(__dirname, `../dist/${scenarioName}/custom`);
			await mkdir(outputDir, {recursive: true});

			const fileName = pkg.replace(/\//g, "_").replace(/@/g, "") + ".js";
			await writeFile(join(outputDir, fileName), code, "utf-8");

			results.push({name: pkg, fileName, size: code.length, code});
			console.log(`   ✅ ${fileName} (${(code.length / 1024).toFixed(2)} KB)`);
		}

		const duration = Date.now() - startTime;
		console.log(`   Duration: ${duration}ms`);
		return {results, duration, totalSize: results.reduce((sum, r) => sum + r.size, 0)};
	};

	// UI5-tooling-modules bundler
	const ui5BundlerTask = async () => {
		console.log("\n📦 ui5-tooling-modules:");
		const startTime = Date.now();

		const bundleInfo = await bundleWithUI5ToolingModules(packages, ui5Options);
		const files = await writeUI5ToolingOutput(scenarioName, bundleInfo);

		const duration = Date.now() - startTime;

		for (const file of files) {
			console.log(`   ✅ ${file.name}.js (${(file.size / 1024).toFixed(2)} KB)`);
		}
		console.log(`   Duration: ${duration}ms`);

		return {
			bundleInfo,
			files,
			duration,
			totalSize: files.reduce((sum, f) => sum + f.size, 0),
			getCode: (name) => getMainBundleCode(bundleInfo, name)
		};
	};

	// Run in parallel
	const [customResult, ui5Result] = await Promise.all([
		customBundlerTask(),
		ui5BundlerTask()
	]);

	// Print comparison
	console.log("\n" + "═".repeat(60));
	console.log("📊 COMPARISON SUMMARY");
	console.log("═".repeat(60));

	console.log("\n📁 Output locations:");
	console.log(`   Custom:           dist/${scenarioName}/custom/`);
	console.log(`   ui5-tooling:      dist/${scenarioName}/ui5-tooling-modules/`);

	console.log("\n📏 Size comparison:");
	console.log(`   Custom:           ${(customResult.totalSize / 1024).toFixed(2)} KB`);
	console.log(`   ui5-tooling:      ${(ui5Result.totalSize / 1024).toFixed(2)} KB`);

	console.log("\n⏱️  Build time:");
	console.log(`   Custom:           ${customResult.duration}ms`);
	console.log(`   ui5-tooling:      ${ui5Result.duration}ms`);

	// Show first line of output for format comparison
	if (customResult.results.length > 0 && ui5Result.files.length > 0) {
		const customCode = customResult.results[0].code;
		const ui5Code = ui5Result.getCode(packages[0]);
		if (customCode && ui5Code) {
			console.log("\n📝 Output format (first line):");
			console.log(`   Custom:       ${customCode.split("\n")[0].substring(0, 55)}...`);
			console.log(`   ui5-tooling:  ${ui5Code.split("\n")[0].substring(0, 55)}...`);
		}
	}

	console.log("\n💾 Saved to: dist/" + scenarioName + "/");

	return {custom: customResult, ui5: ui5Result};
}
