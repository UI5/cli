import {getLogger} from "@ui5/logger";
import fetch from "make-fetch-happen";
import xml2js from "xml2js";
import {promisify} from "node:util";
import {pipeline} from "node:stream/promises";
import fs from "graceful-fs";
import validateUrl, {redactUrl} from "./validateUrl.js";
const log = getLogger("ui5Framework:maven:Registry");

// Status codes that make-fetch-happen returns unfollowed in manual redirect mode
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

// A Maven metadata or artifact request realistically takes at most one or two redirects
// (repository to artifact storage or a CDN). This bound stays generous for that while
// limiting redirect loops.
const MAX_REDIRECTS = 5;

class Registry {
	/**
	 * @param {object} parameters Parameters
	 * @param {string} parameters.endpointUrl Maven repository endpoint URL. Must use HTTPS.
	 */
	constructor({endpointUrl}) {
		if (!endpointUrl) {
			throw new Error(`Registry: Missing parameter "endpointUrl"`);
		}
		this._endpointUrl = validateUrl(endpointUrl);
		if (!this._endpointUrl.endsWith("/")) {
			this._endpointUrl += "/";
			log.verbose(`Registry: Effective "endpointUrl" resolved to "${redactUrl(this._endpointUrl)}"`);
		}
	}

	/**
	 * Requests a <code>maven-metadata.xml</code> file from the repository
	 *
	 * @param {object} options options
	 * @param {string} options.groupId
	 * @param {string} options.artifactId
	 * @param {string} [options.version] If given, the version must be a SNAPSHOT version.
	 * 	In this case, the resulting metadata will list all artifact versions
	 * 	(and timestamps) deployed for that SNAPSHOT.
	 * 	If not provided, the resulting metadata will list all versions available for the artifact.
	 */
	async requestMavenMetadata({groupId, artifactId, version}) {
		try {
			const optionalVersion = version ? version + "/" : "";
			const url = this._endpointUrl +
				`${groupId.replaceAll(".", "/")}/${artifactId}/${optionalVersion}maven-metadata.xml`;

			const res = await this._fetch(url);

			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: true
			});
			const readXML = promisify(parser.parseString);
			const content = await res.buffer();
			const parsedXml = await readXML(content);
			if (!parsedXml?.metadata) {
				throw new Error("Empty or unexpected Maven metadata response");
			}
			return parsedXml.metadata;
		} catch (err) {
			if (err.code === "ENOTFOUND") {
				throw new Error(
					`Failed to connect to Maven registry at ${redactUrl(this._endpointUrl)}. ` +
					`Please check the correct endpoint URL is maintained and can be reached. ` +
					`You can change the configured URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);

				// TODO: Allow snapshotCache to be set from outside
				// `You may be able to continue working offline. For this, set --snapshot-cache to "force"`);
				// ` or use the --offline flag`); // TODO: Implement --offline flag
			}
			throw new Error(
				`Failed to retrieve maven-metadata.xml for ${groupId}:${artifactId}:${version}: ${err.message}`);
		}
	}

	async requestArtifact({groupId, artifactId, version, revision, classifier, extension}, targetPath) {
		try {
			// Classifier can be null, e.g. for the default "jar" artifact
			const optionalClassifier = classifier ? `-${classifier}` : "";
			const url = this._endpointUrl +
				`${groupId.replaceAll(".", "/")}/${artifactId}/${version}/` +
				`${artifactId}-${revision}${optionalClassifier}.${extension}`;

			const res = await this._fetch(url, {
				cache: "no-store", // Do not cache these large artifacts. We store them right away anyways

				// Disable usage of shared keep-alive agents.
				// make-fetch-happen uses a hard-coded 15 seconds freeSocketTimeout
				// that can be easily reached (Error: Socket timeout) and there doesn't
				// seem to be another way to disable or increase it.
				// Also see: https://github.com/node-modules/agentkeepalive/issues/106
				// The same applies in npm/Registry.js
				agent: false,
			});
			// Write to target
			await pipeline(res.body, fs.createWriteStream(targetPath));
		} catch (err) {
			if (err.code === "ENOTFOUND") {
				throw new Error(
					`Failed to connect to Maven registry at ${redactUrl(this._endpointUrl)}. ` +
					`Please check the correct endpoint URL is maintained and can be reached. ` +
					`You can change the configured URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);

				// TODO: Allow snapshotCache to be set from outside
				// `You may be able to continue working offline. For this, set --snapshot-cache to "force"`);
				// ` or use the --offline flag`); // TODO: Implement --offline flag
			}
			throw new Error(`Failed to retrieve artifact ` +
				`${groupId}:${artifactId}:${version}:${classifier}:${extension} ${err.message}`);
		}
	}

	/**
	 * Fetches a URL over HTTPS, following redirects manually so every hop is checked.
	 *
	 * Each redirect target must use HTTPS. make-fetch-happen embeds the request URL in its
	 * network errors, which can carry credentials, so the thrown error reports the redacted
	 * URL and the error code instead of the original message.
	 *
	 * @param {string} url Absolute HTTPS URL to request
	 * @param {object} [options] Additional make-fetch-happen options
	 * @returns {Promise<object>} The final, non-redirect response
	 */
	async _fetch(url, options = {}) {
		url = validateUrl(url);
		for (let redirects = 0; ; redirects++) {
			let res;
			log.verbose(`Fetching: ${redactUrl(url)}`);
			try {
				res = await fetch(url, {
					...options,
					redirect: "manual",
				});
			} catch (err) {
				// Build the message from the redacted URL and the error code. The original
				// err.message can include the request URL with any embedded credentials.
				throw Object.assign(
					new Error(`Maven registry HTTPS request to ${redactUrl(url)} failed ` +
						`(${err.code || "network error"})`),
					{code: err.code});
			}
			if (REDIRECT_STATUS_CODES.has(res.status)) {
				res.body?.destroy();
				if (redirects >= MAX_REDIRECTS) {
					throw new Error("Too many Maven registry redirects");
				}
				const location = res.headers.get("location");
				if (!location) {
					throw new Error("Maven registry redirect is missing a location");
				}
				url = validateUrl(location, url);
			} else {
				if (!res.ok) {
					res.body?.destroy();
					throw new Error(`[HTTP Error] ${res.status} ${res.statusText}`);
				}
				return res;
			}
		}
	}
}

export default Registry;
