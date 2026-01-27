/**
 * Shared Rollup Configuration for Scenarios
 *
 * Common bundling setup to reduce duplication across scenarios
 */

import {rollup} from "rollup";
import {nodeResolve} from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {mkdir, writeFile} from "fs/promises";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Base rollup configuration
 *
 * @param input
 * @param extraPlugins
 */
export function createRollupConfig(input, extraPlugins = []) {
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
			...extraPlugins
		]
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
		}
	});

	return output[0].code;
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
