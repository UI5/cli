import path from "node:path";
import os from "node:os";
import Configuration from "../config/Configuration.js";

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
 * @returns {Promise<string>} Resolved absolute path to the UI5 data directory
 */
export async function resolveUi5DataDir() {
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	if (ui5DataDir) {
		return path.resolve(process.cwd(), ui5DataDir);
	}
	return path.join(os.homedir(), ".ui5");
}
