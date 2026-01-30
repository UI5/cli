/**
 * UI5-Tooling-Modules Bundler Wrapper
 *
 * Wraps ui5-tooling-modules to provide a consistent API for comparison
 * with our custom Rollup-based bundler.
 */

import {createRequire} from "module";
import {mkdir, writeFile, readFile} from "fs/promises";
import {join, dirname} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Read the package.json for proper projectInfo
const pkgJsonPath = join(__dirname, "../package.json");
let pkgJson;
try {
	pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
} catch {
	pkgJson = {
		name: "npm-integration-poc",
		version: "1.0.0"
	};
}

// Create a proper projectInfo for the util module
const projectInfo = {
	name: "npm-integration-poc",
	namespace: "npm/integration/poc",
	type: "application",
	framework: {
		name: "SAPUI5",
		version: "1.120.0" // Minimum version for WebComponents support
	},
	pkgJson // ui5-tooling-modules needs this!
};

// Minimal logger
const log = {
	verbose: () => {},
	info: (msg) => console.log(`  [ui5-tooling-modules] ${msg}`),
	warn: (msg) => console.warn(`  [ui5-tooling-modules] ⚠️ ${msg}`),
	error: (msg) => console.error(`  [ui5-tooling-modules] ❌ ${msg}`)
};

/**
 * Bundle a module using ui5-tooling-modules
 *
 * @param {string|string[]} moduleNames - Module(s) to bundle
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Bundle info with code and metadata
 */
export async function bundleWithUI5ToolingModules(moduleNames, options = {}) {
	// Load the util module (CommonJS)
	const utilFactory = require("ui5-tooling-modules/lib/util.js");
	const util = utilFactory(log, projectInfo);

	// Ensure moduleNames is an array
	const modules = Array.isArray(moduleNames) ? moduleNames : [moduleNames];

	try {
		// Use getBundleInfo which handles caching and returns structured output
		const bundleInfo = await util.getBundleInfo(modules, {
			skipCache: true,
			pluginOptions: options.pluginOptions || {},
			...options
		}, {
			cwd: options.cwd || process.cwd()
		});

		if (bundleInfo.error) {
			throw new Error(`Bundling failed: ${bundleInfo.error.message || bundleInfo.error}`);
		}

		return bundleInfo;
	} catch (error) {
		console.error(`  [ui5-tooling-modules] Error bundling ${modules.join(", ")}:`, error.message);
		throw error;
	}
}

/**
 * Write ui5-tooling-modules bundle output to dist folder
 *
 * @param {string} scenarioName - Scenario folder name
 * @param {object} bundleInfo - Bundle info from ui5-tooling-modules
 * @returns {Promise<string[]>} Array of written file paths
 */
export async function writeUI5ToolingOutput(scenarioName, bundleInfo) {
	const outputDir = join(__dirname, `../dist/${scenarioName}/ui5-tooling-modules`);
	const writtenFiles = [];

	await mkdir(outputDir, {recursive: true});

	// Write all entries (modules and chunks)
	for (const entry of bundleInfo.getEntries()) {
		if (entry.code) {
			const fileName = entry.name.endsWith(".js") ? entry.name : `${entry.name}.js`;
			const filePath = join(outputDir, fileName);

			await mkdir(dirname(filePath), {recursive: true});
			await writeFile(filePath, entry.code, "utf-8");
			writtenFiles.push({
				path: filePath,
				name: entry.name,
				size: entry.code.length,
				type: entry.type
			});
		}
	}

	return writtenFiles;
}

/**
 * Get the main bundle code from bundleInfo
 *
 * @param {object} bundleInfo - Bundle info from ui5-tooling-modules
 * @param {string} moduleName - Module name to get code for
 * @returns {string} Bundle code
 */
export function getMainBundleCode(bundleInfo, moduleName) {
	const entry = bundleInfo.getEntry(moduleName);
	return entry?.code || "";
}

/**
 * Print ui5-tooling-modules bundle summary
 *
 * @param {object} bundleInfo - Bundle info from ui5-tooling-modules
 * @param {string} label - Label for the summary
 */
export function printUI5ToolingSummary(bundleInfo, label = "ui5-tooling-modules") {
	const entries = bundleInfo.getEntries();
	const modules = bundleInfo.getModules();
	const chunks = bundleInfo.getChunks();

	let totalSize = 0;
	for (const entry of entries) {
		if (entry.code) {
			totalSize += entry.code.length;
		}
	}

	console.log(`\n📦 ${label} Output:`);
	console.log(`   Modules: ${modules.length}`);
	console.log(`   Chunks: ${chunks.length}`);
	console.log(`   Total size: ${(totalSize / 1024).toFixed(2)} KB`);

	// List files
	for (const entry of entries) {
		if (entry.code) {
			const sizeKB = (entry.code.length / 1024).toFixed(2);
			const typeIcon = entry.type === "module" ? "📄" : "📦";
			console.log(`   ${typeIcon} ${entry.name}.js (${sizeKB} KB)`);
		}
	}
}
