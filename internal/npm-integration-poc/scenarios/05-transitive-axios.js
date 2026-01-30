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
 */

import {
	createRollupConfig,
	generateAMDBundle,
	writeScenarioOutput,
	printBundleInfo,
	printScenarioHeader
} from "./shared-config.js";

printScenarioHeader(5, "Transitive Dependencies - axios (HTTP Client)", "HTTP client with transitive deps → UI5 AMD module");

async function bundleAxios() {
	console.log("\n📦 Bundling axios (HTTP client with transitive deps)...\n");
	console.log("   Transitive dependencies:");
	console.log("   - form-data → asynckit, combined-stream, mime-types");
	console.log("   - follow-redirects");
	console.log("   - proxy-from-env\n");

	try {
		const config = createRollupConfig("axios");
		const code = await generateAMDBundle(config);

		printBundleInfo(code, "axios");

		// Check what's included in the bundle
		console.log("\n📊 Bundle analysis:");
		console.log(`   - Contains Axios class: ${code.includes("Axios") ? "✅" : "❌"}`);
		console.log(`   - Contains interceptors: ${code.includes("interceptors") ? "✅" : "❌"}`);
		console.log(`   - Contains request method: ${code.includes(".request") ? "✅" : "❌"}`);
		console.log(`   - Contains XMLHttpRequest: ${code.includes("XMLHttpRequest") ? "✅" : "❌"}`);
		console.log(`   - Browser-compatible: ${code.includes("XMLHttpRequest") && !code.includes("require('http')") ? "✅" : "⚠️ (may need polyfills)"}`);

		const outputFile = await writeScenarioOutput("05-transitive-axios", "axios.js", code);
		console.log(`\n💾 Saved to: ${outputFile}`);

		return code;
	} catch (error) {
		console.error("❌ Error:", error.message);
		throw error;
	}
}

bundleAxios();
