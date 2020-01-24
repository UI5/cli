const os = require("os");
const fs = require("fs");
const log = require("@ui5/logger").getLogger("server:sslUtil");
const {promisify} = require("util");

const stat = promisify(fs.stat);
const path = require("path");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const makeDir = require("make-dir");

const sslUtil = {
	/**
	 * Creates a new SSL certificate or validates an existing one.
	 *
	 * @module @ui5/server/sslUtil
	 * @param {string} [keyPath=$HOME/.ui5/server/server.key]  Path to private key to be used for https.
	 *                                                         Defaults to <code>$HOME/.ui5/server/server.key</code>
	 * @param {string} [certPath=$HOME/.ui5/server/server.crt] Path to certificate to be used for for https.
	 *                                                         Defaults to <code>$HOME/.ui5/server/server.crt</codee>
	 * @returns {Promise<object>} Resolves with an sslObject containing <code>cert</code> and <code>key</code>
	 */
	getSslCertificate: function(
		keyPath = path.join(os.homedir(), ".ui5/server/server.key"),
		certPath = path.join(os.homedir(), ".ui5/server/server.crt")
	) {
		// checks the certificates if they are present
		return Promise.all([
			fileExists(keyPath).then((bExists) => {
				if (!bExists) {
					log.verbose(`No SSL private key found at ${keyPath}`);
					return false;
				}
				return readFile(keyPath);
			}),
			fileExists(certPath).then((bExists) => {
				if (!bExists) {
					log.verbose(`No SSL certificate found at ${certPath}`);
					return false;
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
};


async function createAndInstallCertificate(keyPath, certPath) {
	const yesno = require("yesno");

	const ok = await yesno({
		question: "No SSL certificates found. " +
			"Do you want to create new SSL certificates and install them locally? (yes)",
		defaultValue: true
	});

	if (!ok) {
		throw new Error("Certificate installation aborted! Please install the SSL certificate manually.");
	}

	// In case certificate is not found, create a self-signed one and put it into the user's trust store
	const devCert = require("devcert-sanscache");

	// Inform end user about entering his root password (needed for importing
	// the created certificate into the system)
	// TODO: Prompt and logging should happen in CLI module rather than server
	if (process.platform === "win32") {
		/* eslint-disable-next-line no-console */
		console.log("Please press allow in the opened dialog to confirm importing the newly created " +
			"SSL certificate into the operating system and browsers.");
	} else {
		/* eslint-disable-next-line no-console */
		console.log("Please enter your root password to allow importing the newly created " +
			"SSL certificate into the operating system and browsers.");
	}

	const {key, cert} = await devCert("UI5Tooling");
	await Promise.all([
		// Write certificates to the ui5 certificate folder
		// such that they are used by default upon next startup
		makeDir(path.dirname(keyPath)).then(() => writeFile(keyPath, key)),
		makeDir(path.dirname(certPath)).then(() => writeFile(certPath, cert))
	]);
	return {key, cert};
}

function fileExists(filePath) {
	return stat(filePath).then(() => true, (err) => {
		if (err.code === "ENOENT") { // "File or directory does not exist"
			return false;
		} else {
			throw err;
		}
	});
}

module.exports = sslUtil;
