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
	let targetNode = tree.inventory.get(`node_modules/${targetPackageName}`);
	if (!targetNode) {
		throw new Error(`Target package "${targetPackageName}" not found in workspace`);
	}
	targetNode = targetNode.isLink ? targetNode.target : targetNode;

	const virtualFlatTree = [];
	// Collect all package keys using arborist
	resolveVirtualTree(targetNode, virtualFlatTree);

	const physicalTree = new Map();
	await buildPhysicalTree(
		virtualFlatTree, physicalTree, packageLockJson, workspaceRootDir);
	// Build a map of package paths to their versions for collision detection

	// Sort packages by key to ensure consistent order (just like the npm cli does it)
	const sortedExtractedPackages = Object.create(null);
	const sortedKeys = Array.from(physicalTree.keys()).sort((a, b) => a.localeCompare(b));
	for (const key of sortedKeys) {
		sortedExtractedPackages[key] = physicalTree.get(key)[0];
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

function resolveVirtualTree(node, virtualFlatTree, curPath, parentNode) {
	const fullPath = [curPath, node.name].join(" | ");

	if (virtualFlatTree.some(([path]) => path === fullPath)) {
		return;
	}
	if (node.isLink) {
		node = node.target;
	}

	virtualFlatTree.push([fullPath, [node, parentNode]]);

	for (const edge of node.edgesOut.values()) {
		if (edge.dev) {
			continue;
		}
		resolveVirtualTree(edge.to, virtualFlatTree, fullPath, node);
	}
}

async function buildPhysicalTree(
	virtualFlatTree, physicalTree, packageLockJson, workspaceRootDir) {
	// Sort by path depth and then alphabetically to ensure parent
	// packages are processed before children. It's important to
	// process parents first to correctly handle version collisions and hoisting
	virtualFlatTree.sort(([pathA], [pathB]) => {
		if (pathA.split(" | ").length < pathB.split(" | ").length) {
			return -1;
		} else if (pathA.split(" | ").length > pathB.split(" | ").length) {
			return 1;
		} else {
			return pathA.localeCompare(pathB);
		}
	});
	const targetNode = virtualFlatTree[0][1][0];
	const targetPackageName = targetNode.packageName;

	for (const [, nodes] of virtualFlatTree) {
		let packageLoc;
		let [node, parentNode] = nodes;
		const {location, version} = node;
		const pkg = packageLockJson.packages[location];

		if (node.isLink) {
			// For linked packages, use the target node
			node = node.target;
		}

		if (node.packageName === targetPackageName) {
			// Make the target package the root package
			packageLoc = "";
			if (physicalTree[location]) {
				throw new Error(`Duplicate root package entry for "${targetPackageName}"`);
			}
		} else if (node.parent?.packageName === targetPackageName) {
			// Direct dependencies of the target package go into node_modules.
			packageLoc = `node_modules/${node.packageName}`;
		} else {
			packageLoc = normalizePackageLocation(location, node, targetPackageName);
		}


		const [, existingNode] = physicalTree.get(packageLoc) ?? [];
		// TODO: Optimize this
		const pathAlreadyReserved = virtualFlatTree
			.find((record) => record[1][0].location === packageLoc)?.[1]?.[0];
		if ((existingNode && existingNode.version !== version) ||
			(pathAlreadyReserved && pathAlreadyReserved.version !== version)
		) {
			const parentPath = normalizePackageLocation(parentNode.location, parentNode, targetPackageName);
			packageLoc = parentPath ? `${parentPath}/${packageLoc}` : packageLoc;
			console.warn(`Duplicate package location detected: "${packageLoc}"`);
		}

		if (packageLoc !== "" && !pkg.resolved) {
			// For all but the root package, ensure that "resolved" and "integrity" fields are present
			// These are always missing for locally linked packages, but sometimes also for others (e.g. if installed
			// from local cache)
			const {resolved, integrity} =
				await fetchPackageMetadata(node.packageName, node.version, workspaceRootDir);
			pkg.resolved = resolved;
			pkg.integrity = integrity;
		}

		physicalTree.set(packageLoc, [pkg, node]);
	}
}

function normalizePackageLocation(location, node, targetPackageName) {
	const topPackageName = node.top.packageName;
	const rootPackageName = node.root.packageName;
	let curLocation = location;
	if (topPackageName === targetPackageName) {
		// Remove location for packages within target package (e.g. @ui5/cli)
		curLocation = location.substring(node.top.location.length + 1);
	} else if (topPackageName !== rootPackageName) {
		// Add package within node_modules of actual package name (e.g. @ui5/fs)
		curLocation = `node_modules/${topPackageName}/${location.substring(node.top.location.length + 1)}`;
	}
	// If it's already within the root workspace package, keep as-is
	return curLocation.endsWith("/") ? curLocation.slice(0, -1) : curLocation;
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
