import fs from "node:fs/promises";
import path from "node:path";
import {getLockDir, CLEANUP_LOCK_NAME, hasActiveLocks, acquireLock} from "../utils/lock.js";

const FRAMEWORK_DIR_NAME = "framework";

/**
 * Count unique libraries and versions in the packages/ subdirectory.
 *
 * Library names are deduplicated globally: sap.m under @openui5 and @sapui5 counts
 * as one library.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{libraries: number, versions: number}|null>}
 *   Null if the directory does not exist or contains no installed libraries.
 */
async function getPackageStats(ui5DataDir) {
	const frameworkDir = path.join(ui5DataDir, FRAMEWORK_DIR_NAME);
	try {
		await fs.access(frameworkDir);
	} catch {
		return null;
	}

	const packagesDir = path.join(frameworkDir, "packages");
	let projectDirs;
	try {
		projectDirs = await fs.readdir(packagesDir, {withFileTypes: true});
	} catch {
		return null;
	}

	const extractSubDir = (dirList) => {
		return dirList.filter((e) => e.isDirectory())
			.map((currentDir) => {
				try {
					return fs.readdir(path.join(currentDir.parentPath, currentDir.name), {withFileTypes: true});
				} catch {
					return;
				}
			});
	};

	const libDirs = (await Promise.all(extractSubDir(projectDirs))).flat();
	const versionDirs = (await Promise.all(extractSubDir(libDirs))).flat();

	const librarySet = new Set(libDirs.map((e) => e.name));
	const versionSet = new Set(versionDirs.map((e) => e.name));

	return librarySet.size > 0 ?
		{libraries: librarySet.size, versions: versionSet.size} :
		null;
}

/**
 * Get framework cache info.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, libraryCount: number, versionCount: number}|null>}
 *   Framework cache info, or null if no packages are installed.
 */
export async function getCacheInfo(ui5DataDir) {
	const stats = await getPackageStats(ui5DataDir);
	if (!stats) {
		return null;
	}
	return {
		path: FRAMEWORK_DIR_NAME,
		libraryCount: stats.libraries,
		versionCount: stats.versions,
	};
}

/**
 * Clean framework cache directory.
 *
 * Acquires a cleanup lock before deletion so that concurrent installer
 * processes see an active lock and abort rather than writing into a
 * directory that is being deleted.
 *
 * The lock directory (<code>~/.ui5/locks/</code>) is outside
 * <code>~/.ui5/framework/</code> and is not affected by the deletion.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, libraryCount: number, versionCount: number}|null>}
 *   Removal result, or null if nothing was installed.
 * @throws {Error} If a framework operation is currently active (active lockfiles detected)
 */
export async function cleanCache(ui5DataDir) {
	const stats = await getPackageStats(ui5DataDir);
	if (!stats) {
		return null;
	}

	const lockDir = getLockDir(ui5DataDir);
	const lockPath = path.join(lockDir, CLEANUP_LOCK_NAME);
	const frameworkDir = path.join(ui5DataDir, FRAMEWORK_DIR_NAME);

	// Acquire first, then check — ensures installers running concurrently will see
	// the cleanup lock and abort before writing into a directory being deleted.
	const releaseCleanupLock = await acquireLock(lockPath);
	try {
		if (await hasActiveLocks(lockDir, {exclude: CLEANUP_LOCK_NAME})) {
			throw new Error(
				"Framework cache is currently locked by an active operation. " +
				"Please wait for it to finish and try again."
			);
		}

		// Use cacache's own rm.all to clear the pacote download cache.
		// This respects cacache's internal structure (content-v2/, index-v5/)
		// and clears in-memory memoization, which a plain fs.rm would not do.
		const caCacheDir = path.join(frameworkDir, "cacache");
		try {
			await fs.access(caCacheDir);
			const {rm: cacacheRm} = await import("cacache");
			await cacacheRm.all(caCacheDir);
		} catch {
			// cacache dir doesn't exist or cacache not available — no-op
		}

		// Delete everything inside framework/
		const entries = await fs.readdir(frameworkDir, {withFileTypes: true});
		await Promise.all(entries.map((entry) => {
			const curDir = path.join(frameworkDir, entry.name);
			return entry.isDirectory() ?
				fs.rm(curDir, {recursive: true, force: true}) :
				fs.unlink(curDir);
		}));
	} finally {
		releaseCleanupLock();
	}

	return {
		path: FRAMEWORK_DIR_NAME,
		libraryCount: stats.libraries,
		versionCount: stats.versions,
	};
}
