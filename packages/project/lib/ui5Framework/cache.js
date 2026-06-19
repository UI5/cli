import fs from "node:fs/promises";
import path from "node:path";
import {getLockDir, CLEANUP_LOCK_NAME, hasActiveLocks, withLock} from "../utils/lock.js";

const FRAMEWORK_DIR_NAME = "framework";

/**
 * Count unique libraries and versions in the packages/ subdirectory.
 * Uses a 3-level readdir walk (project → library → version) with no recursion into
 * package contents. Inner levels are parallelised with Promise.all to avoid serial
 * I/O on large caches.
 *
 * Library names are deduplicated globally: sap.m under @openui5 and @sapui5 counts
 * as one library.
 *
 * @param {string} packagesDir Absolute path to the packages directory
 * @returns {Promise<{libraries: number, versions: number}|null>}
 *   Null if the directory does not exist or contains no installed libraries.
 */
async function getPackageStats(packagesDir) {
	let projectDirs;
	try {
		projectDirs = await fs.readdir(packagesDir, {withFileTypes: true});
	} catch {
		return null;
	}

	const librarySet = new Set();
	const versionSet = new Set();

	await Promise.all(projectDirs.filter((e) => e.isDirectory()).map(async (project) => {
		let libDirs;
		try {
			libDirs = await fs.readdir(
				path.join(packagesDir, project.name), {withFileTypes: true});
		} catch {
			return;
		}

		await Promise.all(libDirs.filter((e) => e.isDirectory()).map(async (lib) => {
			let versionDirs;
			try {
				versionDirs = await fs.readdir(
					path.join(packagesDir, project.name, lib.name), {withFileTypes: true});
			} catch {
				return;
			}
			const installedVersions = versionDirs.filter((v) => v.isDirectory());
			if (installedVersions.length > 0) {
				librarySet.add(lib.name); // deduplicated: sap.m counts once across all projects
				for (const v of installedVersions) {
					versionSet.add(v.name);
				}
			}
		}));
	}));

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
	try {
		await fs.access(frameworkDir);
	} catch {
		return null;
	}

	const stats = await getPackageStats(path.join(frameworkDir, "packages"));
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
 * processes see an active lock and wait rather than writing into a
 * partially-deleted cache. The locks/ directory is preserved throughout
 * the deletion and removed only after the lock is released.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, libraryCount: number, versionCount: number}|null>}
 *   Removal result, or null if nothing was installed.
 * @throws {Error} If a framework operation is currently active (active lockfiles detected)
 */
export async function cleanCache(ui5DataDir) {
	const frameworkDir = path.join(ui5DataDir, FRAMEWORK_DIR_NAME);

	try {
		await fs.access(frameworkDir);
	} catch {
		return null;
	}

	const stats = await getPackageStats(path.join(frameworkDir, "packages"));
	if (!stats) {
		return null;
	}

	const lockDir = getLockDir(ui5DataDir);
	const lockPath = path.join(lockDir, CLEANUP_LOCK_NAME);

	// Acquire first, then check — ensures installers running concurrently will see
	// the cleanup lock and abort before writing into a directory being deleted.
	await withLock(lockPath, async () => {
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
		await Promise.all(
			entries
				.map((e) => {
					const p = path.join(frameworkDir, e.name);
					return e.isDirectory() ?
						fs.rm(p, {recursive: true, force: true}) :
						fs.unlink(p);
				})
		);
	});

	return {
		path: FRAMEWORK_DIR_NAME,
		libraryCount: stats.libraries,
		versionCount: stats.versions,
	};
}
