/**
 * Scenario 2: CJS Integration - lodash
 *
 * Demonstrates bundling a pure CommonJS-only package (lodash) for UI5 consumption
 * lodash is a classic CJS package that uses require/module.exports exclusively
 */

import {
	createRollupConfig,
	generateAMDBundle,
	writeScenarioOutput,
	printScenarioHeader
} from "./shared-config.js";

printScenarioHeader(2, "CJS Integration - lodash (Pure CJS)", "Pure CommonJS-only package → UI5 AMD module");

async function bundleLodash() {
	console.log("\n📦 Bundling lodash (Pure CommonJS-only package)...\n");

	try {
		const config = createRollupConfig("lodash");
		const code = await generateAMDBundle(config);

		console.log("✅ Bundle generated successfully!");
		console.log(`   Package: lodash`);
		console.log(`   Size: ${(code.length / 1024).toFixed(2)} KB`);
		console.log(`   Format: AMD (UI5-compatible)`);
		console.log(`   CommonJS → ESM → AMD conversion successful`);
		console.log(`\n📝 First 200 characters:\n${code.substring(0, 200)}...`);

		const outputFile = await writeScenarioOutput("02-cjs-integration", "lodash.js", code);
		console.log(`\n💾 Saved to: ${outputFile}`);

		return code;
	} catch (error) {
		console.error("❌ Error:", error.message);
		throw error;
	}
}

bundleLodash();
