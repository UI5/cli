/**
 * Scenario 1: ESM Integration - nanoid
 *
 * Demonstrates bundling a pure ESM-only package (nanoid v5+) for UI5 consumption
 * nanoid is a modern ESM-only package that cannot be used directly with require()
 *
 * Compares: Custom Rollup bundler vs ui5-tooling-modules
 */

import {
	createRollupConfig,
	generateAMDBundle,
	printScenarioHeader,
	runDualBundling
} from "./shared-config.js";

const SCENARIO_NAME = "01-esm-integration";
const PACKAGE_NAME = "nanoid";

printScenarioHeader(1, "ESM Integration - nanoid (Pure ESM)", "Pure ESM-only package → UI5 AMD module\nCompares: Custom Rollup vs ui5-tooling-modules");

try {
	await runDualBundling({
		scenarioName: SCENARIO_NAME,
		packageNames: PACKAGE_NAME,
		customBundler: async (pkg) => {
			const config = createRollupConfig(pkg);
			return await generateAMDBundle(config);
		},
	});
} catch (error) {
	console.error("❌ Error:", error.message);
	throw error;
}
