/**
 * Scenario 5: Transitive Dependencies - axios (HTTP Client)
 *
 * Demonstrates bundling an NPM package with transitive dependencies.
 * Axios is an HTTP client that depends on:
 * - form-data (multipart form handling)
 * - follow-redirects (redirect handling)
 * - proxy-from-env (proxy configuration)
 *
 * All transitive dependencies are automatically bundled by Rollup.
 *
 * Compares: Custom Rollup bundler vs ui5-tooling-modules
 */

import {
	createRollupConfig,
	generateAMDBundle,
	printScenarioHeader,
	runDualBundling
} from "./shared-config.js";

const SCENARIO_NAME = "05-transitive-axios";
const PACKAGE_NAME = "axios";

printScenarioHeader(5, "Transitive Dependencies - axios (HTTP Client)", "HTTP client with transitive deps → UI5 AMD module\nCompares: Custom Rollup vs ui5-tooling-modules");

console.log("\n   Transitive dependencies:");
console.log("   - form-data → asynckit, combined-stream, mime-types");
console.log("   - follow-redirects");
console.log("   - proxy-from-env");

try {
	const result = await runDualBundling({
		scenarioName: SCENARIO_NAME,
		packageNames: PACKAGE_NAME,
		customBundler: async (pkg) => {
			const config = createRollupConfig(pkg);
			return await generateAMDBundle(config);
		}
	});

	// Bundle analysis on custom output
	const code = result.custom.results[0]?.code || "";
	console.log("\n📊 Bundle analysis (custom):");
	console.log(`   - Contains Axios class: ${code.includes("Axios") ? "✅" : "❌"}`);
	console.log(`   - Contains interceptors: ${code.includes("interceptors") ? "✅" : "❌"}`);
	console.log(`   - Contains XMLHttpRequest: ${code.includes("XMLHttpRequest") ? "✅" : "❌"}`);
	console.log(`   - Browser-compatible: ${code.includes("XMLHttpRequest") && !code.includes("require('http')") ? "✅" : "⚠️"}`);
} catch (error) {
	console.error("❌ Error:", error.message);
	throw error;
}
