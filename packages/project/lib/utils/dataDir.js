import path from "node:path";
import os from "node:os";
import Configuration from "../config/Configuration.js";

/**
 * Utilities for resolving the UI5 data directory.
 *
 * @public
 * @module @ui5/project/utils/dataDir
 */

/**
 * Resolves the UI5 data directory using the standard precedence chain:
 * <ol>
 *   <li>UI5_DATA_DIR environment variable</li>
 *   <li>ui5DataDir option from the configuration file (~/.ui5rc)</li>
 *   <li>Default: ~/.ui5</li>
 * </ol>
 *
 * This function always returns an absolute path — never <code>undefined</code>.
 *
 * @public
 * @param {object} [options]
 * @param {string} [options.projectRootPath] The root directory of the project being processed.
 *   Used to resolve a relative <code>ui5DataDir</code> value from the environment variable or
 *   configuration file against the correct base. This is NOT necessarily the shell's current
 *   working directory — when processing a project in a sub-directory or a workspace member,
 *   this should be the root of that specific project (where its <code>package.json</code> lives).
 *   Defaults to <code>process.cwd()</code> when not provided.
 * @returns {Promise<string>} Resolved absolute path to the UI5 data directory
 */
export async function resolveUi5DataDir({projectRootPath} = {}) {
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	if (ui5DataDir) {
		return path.resolve(projectRootPath ?? process.cwd(), ui5DataDir);
	}
	return path.resolve(os.homedir(), ".ui5");
}

/**
 * Validates the <code>ui5DataDir</code> parameter for public API boundaries.
 *
 * We enforce this centrally so every boundary reports the same contract:
 * callers must pass an explicit absolute path. Accepting relative values would
 * make behavior depend on the current working directory of the process entry
 * point and can therefore differ across platforms and invocation contexts.
 *
 * @public
 * @param {string} ui5DataDir Absolute path to validate
 * @param {string} parameterOwner Name of the API validating the path
 */
export function validateUi5DataDir(ui5DataDir, parameterOwner) {
	if (!ui5DataDir) {
		throw new Error(`${parameterOwner}: Missing parameter "ui5DataDir"`);
	}
	if (!path.isAbsolute(ui5DataDir)) {
		throw new Error(`${parameterOwner}: Parameter "ui5DataDir" must be an absolute path`);
	}
}
