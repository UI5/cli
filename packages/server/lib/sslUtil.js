const os = require("os");
const fs = require("fs");
const log = require("@ui5/logger").getLogger("server:sslUtil");
const {promisify} = require("util");

const stat = promisify(fs.stat);
const path = require("path");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const makeDir = require("make-dir");

var prompt = require("prompt");

const sslUtil = {
	/**
	 * @param      {string}   [keyPath=$HOME/.ui5/server/server.key]  Path to private key to be used for https.
	 *                          Defaults to <pre>$HOME/.ui5/server/server.key</pre>
	 * @param      {string}   [certPath=$HOME/.ui5/server/server.crt]  Path to certificate to be used for for https.
	 *                          Defaults to <pre>$HOME/.ui5/server/server.crt</pre>
	 * @returns {Promise.<object>} Resolves with an sslObject containing <pre>cert</pre> and <pre>key</pre>
	 */
	getSslCertificate: function(
		keyPath = path.join(os.homedir(), ".ui5/server/server.key"),
		certPath = path.join(os.homedir(), ".ui5/server/server.crt")) {
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


function createAndInstallCertificate(keyPath, certPath) {
	return new Promise(function(resolve, reject) {
		prompt.start();

		var property = {
			name: "yesno",
			message: "No SSL certificates found. Do you want to create new SSL certificates and install them locally?",
			validator: /y[es]*|n[o]?/,
			warning: "Please respond yes or no",
			default: "yes"
		};

		prompt.get(property, function(err, result) {
			if (result.yesno !== "" && result.yesno !== "yes") {
				reject("Certificate installation aborted! Please install the SSL certificate manually.");
				return;
			}
			resolve();
		});
	}).then(function() {
		// In case certificate is not found, create a self-signed one and put it into the user's trust store
		const devCert = require("devcert-sanscache");

		// Inform end user about entering his root password (needed for importing
		// the created certificate into the system)
		if (process.platform === "win32") {
			console.log("Please press allow in the opened dialog to confirm importing the newly created " +
				"SSL certificate into the operating system and browsers.");
		} else {
			console.log("Please enter your root password to allow importing the newly created " +
				"SSL certificate into the operating system and browsers.");
		}

		return devCert("ui5-tooling").then(({key, cert}) => {
			return Promise.all([
				// Write certificates to the ui5 certificate folder
				// such that they are used by default upon next startup
				makeDir(path.dirname(keyPath)).then(() => writeFile(keyPath, key)),
				makeDir(path.dirname(certPath)).then(() => writeFile(certPath, cert))
			]).then(function() {
				return {key, cert};
			}).catch((err) => {
				console.log("Could not create certificate");
				console.error(err);
			});
		});
	});
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
