import os from "node:os";
import {stat, readFile, writeFile, mkdir, chmod, constants} from "node:fs/promises";
import path from "node:path";
import {getLogger} from "@ui5/logger";

const log = getLogger("server:sslUtil");

/**
 * @private
 * @module @ui5/server/internal/sslUtil
 */

/**
 * Creates a new SSL certificate or validates an existing one.
 *
 * @private
 * @static
 * @param {string} [keyPath=$HOME/.ui5/server/server.key]  Path to private key to be used for https.
 *                                                         Defaults to <code>$HOME/.ui5/server/server.key</code>
 * @param {string} [certPath=$HOME/.ui5/server/server.crt] Path to certificate to be used for for https.
 *                                                         Defaults to <code>$HOME/.ui5/server/server.crt</codee>
 * @returns {Promise<object>} Resolves with an sslObject containing <code>cert</code> and <code>key</code>
 */
export function getSslCertificate(
	keyPath = path.join(os.homedir(), ".ui5/server/server.key"),
	certPath = path.join(os.homedir(), ".ui5/server/server.crt")
) {
	// checks the certificates if they are present
	return Promise.all([
		fileExists(keyPath).then(async (statsOrFalse) => {
			if (!statsOrFalse) {
				log.verbose(`No SSL private key found at ${keyPath}`);
				return false;
			}
			if (statsOrFalse.mode & constants.S_IWUSR || statsOrFalse.mode & constants.S_IROTH) {
				// Note: According to the Node.js docs, "On Windows, only S_IRUSR and S_IWUSR are available"
				// Therefore we first check for "writable by owner" (S_IWUSR), even though we are more interested in
				// "readable by others", which we still check on platforms where it's supported
				log.verbose(`Detected outdated file permissions for private key file at ${keyPath}. ` +
					`Fixing permissions...`);
				await chmod(keyPath, 0o400).catch((err) => {
					log.error(`Failed to update permissions of private key file at ${keyPath}: ${err}`);
				});
			}
			return readFile(keyPath);
		}),
		fileExists(certPath).then(async (statsOrFalse) => {
			if (!statsOrFalse) {
				log.verbose(`No SSL certificate found at ${certPath}`);
				return false;
			}

			if (statsOrFalse.mode & constants.S_IWUSR || statsOrFalse.mode & constants.S_IROTH) {
				log.verbose(`Detected outdated file permissions for certificate file at ${keyPath}. ` +
					`Fixing permissions...`);
				await chmod(certPath, 0o400).catch((err) => {
					log.error(`Failed to update permissions of certificate file at ${certPath}: ${err}`);
				});
			}
			return readFile(certPath);
		})
	]).then(function([key, cert]) {
		if (key && cert) {
			return {key, cert};
		}
		return createAndInstallCertificate(keyPath, certPath);
	});
}


async function createAndInstallCertificate(keyPath, certPath) {
	const {default: yesno} = await import("yesno");

	const ok = await yesno({
		question: "No SSL certificates found. " +
			"Do you want to create new SSL certificates and install them locally? (yes)",
		defaultValue: true
	});

	if (!ok) {
		throw new Error("Certificate installation aborted! Please install the SSL certificate manually.");
	}

	// In case certificate is not found, create a self-signed one and put it into the user's trust store
	const {default: devCert} = await import("devcert-sanscache");

	// Inform end user about entering his root password (needed for importing
	// the created certificate into the system)
	// TODO: Prompt and logging should happen in CLI module rather than server
	if (process.platform === "win32") {
		process.stderr.write("Please press allow in the opened dialog to confirm importing the newly created " +
			"SSL certificate into the operating system and browsers.");
		process.stderr.write("\n");
	} else {
		process.stderr.write("Please enter your root password to allow importing the newly created " +
			"SSL certificate into the operating system and browsers.");
		process.stderr.write("\n");
	}

	const {key, cert} = await devCert("UI5Tooling");

	await Promise.all([
		// Write certificates to the ui5 certificate folder
		// such that they are used by default upon next startup
		mkdir(path.dirname(keyPath), {recursive: true}).then(() => writeFile(keyPath, key, {mode: 0o400})),
		mkdir(path.dirname(certPath), {recursive: true}).then(() => writeFile(certPath, cert, {mode: 0o400}))
	]);
	return {key, cert};
}

function fileExists(filePath) {
	return stat(filePath).then((s) => s, (err) => {
		if (err.code === "ENOENT") { // "File or directory does not exist"
			return false;
		} else {
			throw err;
		}
	});
}
