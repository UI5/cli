/**
 * Scenario 2: CJS Integration - lodash
 *
 * Demonstrates bundling a pure CommonJS-only package (lodash) for UI5 consumption
 * lodash is a classic CJS package that uses require/module.exports exclusively
 *
 * Compares: Custom Rollup bundler vs ui5-tooling-modules
 */

import {
	createRollupConfig,
	generateAMDBundle,
	printScenarioHeader,
	runDualBundling
} from "./shared-config.js";

const SCENARIO_NAME = "02-cjs-integration";
const PACKAGE_NAME = "lodash";

printScenarioHeader(2, "CJS Integration - lodash (Pure CJS)", "Pure CommonJS-only package → UI5 AMD module\nCompares: Custom Rollup vs ui5-tooling-modules");

try {
	await runDualBundling({
		scenarioName: SCENARIO_NAME,
		packageNames: PACKAGE_NAME,
		customBundler: async (pkg) => {
			const config = createRollupConfig(pkg);
			return await generateAMDBundle(config);
		}
	});
} catch (error) {
	console.error("❌ Error:", error.message);
	throw error;
}
