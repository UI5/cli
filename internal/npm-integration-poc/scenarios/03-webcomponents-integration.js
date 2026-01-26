/**
 * Scenario 3: UI5 Web Components - Standalone Plugin Integration
 *
 * Demonstrates the new standalone plugin approach for bundling @ui5/webcomponents
 * Uses the custom rollup-plugin-ui5-webcomponents.js with metadata extraction
 */

import {createRequire} from "module";
import {rollup} from "rollup";
import {nodeResolve} from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {mkdir, writeFile} from "fs/promises";
import path from "path";
import {fileURLToPath} from "url";
import {printScenarioHeader} from "./shared-config.js";
import ui5WebComponentsPlugin from "../lib/plugins/rollup-plugin-ui5-webcomponents.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "../dist/03-webcomponents-integration");

printScenarioHeader(3, "UI5 Web Components - Standalone Plugin", "Complex WebComponents with custom plugin");

async function bundleWebComponents() {
	console.log("\n📦 Bundling @ui5/webcomponents/dist/MessageStrip.js...\n");

	const namespace = "com/example/app";
	const thirdpartyNamespace = "thirdparty";
	const webComponentsNamespace = "gen";
	const $metadata = {};

	try {
		const plugin = ui5WebComponentsPlugin({
			namespace,
			thirdpartyNamespace,
			webComponentsNamespace,
			scoping: false,
			scopeSuffix: null,
			log: console,
			framework: {name: "SAPUI5", version: "1.120.0"},
			resolveModule: (id) => {
				try {
					return require.resolve(id);
				} catch {
					return null;
				}
			},
			$metadata
		});

		const bundle = await rollup({
			input: "@ui5/webcomponents/dist/MessageStrip.js",
			plugins: [
				nodeResolve({browser: true, preferBuiltins: false}),
				commonjs(),
				plugin
			],
			external: [/^sap\//]
		});

		const {output} = await bundle.generate({
			format: "amd",
			amd: {define: "sap.ui.define"}
		});

		console.log("\n✅ Bundle generated successfully!\n");

		// Show output info
		for (const chunk of output) {
			if (chunk.type === "chunk") {
				console.log(`📦 Chunk: ${chunk.fileName} (${(chunk.code.length / 1024).toFixed(2)} KB)`);
			}
		}

		console.log("\n📄 Assets (UI5 Wrappers):");
		for (const asset of output) {
			if (asset.type === "asset") {
				console.log(`   ✅ ${asset.fileName} (${(asset.source.length / 1024).toFixed(2)} KB)`);
			}
		}

		if ($metadata.controls) {
			console.log("\n🎨 Detected Controls:");
			for (const [, controlMeta] of Object.entries($metadata.controls)) {
				const {componentName, ui5Metadata} = controlMeta;
				console.log(`   - ${componentName}`);
				console.log(`     Tag: ${ui5Metadata.tag}`);
				console.log(`     Properties: ${Object.keys(ui5Metadata.properties).length}`);
				console.log(`     Events: ${Object.keys(ui5Metadata.events).length}`);
			}
		}

		if ($metadata.packages) {
			console.log("\n📦 Package Exports:");
			for (const [fileName, packageMeta] of Object.entries($metadata.packages)) {
				console.log(`   - ${fileName} (${packageMeta.packageName} v${packageMeta.version})`);
			}
		}

		console.log("\n✨ Standalone plugin integration successful!");
		console.log("   Generated dual-namespace structure:");
		console.log("   - gen/ namespace: UI5 wrappers with relative paths");
		console.log("   - thirdparty/ namespace: Native bundles");
		console.log("   - Package exports: Link gen/ to thirdparty/");

		// Write all outputs
		await mkdir(outputDir, {recursive: true});
		console.log("\n💾 Writing files to disk:");

		for (const item of output) {
			const filePath = path.join(outputDir, item.fileName);
			await mkdir(path.dirname(filePath), {recursive: true});
			const content = item.type === "chunk" ? item.code : item.source;
			await writeFile(filePath, content, "utf-8");
			console.log(`   ✅ ${item.fileName}`);
		}

		console.log(`\n📁 Output directory: ${outputDir}`);

		return output;
	} catch (error) {
		console.error("\n❌ Error:", error.message);
		console.error(error.stack);
		throw error;
	}
}

bundleWebComponents();

