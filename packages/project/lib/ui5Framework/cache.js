import fs from "node:fs/promises";
import path from "node:path";
import {
	FRAMEWORK_DIR_NAME,
	getFrameworkDir,
	getFrameworkLockDir,
	hasActiveLocks,
} from "./_frameworkPaths.js";

/**
 * Count unique projects, libraries, and versions in the packages/ subdirectory.
 * Uses a 3-level readdir walk (project → library → version) with no recursion into
 * package contents. Inner levels are parallelised with Promise.all to avoid serial
 * I/O on large caches.
 *
 * @param {string} packagesDir Absolute path to the packages directory
 * @returns {Promise<{projects: number, libraries: number, versions: number}|null>}
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
	let totalProjects = 0;

	await Promise.all(projectDirs.filter((e) => e.isDirectory()).map(async (project) => {
		let libDirs;
		try {
			libDirs = await fs.readdir(
				path.join(packagesDir, project.name), {withFileTypes: true});
		} catch {
			return;
		}

		let projectHasLibs = false;
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
				projectHasLibs = true;
				for (const v of installedVersions) {
					versionSet.add(v.name);
				}
			}
		}));

		if (projectHasLibs) {
			totalProjects++;
		}
	}));

	return librarySet.size > 0 ?
		{projects: totalProjects, libraries: librarySet.size, versions: versionSet.size} :
		null;
}

/**
 * Recursively remove a directory, calling onProgress(entryPath) for every
 * entry (file or directory) just before it is deleted.
 *
 * Uses manual traversal instead of fs.rm so callers can observe deletion
 * progress. Intentionally serial — parallelising unlink() calls does not
 * improve throughput on a single filesystem and makes the progress callback
 * ordering unpredictable.
 *
 * @param {string} dirPath Absolute path to the directory to remove
 * @param {function(string): void} onProgress Called with the path of each
 *   entry immediately before it is deleted
 * @returns {Promise<void>}
 */
async function rmRecursive(dirPath, onProgress) {
	let entries;
	try {
		entries = await fs.readdir(dirPath, {withFileTypes: true});
	} catch {
		return;
	}
	for (const entry of entries) {
		const entryPath = path.join(dirPath, entry.name);
		onProgress(entryPath);
		if (entry.isDirectory()) {
			await rmRecursive(entryPath, onProgress);
			await fs.rmdir(entryPath);
		} else {
			await fs.unlink(entryPath);
		}
	}
}

/**
 * Get framework cache info.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {Promise<{path: string, libraryCount: number, projectCount: number, versionCount: number}|null>}
 *   Framework cache info, or null if no packages are installed.
 */
export async function getCacheInfo(ui5DataDir) {
	const frameworkDir = getFrameworkDir(ui5DataDir);
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
		projectCount: stats.projects,
		versionCount: stats.versions,
	};
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
 * @param {function(string): void} [onProgress] Optional callback invoked with
 *   the absolute path of each entry just before it is deleted. Use for
 *   progress display. Omit for silent deletion (falls back to fs.rm).
 * @returns {Promise<{path: string, libraryCount: number, projectCount: number, versionCount: number}|null>}
 *   Removal result, or null if nothing was installed.
 * @throws {Error} If a framework operation is currently active (active lockfiles detected)
 */
export async function cleanCache(ui5DataDir, onProgress) {
	const frameworkDir = getFrameworkDir(ui5DataDir);

	try {
		await fs.access(frameworkDir);
	} catch {
		return null;
	}

	const stats = await getPackageStats(path.join(frameworkDir, "packages"));
	if (!stats) {
		return null;
	}

	if (await hasActiveLocks(getFrameworkLockDir(ui5DataDir))) {
		throw new Error(
			"Framework cache is currently locked by an active operation. " +
			"Please wait for it to finish and try again."
		);
	}

	if (onProgress) {
		await rmRecursive(frameworkDir, onProgress);
		await fs.rmdir(frameworkDir);
	} else {
		await fs.rm(frameworkDir, {recursive: true, force: true});
	}

	return {
		path: FRAMEWORK_DIR_NAME,
		libraryCount: stats.libraries,
		projectCount: stats.projects,
		versionCount: stats.versions,
	};
}
