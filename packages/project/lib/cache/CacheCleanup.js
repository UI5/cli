import path from "node:path";
import fs from "node:fs/promises";
import BuildCacheStorage from "../build/cache/BuildCacheStorage.js";

// ========================================
// SHARED UTILITIES
// ========================================

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

// ========================================
// FRAMEWORK CACHE (ui5Framework namespace)
// Manages: framework/packages, framework/cacache,
//          framework/staging, framework/locks, etc.
// ========================================

/**
 * Check if framework cache exists and get its info.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, size: number, type: string}|null>} Framework cache info or null
 */
async function getFrameworkCacheInfo(ui5DataDir) {
	const frameworkDir = path.join(ui5DataDir, "framework");
	try {
		await fs.access(frameworkDir);
		const size = await getDirectorySize(frameworkDir);
		if (size > 0) {
			return {
				path: "framework/",
				size,
				type: "directory"
			};
		}
	} catch {
		// Directory doesn't exist
	}
	return null;
}

/**
 * Clean framework cache directory.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @param {{path: string, size: number, type: string}} frameworkInfo Framework cache info
 * @returns {Promise<{path: string, type: string, size: number}|null>} Removal result or null
 */
async function cleanFrameworkCache(ui5DataDir, frameworkInfo) {
	if (!frameworkInfo) {
		return null;
	}

	const frameworkDir = path.join(ui5DataDir, "framework");
	try {
		await fs.rm(frameworkDir, {recursive: true, force: true});
		return {
			path: "framework",
			type: "framework",
			size: frameworkInfo.size
		};
	} catch {
		// Framework directory couldn't be removed
	}
	return null;
}

// ========================================
// BUILD CACHE (build/cache namespace)
// Manages: buildCache/v*/ SQLite databases
// ========================================

/**
 * Check if build cache exists and get its info.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, size: number, type: string}|null>} Build cache info or null
 */
async function getBuildCacheInfo(ui5DataDir) {
	const buildCacheDir = path.join(ui5DataDir, "buildCache");
	try {
		await fs.access(buildCacheDir);
		const versionDirs = await fs.readdir(buildCacheDir, {withFileTypes: true});

		let hasAnyRecords = false;
		for (const versionDir of versionDirs) {
			if (!versionDir.isDirectory()) {
				continue;
			}

			const dbDir = path.join(buildCacheDir, versionDir.name);
			try {
				const storage = new BuildCacheStorage(dbDir);
				if (storage.hasRecords()) {
					hasAnyRecords = true;
					storage.close();
					break;
				}
				storage.close();
			} catch {
				// Skip if database can't be opened
			}
		}

		if (hasAnyRecords) {
			const size = await getDirectorySize(buildCacheDir);
			return {
				path: "buildCache/ (database records)",
				size,
				type: "database"
			};
		}
	} catch {
		// Directory doesn't exist
	}
	return null;
}

/**
 * Clean build cache by clearing all records from SQLite databases.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<Array<{path: string, type: string, size: number}>>} Removed entries
 */
async function cleanBuildCache(ui5DataDir) {
	const buildCacheDir = path.join(ui5DataDir, "buildCache");
	const removed = [];

	try {
		await fs.access(buildCacheDir);
	} catch {
		return removed;
	}

	let cacheVersionDirs;
	try {
		cacheVersionDirs = await fs.readdir(buildCacheDir, {withFileTypes: true});
	} catch {
		return removed;
	}

	for (const versionDir of cacheVersionDirs) {
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

// ========================================
// PUBLIC API - Orchestrates both caches
// ========================================

/**
 * Check what cache items exist and their sizes without removing them.
 *
 * @param {object} options
 * @param {string} options.ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<Array<{path: string, size: number, type: string}>>} List of cache items
 */
export async function getCacheInfo({ui5DataDir}) {
	const items = [];

	// Check framework cache
	const frameworkInfo = await getFrameworkCacheInfo(ui5DataDir);
	if (frameworkInfo) {
		items.push(frameworkInfo);
	}

	// Check build cache
	const buildInfo = await getBuildCacheInfo(ui5DataDir);
	if (buildInfo) {
		items.push(buildInfo);
	}

	return items;
}

/**
 * Cleans cache directories for framework libraries and incremental build cache.
 *
 * Removes:
 * - framework/ directory: All UI5 framework libraries, download cache, staging files, and locks
 * - buildCache/ entries: Clears database records (preserves database files)
 *
 * @param {object} options
 * @param {string} options.ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{entries: Array<{path: string, type: string, size: number}>,
 *   totalSize: number, totalCount: number}>}
 */
export async function cleanCache({ui5DataDir}) {
	const allRemoved = [];

	// Get info about what exists
	const items = await getCacheInfo({ui5DataDir});

	// Clean framework cache
	const frameworkItem = items.find((item) => item.path === "framework/");
	const frameworkResult = await cleanFrameworkCache(ui5DataDir, frameworkItem);
	if (frameworkResult) {
		allRemoved.push(frameworkResult);
	}

	// Clean build cache
	const buildCacheItem = items.find((item) => item.type === "database");
	if (buildCacheItem) {
		allRemoved.push(...await cleanBuildCache(ui5DataDir));
	}

	const totalSize = allRemoved.reduce((sum, entry) => sum + entry.size, 0);
	return {
		entries: allRemoved,
		totalSize,
		totalCount: allRemoved.length,
	};
}
