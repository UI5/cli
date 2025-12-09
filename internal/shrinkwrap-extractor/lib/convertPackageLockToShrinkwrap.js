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
	const targetNode = tops.find((node) => node.packageName === targetPackageName);
	if (!targetNode) {
		throw new Error(`Target package "${targetPackageName}" not found in workspace`);
	}

	const relevantPackageLocations = new Map();
	// Collect all package keys using arborist
	collectDependencies(targetNode, relevantPackageLocations);


	// Build a map of package paths to their versions for collision detection
	function buildVersionMap(relevantPackageLocations) {
		const versionMap = new Map();
		for (const [key, node] of relevantPackageLocations) {
			const pkgPath = key.split("|")[0];
			versionMap.set(pkgPath, node.version);
		}
		return versionMap;
	}

	// Build a map: key = package path, value = array of unique versions
	const existingLocationsAndVersions = buildVersionMap(relevantPackageLocations);
	// Using the keys, extract relevant package-entries from package-lock.json
	// Extract and process packages
	const extractedPackages = Object.create(null);
	for (const [locAndParentPackage, node] of relevantPackageLocations) {
		const [originalLocation, parentPackage] = locAndParentPackage.split("|");

		let pkg = packageLockJson.packages[node.location];
		if (pkg.link) {
			pkg = packageLockJson.packages[pkg.resolved];
		}

		let packageLoc;
		if (pkg.name === targetPackageName) {
			// Make the target package the root package
			packageLoc = "";
			if (extractedPackages[packageLoc]) {
				throw new Error(`Duplicate root package entry for "${targetPackageName}"`);
			}
		} else {
			packageLoc = normalizePackageLocation(
				[originalLocation, parentPackage],
				node,
				targetPackageName,
				tree.packageName,
				existingLocationsAndVersions,
				targetNode
			);
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
		version: targetNode.version,
		lockfileVersion: 3,
		requires: true,
		packages: sortedExtractedPackages
	};

	return shrinkwrap;
}

function isDirectDependency(node, targetNode) {
	return Array.from(node.edgesIn.values()).some((edge) => edge.from === targetNode);
}

function normalizePackageLocation(
	[location, parentPackage],
	node,
	targetPackageName,
	rootPackageName,
	existingLocationsAndVersions,
	targetNode
) {
	const topPackageName = node.top.packageName;

	if (topPackageName === targetPackageName) {
		// Package belongs to target package
		const normalizedPath = location.substring(node.top.location.length + 1);
		const existingVersion = existingLocationsAndVersions.get(normalizedPath);

		// Handle version collision
		if (existingVersion && existingVersion !== node.version) {
			// Direct dependencies get priority, transitive ones get nested
			const finalPath = isDirectDependency(node, targetNode) ?
				normalizedPath : `node_modules/${topPackageName}/${normalizedPath}`;

			existingLocationsAndVersions.set(finalPath, node.version);
			return finalPath;
		}

		existingLocationsAndVersions.set(normalizedPath, node.version);
		return normalizedPath;
	} else if (topPackageName !== rootPackageName) {
		// Package belongs to another workspace package - nest under it
		const nestedPath = `node_modules/${topPackageName}/${location.substring(node.top.location.length + 1)}`;
		existingLocationsAndVersions.set(nestedPath, node.version);
		return nestedPath;
	} else {
		const existingVersion = existingLocationsAndVersions.get(location);
		if (existingVersion && existingVersion !== node.version) {
			// Version collision at root - nest under parent
			const nestedPath = `node_modules/${parentPackage}/${location}`;
			existingLocationsAndVersions.set(nestedPath, node.version);
			return nestedPath;
		}
	}

	return location;
}

function collectDependencies(node, relevantPackageLocations, parentPackage = "") {
	if (relevantPackageLocations.has(node.location + "|" + parentPackage)) {
		// Already processed
		return;
	}
	// We need this as the module could be in the root node_modules and later might need to be nested
	// under many different parent packages due to version collisions. If this step is skipped, some
	// packages might be missing in the final shrinkwrap due to key overwrites.
	relevantPackageLocations.set(node.location + "|" + parentPackage, node);
	if (node.isLink) {
		node = node.target;
	}
	for (const edge of node.edgesOut.values()) {
		if (edge.dev) {
			continue;
		}
		collectDependencies(edge.to, relevantPackageLocations, node.packageName);
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
