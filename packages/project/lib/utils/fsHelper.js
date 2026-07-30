import {stat} from "node:fs/promises";
import path from "node:path";

// Mirrors packages/cli/lib/utils/fsHelper.js. Kept as a separate copy per package for now;
// at a later time these might be consolidated into a lower-level package for better reuse.

/**
 * Checks if a file or path exists
 *
 * @private
 * @param {string} filePath Path to check
 * @returns {Promise} Promise resolving with true if the file or path exists
 */
export async function exists(filePath) {
	try {
		await stat(filePath);
		return true;
	} catch (err) {
		// "File or directory does not exist"
		if (err.code === "ENOENT") {
			return false;
		} else {
			throw err;
		}
	}
}

/**
 * Checks if a list of paths exists
 *
 * @private
 * @param {Array} paths List of paths to check
 * @param {string} cwd Current working directory
 * @returns {Promise} Resolving with an array of booleans for each path
 */
export async function pathsExist(paths, cwd) {
	return await Promise.all(paths.map((p) => exists(path.join(cwd, p))));
}

/**
 * Checks if a path exists and is a directory
 *
 * @private
 * @param {string} dirPath Path to check
 * @returns {Promise<boolean>} Promise resolving with true if the path exists and is a directory
 */
export async function dirExists(dirPath) {
	try {
		return (await stat(dirPath)).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Walks up from the given directory until it reaches an existing directory.
 *
 * A watched project root may not exist yet (e.g. while a checkout or install is still restoring
 * sources). Watching its nearest existing ancestor lets the watcher observe the root reappearing.
 *
 * @private
 * @param {string} dir Directory to start from
 * @returns {Promise<string>} Promise resolving with the nearest existing ancestor (or the
 * 							filesystem root if none exists)
 */
export async function findExistingDir(dir) {
	let current = path.resolve(dir);
	while (!(await dirExists(current))) {
		const parent = path.dirname(current);
		if (parent === current) {
			return current;
		}
		current = parent;
	}
	return current;
}
