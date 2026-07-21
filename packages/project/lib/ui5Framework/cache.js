import fs from "node:fs/promises";
import path from "node:path";
import {getRandomValues} from "node:crypto";

const FRAMEWORK_DIR_NAME = "framework";

/**
 * Prefix used for staging directories created during an atomic framework cache clean.
 * The directory is renamed to this prefix + a random hex suffix before deletion so that
 * the original path is immediately removed and the deletion can proceed outside the rename.
 */
const STAGING_DIR_PREFIX = "_framework_to_delete_";

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
export async function cleanAdditional(ui5DataDir) {
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
 * Uses an atomic rename to make the framework directory disappear in a single
 * filesystem operation:
 *
 *  1. Clear cacache's in-process memoization (no path needed — global operation).
 *  2. Atomically rename <code>framework/</code> to a hidden staging dir.
 *     After this point the original path no longer exists: concurrent builds will
 *     see it as absent and create a fresh <code>framework/</code> directory.
 *  3. Delete the staging dir recursively. Its contents are now fully private
 *     to this operation.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, libraryCount: number, versionCount: number}|null>}
 *   Removal result, or null if no framework packages were installed.
 */
export async function cleanCache(ui5DataDir) {
	const frameworkDir = path.join(ui5DataDir, FRAMEWORK_DIR_NAME);
	const stats = await getPackageStats(frameworkDir);
	if (!stats) {
		return null;
	}

	// Clear cacache's in-process memoization before the rename.
	// clearMemoized() operates globally (no path argument) and is synchronous.
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

	await fs.rm(stagingDir, {recursive: true, force: true});

	return {
		path: FRAMEWORK_DIR_NAME,
		libraryCount: stats.libraries,
		versionCount: stats.versions,
	};
}
