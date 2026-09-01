import path from "node:path";
import os from "node:os";
import process from "node:process";
import Configuration from "@ui5/project/config/Configuration";

// TODO: This module only consolidates ui5DataDir resolution within the cli package.
// A general, cross-package cleanup of ui5DataDir resolution is tracked in PR #1456.

/**
 * Resolves the UI5 data directory from the <code>UI5_DATA_DIR</code> environment variable or the
 * UI5 configuration. The environment variable takes precedence over the configured value.
 *
 * @param {object} options
 * @param {string} options.cwd Directory a relative data-dir value is resolved against
 * @returns {Promise<string|undefined>} Absolute path to the UI5 data directory,
 *   or <code>undefined</code> when neither source provides a value
 */
export async function getUi5DataDir({cwd}) {
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	return ui5DataDir ? path.resolve(cwd, ui5DataDir) : undefined;
}

/**
 * Like {@link getUi5DataDir}, but falls back to <code>&lt;home&gt;/.ui5</code> when neither the
 * environment variable nor the configuration provides a value.
 *
 * @param {object} options
 * @param {string} options.cwd Directory a relative data-dir value is resolved against
 * @returns {Promise<string>} Absolute path to the UI5 data directory
 */
export async function getUi5DataDirOrDefault({cwd}) {
	return (await getUi5DataDir({cwd})) ?? path.join(os.homedir(), ".ui5");
}

/**
 * Resolves the paths of the server's private key and certificate. Explicit paths take precedence
 * over the default paths within the given UI5 data directory.
 *
 * @param {string} ui5DataDir Absolute path to the UI5 data directory
 * @param {object} [options]
 * @param {string} [options.keyPath] Explicit private-key path
 * @param {string} [options.certPath] Explicit certificate path
 * @returns {{keyPath: string, certPath: string}} Private-key and certificate paths
 */
export function resolveServerCertificatePaths(ui5DataDir, {keyPath, certPath} = {}) {
	return {
		keyPath: keyPath ?? path.join(ui5DataDir, "server", "server.key"),
		certPath: certPath ?? path.join(ui5DataDir, "server", "server.crt"),
	};
}

/**
 * Shortens an absolute path for display by replacing the user's home directory with
 * <code>~</code> (e.g. <code>~/.ui5</code>). Intended for console and
 * error output only — never for values used in actual filesystem operations.
 *
 * @param {string} filePath Path to format for display
 * @returns {string} The path with the home directory replaced by <code>~</code>, or the
 *   original path when it does not reside within the home directory
 */
export function formatPath(filePath) {
	const home = os.homedir();
	if (filePath === home) {
		return "~";
	}
	if (filePath.startsWith(home + path.sep)) {
		return "~" + filePath.slice(home.length);
	}
	return filePath;
}
