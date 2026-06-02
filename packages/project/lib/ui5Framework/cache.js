import fs from "node:fs/promises";
import path from "node:path";
import {
	FRAMEWORK_DIR_NAME,
	getFrameworkDir,
	getFrameworkLockDir,
	hasActiveLocks,
} from "./_frameworkPaths.js";

/**
 * Count all files in a directory tree recursively.
 * Returns 0 if the directory does not exist or any entry is unreadable.
 *
 * @param {string} dirPath Absolute path to directory
 * @returns {Promise<number>} Total file count
 */
async function countFiles(dirPath) {
	let total = 0;
	let entries;
	try {
		entries = await fs.readdir(dirPath, {withFileTypes: true});
	} catch {
		return 0;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			total += await countFiles(path.join(dirPath, entry.name));
		} else {
			total++;
		}
	}
	return total;
}

/**
 * Get framework cache info.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, count: number}|null>} Framework cache info or null
 */
export async function getCacheInfo(ui5DataDir) {
	const frameworkDir = getFrameworkDir(ui5DataDir);
	try {
		await fs.access(frameworkDir);
		const count = await countFiles(frameworkDir);
		if (count > 0) {
			return {
				path: FRAMEWORK_DIR_NAME + "/",
				count,
			};
		}
	} catch {
		// Directory doesn't exist
	}
	return null;
}

/**
 * Check whether an active (non-stale) framework lock is currently held,
 * indicating an ongoing download or installation.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<boolean>} True if an active lock is held
 */
export async function isFrameworkLocked(ui5DataDir) {
	return hasActiveLocks(getFrameworkLockDir(ui5DataDir));
}

/**
 * Clean framework cache directory.
 *
 * Checks for active lockfiles before removing the directory to prevent
 * deleting files while a download is in progress.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, count: number}|null>} Removal result or null
 * @throws {Error} If a framework operation is currently active (active lockfiles detected)
 */
export async function cleanCache(ui5DataDir) {
	const frameworkDir = getFrameworkDir(ui5DataDir);
	const count = await countFiles(frameworkDir);
	if (count === 0) {
		return null;
	}

	if (await hasActiveLocks(getFrameworkLockDir(ui5DataDir))) {
		throw new Error(
			"Framework cache is currently locked by an active operation. " +
			"Please wait for it to finish and try again."
		);
	}

	await fs.rm(frameworkDir, {recursive: true, force: true});
	return {
		path: FRAMEWORK_DIR_NAME,
		count,
	};
}
