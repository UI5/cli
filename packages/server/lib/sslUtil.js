import {stat, readFile, writeFile, mkdir, chmod, rm, constants} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {getLogger} from "@ui5/logger";

const log = getLogger("server:sslUtil");

/**
 * @private
 * @module @ui5/server/internal/sslUtil
 */

/**
 * Error thrown by {@link getSslCertificate} when no SSL certificate could be found.
 * The offending paths are exposed via <code>keyPath</code> and <code>certPath</code> so that
 * callers can render actionable guidance.
 *
 * @private
 */
export class SslCertificateNotFoundError extends Error {
	constructor(keyPath, certPath) {
		super(`No SSL certificate found at ${keyPath} and ${certPath}`);
		this.name = "SslCertificateNotFoundError";
		this.code = "SSL_CERTIFICATE_NOT_FOUND";
		this.keyPath = keyPath;
		this.certPath = certPath;
	}
}

/**
 * Reads and validates an existing SSL certificate.
 *
 * Does <b>not</b> create a certificate if none is found. Use
 * {@link generateSslCertificate} to create one.
 *
 * @private
 * @static
 * @param {string} keyPath  Path to the private key to be used for https
 * @param {string} certPath Path to the certificate to be used for https
 * @returns {Promise<object>} Resolves with an sslObject containing <code>cert</code> and <code>key</code>
 * @throws {SslCertificateNotFoundError} If the private key or certificate is missing
 */
export function getSslCertificate(keyPath, certPath) {
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
				log.verbose(`Detected outdated file permissions for certificate file at ${certPath}. ` +
					`Fixing permissions...`);
				await chmod(certPath, 0o400).catch((err) => {
					log.error(`Failed to update permissions of certificate file at ${certPath}: ${err}`);
				});
			}
			return readFile(certPath);
		})
	]).then(function([key, cert]) {
		// A leftover empty file (e.g. from an interrupted previous write) reads as a truthy but
		// zero-length Buffer. Treat it as missing so callers get actionable guidance instead of
		// starting HTTPS with empty TLS material.
		if (key?.length && cert?.length) {
			return {key, cert};
		}
		throw new SslCertificateNotFoundError(keyPath, certPath);
	});
}

/**
 * Creates a new self-signed SSL certificate, installs it into the operating system's
 * trust store and writes the key and certificate to the given paths.
 *
 * Installing the certificate into the trust store requires elevated privileges. On most
 * platforms this triggers a system password prompt; on Windows a confirmation dialog is
 * shown. Callers are responsible for informing the user about this beforehand.
 *
 * @private
 * @static
 * @param {string} keyPath  Path the private key is written to
 * @param {string} certPath Path the certificate is written to
 * @returns {Promise<object>} Resolves with an object containing the created <code>key</code> and
 *                            <code>cert</code> as well as the <code>keyPath</code> and <code>certPath</code>
 *                            they were written to
 */
export async function generateSslCertificate(keyPath, certPath) {
	// Create a self-signed certificate and put it into the user's trust store
	const {default: devCert} = await import("devcert-sanscache");

	const {key, cert} = await devCert("UI5Tooling");

	// When a browser (e.g. Firefox) requires manual confirmation, devcert-sanscache resumes stdin to
	// wait for the user to press <Enter>, but never pauses it again. The resumed stdin keeps a
	// reference on the event loop that would prevent the calling process from exiting. Pause it to
	// release that reference.
	process.stdin.pause();

	await Promise.all([
		// Write certificates to the ui5 certificate folder
		// such that they are used by default upon next startup
		writeCertificateFile(keyPath, key),
		writeCertificateFile(certPath, cert)
	]);
	return {key, cert, keyPath, certPath};
}

// Files are written with read-only permissions (0o400), so an existing file from a previous run
// cannot be opened for writing. Remove it first to allow regeneration (e.g. via --force).
async function writeCertificateFile(filePath, content) {
	await mkdir(path.dirname(filePath), {recursive: true});
	await rm(filePath, {force: true});
	await writeFile(filePath, content, {mode: 0o400});
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
