import path from "node:path";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import {getLockDir, LOCK_STALE_MS} from "../utils/dataDir.js";

export {LOCK_STALE_MS};

// Directory name for framework packages within ui5DataDir
export const FRAMEWORK_DIR_NAME = "framework";

// Lock name acquired exclusively by cache cleanup — checked by installers to detect
// an in-progress cache deletion before acquiring a per-package lock.
//
// Lock naming convention (files live in getLockDir(); slashes in package
// names are replaced with dashes by AbstractInstaller#_sanitizeFileName):
//   cache-cleanup.lock       — held by ui5 cache clean for the full deletion
//   package-{pkg}@{ver}.lock — held by both installers during package extraction
//   server-{port}.lock       — held by ui5 serve for the full server lifetime
//   build-{pid}.lock         — held by ui5 build for the full build duration
export const CLEANUP_LOCK_NAME = "cache-cleanup.lock";

/**
 * Resolve the absolute path to the framework directory within a UI5 data directory.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {string} Absolute path to the framework directory
 */
export function getFrameworkDir(ui5DataDir) {
	return path.join(ui5DataDir, FRAMEWORK_DIR_NAME);
}

// Re-export for consumers that previously imported from here
export {getLockDir as getFrameworkLockDir};

/**
 * Check whether any active (non-stale) lockfiles exist in the given locks directory,
 * indicating an ongoing download or installation.
 *
 * @param {string} lockDir Absolute path to a locks directory
 * @param {object} [options]
 * @param {string} [options.exclude] Lock file name to skip (e.g. the caller's own lock)
 * @returns {Promise<boolean>} True if any non-stale lockfiles are held
 */
export async function hasActiveLocks(lockDir, {exclude} = {}) {
	let entries;
	try {
		entries = await fs.readdir(lockDir);
	} catch {
		return false;
	}

	const lockFiles = entries.filter((name) => name.endsWith(".lock") && name !== exclude);
	if (lockFiles.length === 0) {
		return false;
	}

	const {default: lockfile} = await import("lockfile");
	const check = promisify(lockfile.check);
	for (const lockFileName of lockFiles) {
		const lockPath = path.join(lockDir, lockFileName);
		const isLocked = await check(lockPath, {stale: LOCK_STALE_MS});
		if (isLocked) {
			return true;
		}
	}
	return false;
}
