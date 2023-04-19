import {getLogger} from "@ui5/logger";
import fetch from "make-fetch-happen";
import xml2js from "xml2js";
import {promisify} from "node:util";
import {pipeline} from "node:stream/promises";
import fs from "graceful-fs";
const log = getLogger("ui5Framework:maven:Registry");

class Registry {
	/**
	 * @param {object} parameters Parameters
	 * @param {string} parameters.endpointUrl Maven's endpoint URL
	 */
	constructor({endpointUrl}) {
		if (!endpointUrl) {
			throw new Error(`Registry: Missing parameter "endpointUrl"`);
		}
		this._endpointUrl = endpointUrl;
		if (!this._endpointUrl.endsWith("/")) {
			this._endpointUrl += "/";
			log.verbose(`Registry: Effective "endpointUrl" resolved to "${this._endpointUrl}"`);
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

			log.verbose(`Fetching: ${url}`);
			const res = await fetch(url);
			if (!res.ok) {
				throw new Error(`[HTTP Error] ${res.status} ${res.statusText}`);
			}

			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: true
			});
			const readXML = promisify(parser.parseString);
			const content = await res.buffer();
			const parsedXml = await readXML(content);
			if (!parsedXml?.metadata) {
				throw new Error(
					`Empty or unexpected response body:\n${content}\nParsed as:\n${JSON.stringify(parsedXml)}`);
			}
			return parsedXml.metadata;
		} catch (err) {
			if (err.code === "ENOTFOUND") {
				throw new Error(
					`Failed to connect to Maven registry at ${this._endpointUrl}. ` +
					`Please check the correct endpoint URL is maintained and can be reached. ` +
					`You can change the configured URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);

				// TODO: Allow cacheMode to be set from outside
				// `You may be able to continue working offline. For this, set --cache-mode to "force"`);
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

			log.verbose(`Fetching: ${url}`);
			const res = await fetch(url, {
				cache: "no-store" // Do not cache these large artifacts. We store them right away anyways
			});
			if (!res.ok) {
				throw new Error(`[HTTP Error] ${res.status} ${res.statusText}`);
			}

			// Write to target
			await pipeline(res.body, fs.createWriteStream(targetPath));
		} catch (err) {
			if (err.code === "ENOTFOUND") {
				throw new Error(
					`Failed to connect to Maven registry at ${this._endpointUrl}. ` +
					`Please check the correct endpoint URL is maintained and can be reached. ` +
					`You can change the configured URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);

				// TODO: Allow cacheMode to be set from outside
				// `You may be able to continue working offline. For this, set --cache-mode to "force"`);
				// ` or use the --offline flag`); // TODO: Implement --offline flag
			}
			throw new Error(`Failed to retrieve artifact ` +
				`${groupId}:${artifactId}:${version}:${classifier}:${extension} ${err.message}`);
		}
	}
}

export default Registry;
