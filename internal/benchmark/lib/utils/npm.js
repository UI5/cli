import path from "node:path";
import fs from "node:fs";
import {spawnProcess} from "./process.js";

// Execute a npm command and return stdout
async function runNpmCommand(args, cwd, commandName = args[0], spawnFn = spawnProcess) {
	return spawnFn("npm", args, {
		cwd,
		errorMessage: `npm ${commandName} failed`
	});
}

// Checkout a specific git revision / branch
async function ci(cwd, spawnFn = spawnProcess) {
	await runNpmCommand(["ci"], cwd, "ci", spawnFn);
}

// Native addons that require node-gyp compilation.
// npm rebuild doesn't compile these in workspace monorepos,
// so we run node-gyp rebuild directly in each package directory.
const NATIVE_ADDONS = ["better-sqlite3"];

// Build native addons that require node-gyp compilation
async function rebuildNativeAddons(cwd, spawnFn = spawnProcess) {
	for (const addon of NATIVE_ADDONS) {
		const addonDir = path.join(cwd, "node_modules", addon);
		if (!fs.existsSync(addonDir)) {
			continue;
		}
		const bindingGyp = path.join(addonDir, "binding.gyp");
		if (!fs.existsSync(bindingGyp)) {
			continue;
		}
		await spawnFn("npx", ["--yes", "node-gyp", "rebuild"], {
			cwd: addonDir,
			errorMessage: `node-gyp rebuild failed for ${addon}`
		});
	}
}

export default {
	ci,
	rebuildNativeAddons
};
