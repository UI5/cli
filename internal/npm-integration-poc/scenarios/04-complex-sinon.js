/**
 * Scenario 4: Complex NPM - sinon (Testing Library)
 *
 * Demonstrates bundling a complex NPM package with multiple internal dependencies.
 * Sinon is a testing library that includes spies, stubs, mocks, and fake timers.
 * It has several internal dependencies that all get bundled together.
 */

import {
	createRollupConfig,
	generateAMDBundle,
	writeScenarioOutput,
	printBundleInfo,
	printScenarioHeader
} from "./shared-config.js";

printScenarioHeader(4, "Complex NPM - sinon (Testing Library)", "Testing library with internal deps → UI5 AMD module");

async function bundleSinon() {
	console.log("\n📦 Bundling sinon (complex testing library)...\n");
	console.log("   Dependencies included:");
	console.log("   - @sinonjs/commons (utilities)");
	console.log("   - @sinonjs/fake-timers (timer mocking)");
	console.log("   - @sinonjs/samsam (deep equality)");
	console.log("   - nise (fake XHR/server)\n");

	try {
		const config = createRollupConfig("sinon");
		const code = await generateAMDBundle(config);

		printBundleInfo(code, "sinon");

		// Check what's included in the bundle
		console.log("\n📊 Bundle analysis:");
		console.log(`   - Contains spy: ${code.includes("createSpy") ? "✅" : "❌"}`);
		console.log(`   - Contains stub: ${code.includes("createStub") ? "✅" : "❌"}`);
		console.log(`   - Contains mock: ${code.includes("mock") ? "✅" : "❌"}`);
		console.log(`   - Contains fake timers: ${code.includes("useFakeTimers") ? "✅" : "❌"}`);
		console.log(`   - Contains fake XHR: ${code.includes("fakeXMLHttpRequest") || code.includes("FakeXMLHttpRequest") ? "✅" : "❌"}`);

		const outputFile = await writeScenarioOutput("04-complex-sinon", "sinon.js", code);
		console.log(`\n💾 Saved to: ${outputFile}`);

		return code;
	} catch (error) {
		console.error("❌ Error:", error.message);
		throw error;
	}
}

bundleSinon();
