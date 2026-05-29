import path from "node:path";
import fs from "node:fs/promises";
import BuildCacheStorage from "../build/cache/BuildCacheStorage.js";
import {CACHE_VERSION} from "../build/cache/CacheManager.js";

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
 * Check what cache items exist and their sizes without removing them.
 *
 * @param {object} options
 * @param {string} options.ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<Array<{path: string, size: number, type: string}>>} List of cache items
 */
export async function getCacheInfo({ui5DataDir}) {
	const items = [];

	// Check framework cache
	const frameworkDir = path.join(ui5DataDir, "framework");
	try {
		await fs.access(frameworkDir);
		const size = await getDirectorySize(frameworkDir);
		if (size > 0) {
			items.push({
				path: "framework/",
				size,
				type: "directory"
			});
		}
	} catch {
		// Directory doesn't exist
	}

	// Check build cache (only current version)
	const buildCacheDir = path.join(ui5DataDir, "buildCache");
	const dbDir = path.join(buildCacheDir, CACHE_VERSION);
	try {
		await fs.access(dbDir);
		const storage = new BuildCacheStorage(dbDir);
		try {
			if (storage.hasRecords()) {
				const size = await getDirectorySize(buildCacheDir);
				items.push({
					path: `buildCache/${CACHE_VERSION} (database records)`,
					size,
					type: "database"
				});
			}
		} finally {
			storage.close();
		}
	} catch {
		// Skip if database can't be opened or doesn't exist
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

	// Clean framework cache
	const frameworkDir = path.join(ui5DataDir, "framework");
	try {
		const size = await getDirectorySize(frameworkDir);
		if (size > 0) {
			await fs.rm(frameworkDir, {recursive: true, force: true});
			allRemoved.push({
				path: "framework",
				type: "framework",
				size
			});
		}
	} catch {
		// Directory doesn't exist or couldn't be removed
	}

	// Clean build cache (only current version)
	const buildCacheDir = path.join(ui5DataDir, "buildCache");
	const dbDir = path.join(buildCacheDir, CACHE_VERSION);
	try {
		await fs.access(dbDir);
		const storage = new BuildCacheStorage(dbDir);
		try {
			const freedSize = storage.clearAllRecords();
			allRemoved.push({
				path: `buildCache/${CACHE_VERSION}`,
				type: "buildCache",
				size: freedSize
			});
		} finally {
			storage.close();
		}
	} catch {
		// Database doesn't exist or couldn't be cleared
	}

	const totalSize = allRemoved.reduce((sum, entry) => sum + entry.size, 0);
	return {
		entries: allRemoved,
		totalSize,
		totalCount: allRemoved.length,
	};
}
