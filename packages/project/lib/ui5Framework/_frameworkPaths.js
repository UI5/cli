import path from "node:path";
import fs from "node:fs/promises";
import {promisify} from "node:util";

// Directory name for framework packages within ui5DataDir
export const FRAMEWORK_DIR_NAME = "framework";

// Lockfile staleness threshold — must match the value used by AbstractInstaller#_synchronize
export const LOCK_STALE_MS = 60000;

// Lock name acquired exclusively by cache cleanup — checked by installers to detect
// an in-progress cache deletion before acquiring a per-package lock.
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

/**
 * Resolve the absolute path to the framework locks directory within a UI5 data directory.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {string} Absolute path to the framework locks directory
 */
export function getFrameworkLockDir(ui5DataDir) {
	return path.join(ui5DataDir, FRAMEWORK_DIR_NAME, "locks");
}

/**
 * Check whether any active (non-stale) lockfiles exist in the given locks directory,
 * indicating an ongoing download or installation.
 *
 * @param {string} lockDir Absolute path to a locks directory
 * @returns {Promise<boolean>} True if any non-stale lockfiles are held
 */
export async function hasActiveLocks(lockDir) {
	let entries;
	try {
		entries = await fs.readdir(lockDir);
	} catch {
		return false;
	}

	const lockFiles = entries.filter((name) => name.endsWith(".lock"));
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
