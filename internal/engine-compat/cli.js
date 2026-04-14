#!/usr/bin/env node

/**
 * Engine Compatibility Checker
 *
 * Compares the project's engines.node range against every installed dependency's
 * engines.node range using semver.subset().
 *
 * Outputs JSON to stdout: {projectRange, incompatible: [{name, version, enginesNode}], checked, skipped}
 * Exits with code 1 if incompatible packages are found.
 */

import fs from "node:fs";
import {execSync} from "node:child_process";
import semver from "semver";

// --- Read project engine range ---

const rootDir = process.cwd();
const rootPkg = JSON.parse(fs.readFileSync(`${rootDir}/package.json`, "utf8"));
const projectRange = rootPkg.engines?.node;

if (!projectRange) {
	console.error("No engines.node field found in package.json");
	process.exit(1);
}

// --- Collect dependencies from npm ls ---

let npmOutput;
try {
	npmOutput = execSync("npm ls --json --all", {
		cwd: rootDir,
		encoding: "utf8",
		maxBuffer: 50 * 1024 * 1024, // 50 MB — monorepos produce large output
		stdio: ["pipe", "pipe", "pipe"]
	});
} catch (error) {
	// npm ls exits non-zero on extraneous/missing deps but still outputs valid JSON
	npmOutput = error.stdout;
	if (!npmOutput) {
		console.error(`npm ls failed: ${error.message}`);
		process.exit(1);
	}
}

const tree = JSON.parse(npmOutput);
const seen = new Map();

function walkTree(dependencies) {
	if (!dependencies) return;
	for (const [name, info] of Object.entries(dependencies)) {
		// Skip workspace packages — they share root engine config
		if (info.resolved && info.resolved.startsWith("file:")) continue;

		const key = `${name}@${info.version}`;
		if (!seen.has(key)) {
			seen.set(key, {name, version: info.version});
		}
		walkTree(info.dependencies);
	}
}

walkTree(tree.dependencies);

// --- Check each dependency's engine range ---

const incompatible = [];
let checked = 0;
let skipped = 0;

for (const {name, version} of seen.values()) {
	let depRange;
	try {
		const depPkg = JSON.parse(
			fs.readFileSync(`${rootDir}/node_modules/${name}/package.json`, "utf8")
		);
		depRange = depPkg.engines?.node;
	} catch {
		// Not hoisted to root node_modules — skip
	}

	if (!depRange) {
		skipped++;
		continue;
	}

	checked++;
	if (!semver.subset(projectRange, depRange)) {
		incompatible.push({name, version, enginesNode: depRange});
	}
}

// --- Output results ---

const results = {projectRange, incompatible, checked, skipped};
console.log(JSON.stringify(results));

if (incompatible.length > 0) {
	process.exit(1);
}
