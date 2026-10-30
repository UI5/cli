import {getLogger} from "@ui5/logger";
import fetch from "make-fetch-happen";
import xml2js from "xml2js";
import {promisify} from "node:util";
import {pipeline} from "node:stream/promises";
import fs from "graceful-fs";
import {getMavenLimits, assertMaxBytes, createByteCounter, createDeadline} from "./limits.js";
const rm = promisify(fs.rm);
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
		let deadline;
		let res;
		try {
			const optionalVersion = version ? version + "/" : "";
			const url = this._endpointUrl +
				`${groupId.replaceAll(".", "/")}/${artifactId}/${optionalVersion}maven-metadata.xml`;

			const limits = getMavenLimits();
			deadline = createDeadline({input: url, limit: limits.fetchTimeout,
				name: "UI5_MAVEN_FETCH_TIMEOUT", code: "ERR_MAVEN_FETCH_TIMEOUT"});
			log.verbose(`Fetching: ${url}`);
			res = await deadline.wait(fetch(url, {signal: deadline.signal}));
			if (!res.ok) {
				throw new Error(`[HTTP Error] ${res.status} ${res.statusText}`);
			}

			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: true
			});
			const readXML = promisify(parser.parseString);
			const chunks = [];
			let bytes = 0;
			for await (const chunk of res.body) {
				deadline.check();
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				bytes += buffer.length;
				assertMaxBytes(bytes, {input: url, limit: limits.metadataBytes,
					name: "UI5_MAVEN_MAX_METADATA_BYTES", code: "ERR_MAVEN_METADATA_TOO_LARGE"});
				chunks.push(buffer);
			}
			deadline.check();
			let parsedXml;
			try {
				parsedXml = await readXML(Buffer.concat(chunks, bytes));
			} catch {
				throw new Error(`Invalid Maven metadata XML at ${url}`);
			}
			deadline.check();
			if (!parsedXml?.metadata) {
				throw new Error(`Empty or unexpected Maven metadata at ${url}`);
			}
			return parsedXml.metadata;
		} catch (cause) {
			const err = deadline?.signal.reason || cause;
			deadline?.abort(err);
			if (err.code === "ENOTFOUND") {
				throw new Error(
					`Failed to connect to Maven registry at ${this._endpointUrl}. ` +
					`Please check the correct endpoint URL is maintained and can be reached. ` +
					`You can change the configured URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);

				// TODO: Allow snapshotCache to be set from outside
				// `You may be able to continue working offline. For this, set --snapshot-cache to "force"`);
				// ` or use the --offline flag`); // TODO: Implement --offline flag
			}
			const error = new Error(
				`Failed to retrieve maven-metadata.xml for ${groupId}:${artifactId}:${version}: ${err.message}`);
			error.code = err.code;
			throw error;
		} finally {
			deadline?.clear();
			res?.body?.destroy();
		}
	}

	async requestArtifact({groupId, artifactId, version, revision, classifier, extension}, targetPath) {
		let deadline;
		let res;
		let writing = false;
		try {
			// Classifier can be null, e.g. for the default "jar" artifact
			const optionalClassifier = classifier ? `-${classifier}` : "";
			const url = this._endpointUrl +
				`${groupId.replaceAll(".", "/")}/${artifactId}/${version}/` +
				`${artifactId}-${revision}${optionalClassifier}.${extension}`;

			const limits = getMavenLimits();
			deadline = createDeadline({input: url, limit: limits.fetchTimeout,
				name: "UI5_MAVEN_FETCH_TIMEOUT", code: "ERR_MAVEN_FETCH_TIMEOUT"});
			log.verbose(`Fetching: ${url}`);
			res = await deadline.wait(fetch(url, {
				signal: deadline.signal,
				cache: "no-store", // Do not cache these large artifacts. We store them right away anyways

				// Disable usage of shared keep-alive agents.
				// make-fetch-happen uses a hard-coded 15 seconds freeSocketTimeout
				// that can be easily reached (Error: Socket timeout) and there doesn't
				// seem to be another way to disable or increase it.
				// Also see: https://github.com/node-modules/agentkeepalive/issues/106
				// The same applies in npm/Registry.js
				agent: false,
			}));
			if (!res.ok) {
				throw new Error(`[HTTP Error] ${res.status} ${res.statusText}`);
			}

			// Write to target
			deadline.check();
			const counter = createByteCounter((bytes) => {
				deadline.check();
				assertMaxBytes(bytes, {input: url, limit: limits.artifactBytes,
					name: "UI5_MAVEN_MAX_ARTIFACT_BYTES", code: "ERR_MAVEN_ARTIFACT_TOO_LARGE"});
			});
			writing = true;
			await pipeline(res.body, counter, fs.createWriteStream(targetPath), {signal: deadline.signal});
			deadline.check();
		} catch (cause) {
			const err = deadline?.signal.reason || cause;
			deadline?.abort(err);
			if (writing) {
				await rm(targetPath, {force: true});
			}
			if (err.code === "ENOTFOUND") {
				throw new Error(
					`Failed to connect to Maven registry at ${this._endpointUrl}. ` +
					`Please check the correct endpoint URL is maintained and can be reached. ` +
					`You can change the configured URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);

				// TODO: Allow snapshotCache to be set from outside
				// `You may be able to continue working offline. For this, set --snapshot-cache to "force"`);
				// ` or use the --offline flag`); // TODO: Implement --offline flag
			}
			const error = new Error(`Failed to retrieve artifact ` +
				`${groupId}:${artifactId}:${version}:${classifier}:${extension} ${err.message}`);
			error.code = err.code;
			throw error;
		} finally {
			deadline?.clear();
			res?.body?.destroy();
		}
	}
}

export default Registry;
