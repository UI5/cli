#!/usr/bin/env node

import {fileURLToPath} from "node:url";
import path from "node:path";
import fs from "node:fs";
import BenchmarkRunner from "./lib/BenchmarkRunner.js";
import git from "./lib/utils/git.js";
import npm from "./lib/utils/npm.js";
import {spawnProcess} from "./lib/utils/process.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsageAndExit() {
	console.error(
		"Usage:\n\t" +
		"ui5-cli-benchmark run <path-to-config> [<project-dir>...]"
	);
	process.exit(1);
}

export const commands = {
	async run(args, options = {}) {
		const configFilePath = args[0];
		const projectDirs = args.slice(1);

		// Validate arguments
		if (!configFilePath) {
			return printUsageAndExit();
		}

		// Determine repository and CLI paths
		const repositoryPath = path.resolve(__dirname, "../..");
		const ui5CliPath = path.resolve(repositoryPath, "packages/cli/bin/ui5.cjs");

		// Create BenchmarkRunner with injected dependencies
		const benchmarkRunner = new BenchmarkRunner({
			git: options.git || git,
			npm: options.npm || npm,
			spawnProcess: options.spawnProcess || spawnProcess,
			fs: options.fs || fs
		});

		// Run benchmarks
		const result = await benchmarkRunner.run({
			configFilePath,
			repositoryPath,
			ui5CliPath,
			projectDirs: projectDirs.length > 0 ? projectDirs : undefined,
			timestamp: options.timestamp
		});

		if (!result.success) {
			process.exit(1);
		}
	}
};

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
		return printUsageAndExit();
	}

	const command = args[0];
	const commandArgs = args.slice(1);
	const fn = commands[command];

	// Validate command name
	if (!fn) {
		process.stderr.write(`Unknown command: '${command}'\n\n`);
		return process.exit(1);
	}

	// Execute handler
	try {
		await fn(commandArgs);
	} catch (error) {
		console.error(`Unexpected error: ${error.message}`);
		console.error("Stack trace:", error.stack);

		process.exit(1);
	}
}


// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error.message);
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled rejection at:", promise, "reason:", reason);
	process.exit(1);
});

main();
