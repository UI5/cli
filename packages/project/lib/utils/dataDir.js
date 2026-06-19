import path from "node:path";
import os from "node:os";
import Configuration from "../config/Configuration.js";

// Lockfile staleness threshold shared across all lock users (framework installer,
// cache cleanup, server, build). Must be consistent so that hasActiveLocks()
// and individual lock acquisitions agree on when a lock is stale.
export const LOCK_STALE_MS = 60000;

/**
 * Resolves the UI5 data directory using the standard precedence chain:
 * <ol>
 *   <li>UI5_DATA_DIR environment variable</li>
 *   <li>ui5DataDir option from the configuration file (~/.ui5rc)</li>
 *   <li>Default: ~/.ui5</li>
 * </ol>
 *
 * Relative paths are resolved against <code>cwd</code>.
 * This function always returns an absolute path — never <code>undefined</code>.
 *
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()] Base directory for resolving relative paths
 * @returns {Promise<string>} Resolved absolute path to the UI5 data directory
 */
export async function getDefaultUi5DataDir({cwd} = {}) {
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	if (ui5DataDir) {
		return path.resolve(cwd ?? process.cwd(), ui5DataDir);
	}
	return path.join(os.homedir(), ".ui5");
}

/**
 * Resolve the absolute path to the shared locks directory within a UI5 data directory.
 *
 * All process-coordination lock files (framework installer, cache cleanup, server,
 * build) live here so that <code>ui5 cache clean</code> can scan a single directory
 * regardless of which subsystem holds the lock.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {string} Absolute path to the locks directory (<code>~/.ui5/locks/</code>)
 */
export function getLockDir(ui5DataDir) {
	return path.join(ui5DataDir, "locks");
}
