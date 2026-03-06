/**
 * Scenario 4: Complex NPM - sinon (Testing Library)
 *
 * Demonstrates bundling a complex NPM package with multiple internal dependencies.
 * Sinon is a testing library that includes spies, stubs, mocks, and fake timers.
 * It has several internal dependencies that all get bundled together.
 *
 * Compares: Custom Rollup bundler vs ui5-tooling-modules
 */

import {
	createRollupConfig,
	generateAMDBundle,
	printScenarioHeader,
	runDualBundling
} from "./shared-config.js";

const SCENARIO_NAME = "04-complex-sinon";
const PACKAGE_NAME = "sinon";

printScenarioHeader(4, "Complex NPM - sinon (Testing Library)", "Testing library with internal deps → UI5 AMD module\nCompares: Custom Rollup vs ui5-tooling-modules");

console.log("\n   Dependencies included:");
console.log("   - @sinonjs/commons (utilities)");
console.log("   - @sinonjs/fake-timers (timer mocking)");
console.log("   - @sinonjs/samsam (deep equality)");
console.log("   - nise (fake XHR/server)");

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
	console.log(`   - Contains spy: ${code.includes("createSpy") ? "✅" : "❌"}`);
	console.log(`   - Contains stub: ${code.includes("createStub") ? "✅" : "❌"}`);
	console.log(`   - Contains mock: ${code.includes("mock") ? "✅" : "❌"}`);
	console.log(`   - Contains fake timers: ${code.includes("useFakeTimers") ? "✅" : "❌"}`);
	console.log(`   - Contains fake XHR: ${code.includes("fakeXMLHttpRequest") || code.includes("FakeXMLHttpRequest") ? "✅" : "❌"}`);
} catch (error) {
	console.error("❌ Error:", error.message);
	throw error;
}
