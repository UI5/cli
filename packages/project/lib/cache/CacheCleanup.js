import path from "node:path";
import fs from "node:fs/promises";
import BuildCacheStorage from "../build/cache/BuildCacheStorage.js";

/**
 * Get the size of a directory tree recursively.
 *
 * @param {string} dirPath Absolute path to directory
 * @returns {Promise<number>} Total size in bytes
 */
async function getDirectorySize(dirPath) {
	let total = 0;
	let entries;
	try {
		entries = await fs.readdir(dirPath, {withFileTypes: true});
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const entryPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			total += await getDirectorySize(entryPath);
		} else {
			try {
				const stat = await fs.stat(entryPath);
				total += stat.size;
			} catch {
				// Skip inaccessible files
			}
		}
	}
	return total;
}

/**
 * Clean a single directory by removing it entirely.
 *
 * @param {string} dirPath Absolute path to directory
 * @param {string} displayPath Path to display in results
 * @param {string} type Type of cache entry
 * @returns {Promise<Array<{path: string, type: string, size: number}>>} Removed entries
 */
async function cleanDirectory(dirPath, displayPath, type) {
	const removed = [];
	try {
		await fs.access(dirPath);
	} catch {
		return removed;
	}

	const size = await getDirectorySize(dirPath);
	try {
		await fs.rm(dirPath, {recursive: true, force: true});
		removed.push({path: displayPath, type, size});
	} catch {
		// Skip on failure
	}
	return removed;
}

/**
 * Clean build cache directory by clearing all records from the SQLite database.
 *
 * @param {string} buildCacheDir Path to buildCache/
 * @returns {Promise<Array<{path: string, type: string, size: number}>>} Removed entries
 */
async function cleanBuildCache(buildCacheDir) {
	const removed = [];
	try {
		await fs.access(buildCacheDir);
	} catch {
		return removed;
	}

	let versionDirs;
	try {
		versionDirs = await fs.readdir(buildCacheDir, {withFileTypes: true});
	} catch {
		return removed;
	}


	for (const versionDir of versionDirs) {
		if (!versionDir.isDirectory()) {
			continue;
		}

		const dbDir = path.join(buildCacheDir, versionDir.name);

		const storage = new BuildCacheStorage(dbDir);
		const freedSize = storage.clearAllRecords();
		storage.close();

		removed.push({
			path: `buildCache/${versionDir.name}`,
			type: "buildCache",
			size: freedSize,
		});
	}

	return removed;
}

/**
 * Scans the UI5 data directory and removes all cache entries.
 *
 * @param {object} options
 * @param {string} options.ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{entries: Array<{path: string, type: string, size: number}>,
 *   totalSize: number, totalCount: number}>}
 */
export async function cleanCache({ui5DataDir}) {
	const allRemoved = [];

	// Clean framework packages
	allRemoved.push(...await cleanDirectory(
		path.join(ui5DataDir, "framework", "packages"),
		"framework/packages",
		"framework"
	));

	// Clean cacache
	allRemoved.push(...await cleanDirectory(
		path.join(ui5DataDir, "framework", "cacache"),
		"framework/cacache",
		"cacache"
	));

	// Clean build cache (special: clears DB records, not files)
	allRemoved.push(...await cleanBuildCache(path.join(ui5DataDir, "buildCache")));

	// Clean misc dirs
	const miscDirs = [
		["framework/staging", "staging"],
		["framework/locks", "locks"],
		["server", "server"],
	];
	for (const [rel, type] of miscDirs) {
		allRemoved.push(...await cleanDirectory(path.join(ui5DataDir, rel), rel, type));
	}

	const totalSize = allRemoved.reduce((sum, entry) => sum + entry.size, 0);
	return {
		entries: allRemoved,
		totalSize,
		totalCount: allRemoved.length,
	};
}
