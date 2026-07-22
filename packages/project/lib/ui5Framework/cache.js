import fs from "node:fs/promises";
import path from "node:path";
import {getRandomValues} from "node:crypto";

/**
 * Utilities for cleaning the UI5 framework cache.
 *
 * @public
 * @module @ui5/project/ui5Framework/cache
 */

const FRAMEWORK_DIR_NAME = "framework";

/**
 * Prefix used for staging directories created during an atomic framework cache clean.
 * The directory is renamed to this prefix + a random hex suffix before deletion so that
 * the original path is immediately removed and the deletion can proceed outside the rename.
 */
const STAGING_DIR_PREFIX = "_framework_to_delete_";

/**
 * Provides static utilities for inspecting and cleaning the UI5 framework cache.
 *
 * @public
 */
export default class FrameworkCache {
	/**
	 * Get framework cache info.
	 *
	 * @public
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{path: string, libraryCount: number, versionCount: number}|null>}
	 *   Framework cache info, or null if no packages are installed.
	 */
	static async getCacheInfo(ui5DataDir) {
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
	 * Get additional framework cache info.
	 *
	 * Scans ui5DataDir for orphaned staging directories left behind by previously
	 * interrupted clean operations (i.e. process killed after rename but before deletion).
	 * Returns stats per orphan without deleting anything.
	 *
	 * @public
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<Array<{path: string, libraryCount: number, versionCount: number}>>}
	 */
	static async getAdditionalCacheInfo(ui5DataDir) {
		let entries;
		try {
			entries = await fs.readdir(ui5DataDir, {withFileTypes: true});
		} catch {
			return [];
		}

		const staleDirs = entries.filter(
			(e) => e.isDirectory() && e.name.startsWith(STAGING_DIR_PREFIX)
		);

		if (staleDirs.length === 0) {
			return [];
		}

		const results = await Promise.all(staleDirs.map(async (staleDir) => {
			const staleDirPath = path.join(ui5DataDir, staleDir.name);
			const stats = await getPackageStats(staleDirPath);
			if (!stats) {
				return null;
			}
			return {
				path: staleDir.name,
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
	 * @public
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<Array<{path: string, libraryCount: number, versionCount: number}>>}
	 */
	static async cleanAdditional(ui5DataDir) {
		const staleDirs = await FrameworkCache.getAdditionalCacheInfo(ui5DataDir);

		for (const staleDir of staleDirs) {
			const staleDirPath = path.join(ui5DataDir, staleDir.path);
			try {
				await fs.rm(staleDirPath, {recursive: true, force: true});
			} catch {
				// Ignore deletion errors
			}
		}

		return staleDirs;
	}

	/**
	 * Clean the framework cache directory.
	 *
	 * Returns <code>null</code> if no framework packages are installed.
	 * Otherwise uses an atomic rename to make the framework directory disappear in a single
	 * filesystem operation:
	 *
	 *  1. Clear cacache's in-process memoization (no path needed — global operation).
	 *  2. Atomically rename <code>framework/</code> to a staging dir.
	 *     After this point the original path no longer exists.
	 *  3. Delete the staging dir recursively. Its contents are now fully private
	 *     to this operation.
	 *
	 * @public
	 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
	 * @returns {Promise<{path: string, libraryCount: number, versionCount: number}|null>}
	 *   Removal result, or null if no framework packages were installed.
	 */
	static async cleanCache(ui5DataDir) {
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
}

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

	const libDirs = (await Promise.all(extractSubDir(projectDirs))).filter(Boolean).flat();
	const versionDirs = (await Promise.all(extractSubDir(libDirs))).filter(Boolean).flat();

	const librarySet = new Set(libDirs.map((e) => e.name));
	const versionSet = new Set(versionDirs.map((e) => e.name));

	return librarySet.size > 0 ?
		{libraries: librarySet.size, versions: versionSet.size} :
		null;
}

