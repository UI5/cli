#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import convertPackageLockToShrinkwrap from "./lib/convertPackageLockToShrinkwrap.js";

async function main() {
	const args = process.argv.slice(2);

	// Validate arguments
	if (args.length !== 1) {
		console.error("Error: Expected exactly 1 argument");
		console.error("Usage: shrinkwrap-extractor <path-to-workspace-root>");
		process.exit(1);
	}

	const [workspaceRootPath] = args;

	try {
		console.log(`Generating shrinkwrap in: ${process.cwd()}`);
		console.log(`Using workspace root: ${workspaceRootPath}`);

		// Read and parse package.json
		const packageJsonContent = await readFile(join(process.cwd(), "package.json"), "utf-8");
		const packageJson = JSON.parse(packageJsonContent);
		const packageName = packageJson.name;

		// Validate package name
		if (!packageName || packageName.trim() === "") {
			console.error("Error: Package name cannot be empty");
			process.exit(1);
		}

		console.log(`Converting dependencies for package: ${packageName}`);

		// Extract into shrinkwrap
		const shrinkwrap = await convertPackageLockToShrinkwrap(workspaceRootPath, packageName);

		// Write npm-shrinkwrap.json to current working directory
		const outputPath = join(process.cwd(), "npm-shrinkwrap.json");
		const shrinkwrapContent = JSON.stringify(shrinkwrap, null, "\t");

		await writeFile(outputPath, shrinkwrapContent, "utf-8");

		console.log(`Successfully generated npm-shrinkwrap.json with ${Object.keys(shrinkwrap.packages).length - 1} dependencies (excluding root)`);
		console.log(`Output written to: ${outputPath}`);
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
