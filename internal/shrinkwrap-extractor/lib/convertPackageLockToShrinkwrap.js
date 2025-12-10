import {readFile} from "node:fs/promises";
import path from "path";
import {Arborist} from "@npmcli/arborist";
import pacote from "pacote";
import Config from "@npmcli/config";
import pkg from "@npmcli/config/lib/definitions/index.js";
const {shorthands, definitions, flatten} = pkg;

async function readJson(filePath) {
	const jsonString = await readFile(filePath, {encoding: "utf-8"});
	return JSON.parse(jsonString);
}

export default async function convertPackageLockToShrinkwrap(workspaceRootDir, targetPackageName) {
	const packageLockJson = await readJson(path.join(workspaceRootDir, "package-lock.json"));

	// Input validation
	if (!packageLockJson || typeof packageLockJson !== "object") {
		throw new Error("Invalid package-lock.json: must be a valid JSON object");
	}

	if (!targetPackageName || typeof targetPackageName !== "string" || targetPackageName.trim() === "") {
		throw new Error("Invalid target package name: must be a non-empty string");
	}

	if (!packageLockJson.packages) {
		throw new Error("Invalid package-lock.json: missing packages field");
	}

	if (typeof packageLockJson.packages !== "object") {
		throw new Error("Invalid package-lock.json: packages field must be an object");
	}

	// Validate lockfile version - only support version 3
	if (packageLockJson.lockfileVersion && packageLockJson.lockfileVersion !== 3) {
		throw new Error(`Unsupported lockfile version: ${packageLockJson.lockfileVersion}. ` +
			`Only lockfile version 3 is supported`);
	}

	// Default to version 3 if not specified
	if (!packageLockJson.lockfileVersion) {
		packageLockJson.lockfileVersion = 3;
	}

	// We use arborist to traverse the dependency graph correctly. It handles various edge cases such as
	// dependencies installed via "npm:xyz", which required special parsing (see package "@isaacs/cliui").
	const arb = new Arborist({
		path: workspaceRootDir,
	});
	const tree = await arb.loadVirtual();
	const tops = Array.from(tree.tops.values());
	const cliNode = tops.find((node) => node.packageName === targetPackageName);
	if (!cliNode) {
		throw new Error(`Target package "${targetPackageName}" not found in workspace`);
	}

	const relevantPackageLocations = new Map();
	// Collect all package keys using arborist
	collectDependencies(cliNode, relevantPackageLocations);

	// Using the keys, extract relevant package-entries from package-lock.json
	const extractedPackages = Object.create(null);
	for (let [packageLoc, node] of relevantPackageLocations) {
		let pkg = packageLockJson.packages[packageLoc];
		if (pkg.link) {
			pkg = packageLockJson.packages[pkg.resolved];
		}
		if (pkg.name === targetPackageName) {
			// Make the target package the root package
			packageLoc = "";
			if (extractedPackages[packageLoc]) {
				throw new Error(`Duplicate root package entry for "${targetPackageName}"`);
			}
		} else {
			packageLoc = normalizePackageLocation(packageLoc, node, targetPackageName, tree.packageName);
		}
		if (packageLoc !== "" && !pkg.resolved) {
			// For all but the root package, ensure that "resolved" and "integrity" fields are present
			// These are always missing for locally linked packages, but sometimes also for others (e.g. if installed
			// from local cache)
			const {resolved, integrity} = await fetchPackageMetadata(node.packageName, node.version, workspaceRootDir);
			pkg.resolved = resolved;
			pkg.integrity = integrity;
		}
		extractedPackages[packageLoc] = pkg;
	}

	// Sort packages by key to ensure consistent order (just like the npm cli does it)
	const sortedExtractedPackages = Object.create(null);
	const sortedKeys = Object.keys(extractedPackages).sort((a, b) => a.localeCompare(b));
	for (const key of sortedKeys) {
		sortedExtractedPackages[key] = extractedPackages[key];
	}

	// Generate npm-shrinkwrap.json
	const shrinkwrap = {
		name: targetPackageName,
		version: cliNode.version,
		lockfileVersion: 3,
		requires: true,
		packages: sortedExtractedPackages
	};

	return shrinkwrap;
}

/**
 * Normalize package locations from workspace-specific paths to standard npm paths.
 * Examples (assuming @ui5/cli is the targetPackageName):
 * 	- packages/cli/node_modules/foo -> node_modules/foo
 * 	- packages/fs/node_modules/bar -> node_modules/@ui5/fs/node_modules/bar
 *
 * @param {string} location - Package location from arborist
 * @param {object} node - Package node from arborist
 * @param {string} targetPackageName - Target package name for shrinkwrap file
 * @param {string} rootPackageName - Root / workspace package name
 * @returns {string} - Normalized location for npm-shrinkwrap.json
 */
function normalizePackageLocation(location, node, targetPackageName, rootPackageName) {
	const topPackageName = node.top.packageName;
	if (topPackageName === targetPackageName) {
		// Remove location for packages within target package (e.g. @ui5/cli)
		return location.substring(node.top.location.length + 1);
	} else if (topPackageName !== rootPackageName) {
		// Add package within node_modules of actual package name (e.g. @ui5/fs)
		return `node_modules/${topPackageName}/${location.substring(node.top.location.length + 1)}`;
	}
	// If it's already within the root workspace package, keep as-is
	return location;
}

function collectDependencies(node, relevantPackageLocations) {
	if (relevantPackageLocations.has(node.location)) {
		// Already processed
		return;
	}
	relevantPackageLocations.set(node.location, node);
	if (node.isLink) {
		node = node.target;
	}
	for (const edge of node.edgesOut.values()) {
		if (edge.dev) {
			continue;
		}
		collectDependencies(edge.to, relevantPackageLocations);
	}
}

/**
 * Fetch package metadata from npm registry using pacote
 *
 * @param {string} packageName - Name of the package
 * @param {string} version - Version of the package
 * @param {string} workspaceRoot - Root directory of the workspace to read npm config from
 * @returns {Promise<{resolved: string, integrity: string}>} - Resolved URL and integrity hash
 */
async function fetchPackageMetadata(packageName, version, workspaceRoot) {
	try {
		const spec = `${packageName}@${version}`;

		const conf = new Config({
			npmPath: workspaceRoot,
			definitions,
			shorthands,
			flatten,
			argv: process.argv,
			env: process.env,
			execPath: process.execPath,
			platform: process.platform,
			cwd: process.cwd(),
		});
		await conf.load();
		const registry = conf.get("registry") || "https://registry.npmjs.org/";

		const manifest = await pacote.manifest(spec, {registry});

		return {
			resolved: manifest.dist.tarball,
			integrity: manifest.dist.integrity || ""
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not fetch registry metadata for ${packageName}@${version}: ${errorMessage}`);
	}
}
