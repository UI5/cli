import fs from "node:fs/promises";
import path from "node:path";
import {getRandomValues} from "node:crypto";
import {getLockDir, CLEANUP_LOCK_NAME, hasActiveLocks, acquireLock} from "../utils/lock.js";

const FRAMEWORK_DIR_NAME = "framework";

/**
 * Prefix used for staging directories created during an atomic framework cache clean.
 * The directory is renamed to this prefix + a random hex suffix before deletion so that
 * the original path immediately becomes unavailable to concurrent processes.
 */
const STAGING_DIR_PREFIX = ".framework_to_delete_";

/**
 * Count unique libraries and versions in the packages/ subdirectory.
 *
 * Library names are deduplicated globally: sap.m under @openui5 and @sapui5 counts
 * as one library.
 *
 * @param {string} frameworkDir Absolute path to the framework directory
 * @returns {Promise<{libraries: number, versions: number}|null>}
 *   Null if the directory does not exist or contains no installed libraries.
 */
async function getPackageStats(frameworkDir) {
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
	const frameworkDir = path.join(ui5DataDir, FRAMEWORK_DIR_NAME);
	const stats = await getPackageStats(frameworkDir);
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
 * Scans ui5DataDir for orphaned staging directories left behind by previously
 * interrupted clean operations (i.e. process killed after rename but before deletion).
 * Returns stats per orphan without deleting anything.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<Array<{path: string, libraryCount: number, versionCount: number}>>}
 */
export async function getOrphanedInfo(ui5DataDir) {
	let entries;
	try {
		entries = await fs.readdir(ui5DataDir, {withFileTypes: true});
	} catch {
		return [];
	}

	const orphans = entries.filter(
		(e) => e.isDirectory() && e.name.startsWith(STAGING_DIR_PREFIX)
	);

	if (orphans.length === 0) {
		return [];
	}

	const results = await Promise.all(orphans.map(async (orphan) => {
		const orphanDir = path.join(ui5DataDir, orphan.name);
		const stats = await getPackageStats(orphanDir);
		if (!stats) {
			return null;
		}
		return {
			path: orphan.name,
			libraryCount: stats.libraries,
			versionCount: stats.versions,
		};
	}));

	return results.filter(Boolean);
}

/**
 * Scans ui5DataDir for orphaned staging directories left behind by previously
 * interrupted clean operations (i.e. process killed after rename but before deletion).
 *
 * Returns an array of result objects — one per orphaned directory found — each
 * containing the path, library count and version count so the caller can include
 * them in the cleanup summary.
 *
 * Deletion failures are swallowed per entry so one stuck directory does not prevent
 * the others from being removed.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<Array<{path: string, libraryCount: number, versionCount: number}>>}
 */
async function cleanupOrphanedStagingDirs(ui5DataDir) {
	const orphans = await getOrphanedInfo(ui5DataDir);

	for (const orphan of orphans) {
		const orphanDir = path.join(ui5DataDir, orphan.path);
		try {
			await fs.rm(orphanDir, {recursive: true, force: true});
		} catch {
			// Ignore deletion errors
		}
	}

	return orphans;
}

/**
 * Clean the framework cache directory.
 *
 * Strategy
 * ────────
 * Rather than deleting files one-by-one while holding the cleanup lock (which
 * can take seconds on large caches), the clean uses an atomic rename to make the
 * directory disappear in a single filesystem operation:
 *
 *  1. Acquire the cleanup lock and verify no other framework operation is active.
 *  2. Clear cacache's in-process memoization (no path needed — global operation).
 *  3. Atomically rename <code>framework/</code> to a hidden staging dir.
 *     After this point the original path no longer exists: concurrent builds will
 *     see it as absent and create a fresh <code>framework/</code> directory.
 *  4. Release the cleanup lock immediately — it is now safe because the original
 *     path is gone and the staging dir is not referenced by any other component.
 *  5. Delete the staging dir recursively outside the lock — its contents are
 *     now fully private to this operation.
 *  6. Collect stats and scan for orphaned staging dirs from previous interrupted cleans.
 *
 * Orphaned staging dirs from previous interrupted runs are also collected and
 * deleted, and their stats are included in the return value.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{
 *   path: string,
 *   libraryCount: number,
 *   versionCount: number,
 *   orphaned: Array<{path: string, libraryCount: number, versionCount: number}>
 * }|null>}
 *   Removal result including orphaned-dir stats, or null if nothing was installed.
 * @throws {Error} If a framework operation is currently active (active lockfiles detected)
 */
export async function cleanCache(ui5DataDir) {
	const frameworkDir = path.join(ui5DataDir, FRAMEWORK_DIR_NAME);
	const stats = await getPackageStats(frameworkDir);
	// No active framework to clean. Exit early,
	// but there may be orphaned staging dirs from previous interrupted cleans.
	if (!stats) {
		// No need to lock here as the orphaned cleanup is and safe to run concurrently
		// and independently of other operations.
		// Note: In case of orphaned dirs have occupied much space, this cleanup might take a while.
		const orphaned = await cleanupOrphanedStagingDirs(ui5DataDir);

		if (orphaned.length > 0) {
			return {
				path: FRAMEWORK_DIR_NAME,
				libraryCount: 0,
				versionCount: 0,
				orphaned
			};
		} else {
			// No active framework to clean — return null only if there were also no orphans.
			// If orphans were cleaned, still return null (caller handles orphan-only reporting separately).
			return null;
		}
	}

	const lockDir = getLockDir(ui5DataDir);
	const lockPath = path.join(lockDir, CLEANUP_LOCK_NAME);

	// Acquire first, then check — ensures concurrent framework operations will see
	// the cleanup lock and abort before we start the rename.
	const releaseCleanupLock = await acquireLock(lockPath);
	let orphaned = [];
	try {
		if (await hasActiveLocks(ui5DataDir, {exclude: CLEANUP_LOCK_NAME})) {
			throw new Error(
				"Framework cache is currently locked by an active operation. " +
				"Please wait for it to finish and try again."
			);
		}

		// Clear cacache's in-process memoization before the rename.
		// clearMemoized() operates globally (no path argument) and is synchronous,
		// so it is safe to call here before the directory moves.
		try {
			const {clearMemoized} = await import("cacache");
			clearMemoized();
		} catch {
			// cacache not available — no-op
		}

		// Atomically rename framework/ to a staging directory.
		// fs.rename is a single syscall and completes in microseconds.
		// After this line the original path no longer exists.
		const stagingDir = path.join(
			ui5DataDir,
			`${STAGING_DIR_PREFIX}${Buffer.from(getRandomValues(new Uint8Array(2))).toString("hex")}`
		);
		await fs.rename(frameworkDir, stagingDir);

		// Release the lock immediately after the atomic rename.
		// The original path is gone — no concurrent installer can write into it.
		// Holding the lock during the slow recursive deletion below is unnecessary
		// and would block other operations for no safety benefit.
		releaseCleanupLock();

		// Delete the staging directory. Do not delegate to cleanupOrphanedStagingDirs()
		// as this is the target dir we want to delete and the summary should not include it in the orphaned list.
		await fs.rm(stagingDir, {recursive: true, force: true});

		// Cleanup any orphaned staging directories from previous interrupted cleans.
		// This operation is NOT prior the rename of the framework directory, because
		// we want to release the lock as soon as possible after the rename.
		// The orphaned cleanup is safe to run concurrently and independently of other operations.
		orphaned = await cleanupOrphanedStagingDirs(ui5DataDir);
	} catch (err) {
		// Release the lock if we haven't already (i.e. an error occurred before the rename).
		releaseCleanupLock();
		throw err;
	}

	return {
		path: FRAMEWORK_DIR_NAME,
		libraryCount: stats.libraries,
		versionCount: stats.versions,
		orphaned,
	};
}
