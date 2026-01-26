/**
 * Scenario 1: ESM Integration - nanoid
 *
 * Demonstrates bundling a pure ESM-only package (nanoid v5+) for UI5 consumption
 * nanoid is a modern ESM-only package that cannot be used directly with require()
 */

import {
	createRollupConfig,
	generateAMDBundle,
	writeScenarioOutput,
	printBundleInfo,
	printScenarioHeader
} from "./shared-config.js";

printScenarioHeader(1, "ESM Integration - nanoid (Pure ESM)", "Pure ESM-only package → UI5 AMD module");

async function bundleNanoid() {
	console.log("\n📦 Bundling nanoid (Pure ESM-only package)...\n");

	try {
		const config = createRollupConfig("nanoid");
		const code = await generateAMDBundle(config);

		printBundleInfo(code, "nanoid");

		const outputFile = await writeScenarioOutput("01-esm-integration", "nanoid.js", code);
		console.log(`\n💾 Saved to: ${outputFile}`);

		return code;
	} catch (error) {
		console.error("❌ Error:", error.message);
		throw error;
	}
}

bundleNanoid();
