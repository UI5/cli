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

// Rebuild native addons (e.g. better-sqlite3, classic-level)
async function rebuild(cwd, spawnFn = spawnProcess) {
	await runNpmCommand(["rebuild"], cwd, "rebuild", spawnFn);
}

export default {
	ci,
	rebuild
};
