import path from "node:path";
import fs from "node:fs/promises";

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
 * Get framework cache info.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, size: number, type: string}|null>} Framework cache info or null
 */
export async function getCacheInfo(ui5DataDir) {
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
 * @returns {Promise<{path: string, type: string, size: number}|null>} Removal result or null
 */
export async function cleanCache(ui5DataDir) {
	const frameworkDir = path.join(ui5DataDir, "framework");
	try {
		const size = await getDirectorySize(frameworkDir);
		if (size > 0) {
			await fs.rm(frameworkDir, {recursive: true, force: true});
			return {
				path: "framework",
				type: "framework",
				size
			};
		}
	} catch {
		// Directory doesn't exist or couldn't be removed
	}
	return null;
}
