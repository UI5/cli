import path from "node:path";
import {mkdirp} from "../../utils/fs.js";
import fs from "graceful-fs";
import _StreamZip from "node-stream-zip";
const StreamZip = _StreamZip.async;
import {promisify} from "node:util";
import Registry from "./Registry.js";
import AbstractInstaller from "../AbstractInstaller.js";
import CacheMode from "./CacheMode.js";
import {rmrf} from "../../utils/fs.js";
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const rename = promisify(fs.rename);
const rm = promisify(fs.rm);
import {getLogger} from "@ui5/logger";
const log = getLogger("ui5Framework:maven:Installer");
const mvnTimestampRegex = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/;

const CACHE_TIME = 32400000; // 9 hours

class Installer extends AbstractInstaller {
	/**
	 * @param {object} parameters Parameters
	 * @param {string} parameters.ui5DataDir UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers.
	 * @param {Function} parameters.snapshotEndpointUrlCb Callback that returns a Promise <string>,
	 * 	resolving to the Maven repository URL.
	 * 	Example: <code>https://registry.corp/vendor/build-snapshots/</code>
	 * @param {module:@ui5/project/ui5Framework/maven/CacheMode} [parameters.cacheMode=Default] Cache mode to use
	 */
	constructor({ui5DataDir, snapshotEndpointUrlCb, cacheMode = CacheMode.Default}) {
		super(ui5DataDir);

		this._artifactsDir = path.join(ui5DataDir, "framework", "artifacts");
		this._packagesDir = path.join(ui5DataDir, "framework", "packages");
		this._metadataDir = path.join(ui5DataDir, "framework", "metadata");
		this._stagingDir = path.join(ui5DataDir, "framework", "staging");

		this._cacheMode = cacheMode;
		this._snapshotEndpointUrlCb = snapshotEndpointUrlCb;

		if (!this._snapshotEndpointUrlCb) {
			throw new Error(`Installer: Missing Snapshot-Endpoint URL callback parameter`);
		}
		if (!Object.values(CacheMode).includes(cacheMode)) {
			throw new Error(`Installer: Invalid value '${cacheMode}' for cacheMode parameter. ` +
				`Must be one of ${Object.values(CacheMode).join(", ")}`);
		}

		log.verbose(`Installing Maven artifacts to: ${this._artifactsDir}`);
		log.verbose(`Installing Packages to: ${this._packagesDir}`);
		log.verbose(`Caching mode: ${this._cacheMode}`);
	}

	async getRegistry() {
		if (this._cachedRegistry) {
			return this._cachedRegistry;
		}
		return (this._cachedRegistry = Promise.resolve().then(async () => {
			const snapshotEndpointUrl = await this._snapshotEndpointUrlCb();
			if (!snapshotEndpointUrl) {
				throw new Error(
					`Installer: Missing or empty Maven repository URL for snapshot consumption. ` +
					`This URL is required for consuming snapshot versions of UI5 libraries. ` +
					`Please configure the correct URL using the following command: ` +
					`'ui5 config set mavenSnapshotEndpointUrl <url>'`);
			} else {
				return new Registry({endpointUrl: snapshotEndpointUrl});
			}
		}));
	}

	async readJson(jsonPath) {
		return JSON.parse(await readFile(jsonPath, {encoding: "utf8"}));
	}

	async _writeJson(jsonPath, jsonObject) {
		return writeFile(jsonPath, JSON.stringify(jsonObject));
	}

	async fetchPackageVersions({groupId, artifactId}) {
		const reg = await this.getRegistry();
		const metadata = await reg.requestMavenMetadata({groupId, artifactId});

		if (!metadata?.versioning?.versions?.version) {
			throw new Error(`Missing Maven metadata for artifact ${groupId}:${artifactId}`);
		}
		return metadata.versioning.versions.version.filter((version) => {
			// This resolver can only handle SNAPSHOT versions
			return version.endsWith("-SNAPSHOT");
		});
	}


	/**
	 * Metadata for an artifact as identified by it's Maven coordinates
	 *
	 * @typedef {object} @ui5/project/ui5Framework/maven/Installer~LocalMetadata
	 * @property {integer} lastCheck Timestamp of the last time these metadata have been compared with the repository
	 * @property {integer} lastUpdate Timestamp of the last time the artifact has been updated in the repository
	 *   (typically older than last check)
	 * @property {string} revision Current revision of the artifact
	 * @property {string[]} staleRevisions Previously installed revisions of the artifact
	 */

	/**
	 * Fills and maintains locally cached metadata for the given artifact coordinates
	 *
	 * @param {object} coordinates
	 * @param {string} coordinates.groupId GroupId of the requested artifact
	 * @param {string} coordinates.artifactId ArtifactId of the requested artifact
	 * @param {string} coordinates.version Version of the requested artifact
	 * @param {string|null} coordinates.classifier Classifier of the requested artifact
	 * @param {string} coordinates.extension Extension of the requested artifact
	 * @param {string} [coordinates.pkgName] npm package name the artifact corresponds to (if any)
	 * @returns {@ui5/project/ui5Framework/maven/Installer~LocalMetadata}
	 */
	async _fetchArtifactMetadata(coordinates) {
		const fsId = this._generateFsIdFromCoordinates(coordinates);
		const logId = this._generateLogIdFromCoordinates(coordinates);
		return this._synchronize("metadata-" + fsId, async () => {
			const localMetadata = await this._getLocalArtifactMetadata(fsId);

			if (this._cacheMode === CacheMode.Force && !localMetadata.revision) {
				throw new Error(`Could not find artifact ` +
					`${logId} in local cache`);
			}

			const now = new Date().getTime();
			const timeSinceLastCheck = now - localMetadata.lastCheck;

			if (this._cacheMode !== CacheMode.Force &&
				(timeSinceLastCheck > CACHE_TIME || this._cacheMode === CacheMode.Off)) {
				// No cached metadata (-> timeSinceLastCheck equals time since 1970) or
				// too old metadata or disabled cache
				// => Retrieve metadata from repository
				if (localMetadata.lastCheck === 0) {
					log.verbose(
						`Could not find metadata for artifact ${logId} in local cache. Fetching from repository...`);
				} else {
					log.verbose(
						`Refreshing metadata cache for artifact ${logId} ` +
						// TODO better formatting of elapsed time
						`(last checked ${timeSinceLastCheck/1000} seconds ago)`);
				}

				log.info(
					`Fetching latest metadata for artifact ${coordinates.artifactId} version ${coordinates.version} ` +
					`from Maven registry...`);
				const {lastUpdate, revision} = await this._getRemoteArtifactMetadata(coordinates);

				// TODO better formatting of elapsed time
				log.verbose(`Retrieved metadata for artifact ${logId} is ` +
					`${(lastUpdate - localMetadata.lastUpdate) / 1000} seconds younger than local metadata`);
				log.verbose(`Retrieved deployment version is ${revision}`);

				this._rotateRevision(localMetadata, revision);

				await this._removeStaleRevisions(logId, localMetadata, coordinates);

				localMetadata.lastCheck = now;
				localMetadata.lastUpdate = lastUpdate;
				await this._writeLocalArtifactMetadata(fsId, localMetadata);
			} else {
				log.verbose(`Using metadata for artifact ${logId} from local cache`);
			}
			return localMetadata;
		});
	}

	/**
	 * Fills and maintains locally cached metadata for the given artifact coordinates
	 *
	 * @param {object} coordinates
	 * @param {string} coordinates.groupId GroupId of the requested artifact
	 * @param {string} coordinates.artifactId ArtifactId of the requested artifact
	 * @param {string} coordinates.version Version of the requested artifact
	 * @param {string|null} coordinates.classifier Classifier of the requested artifact
	 * @param {string} coordinates.extension Extension of the requested artifact
	 * @returns {@ui5/project/ui5Framework/maven/Installer~LocalMetadata}
	 */
	async _getRemoteArtifactMetadata({groupId, artifactId, version, classifier, extension}) {
		const reg = await this.getRegistry();
		const metadata = await reg.requestMavenMetadata({groupId, artifactId, version});

		if (!metadata?.versioning?.snapshotVersions?.snapshotVersion) {
			throw new Error(`Missing Maven snapshot metadata for artifact ${groupId}:${artifactId}:${version}`);
		}

		const snapshotVersion = metadata.versioning.snapshotVersions.snapshotVersion;
		const deploymentMetadata = snapshotVersion.find(({
			classifier: candidateClassifier, // Classifier can be null, e.g. for the default "jar" artifact
			extension: candidateExtension
		}) => (!classifier || candidateClassifier === classifier) && candidateExtension === extension);

		if (!deploymentMetadata) {
			const optionalClassifier = classifier ? `${classifier}.` : "";
			throw new Error(
				`Could not find ${optionalClassifier}${extension} deployment for artifact ` +
				`${groupId}:${artifactId}:${version} in snapshot metadata:\n` +
				`${JSON.stringify(snapshotVersion)}`);
		}
		// Convert Maven timestamp (yyyyMMddHHmmss UTC) to ISO string (YYYY-MM-DDTHH:mm:ss.sssZ)
		// E.g. 20220828080910 becomes 2022-08-28T08:09:10.000Z
		const isoTimestamp = deploymentMetadata.updated.replace(mvnTimestampRegex, "$1-$2-$3T$4:$5:$6.000Z");
		const ts = new Date(isoTimestamp);

		const logId = this._generateLogIdFromCoordinates({groupId, artifactId, version, classifier, extension});
		log.verbose(`Retrieved metadata for ${logId}:` +
			`\n  Last update was at: ${ts.toISOString()}` +
			`\n  Current deployment version is: ${deploymentMetadata.value}`);
		return {
			lastUpdate: ts.getTime(),
			revision: deploymentMetadata.value
		};
	}

	/**
	 * Reads locally cached metadata for the given artifact coordinates
	 *
	 * @param {string} id File System identifier for the artifact. Typically derived from the coordinates
	 * @returns {@ui5/project/ui5Framework/maven/Installer~LocalMetadata}
	 */
	async _getLocalArtifactMetadata(id) {
		try {
			return await this.readJson(path.join(this._metadataDir, `${id}.json`));
		} catch (err) {
			if (err.code === "ENOENT") { // "File or directory does not exist"
				// If not found, initialize metadata
				return {
					lastCheck: 0,
					lastUpdate: 0,
					revision: null,
					staleRevisions: []
				};
			} else {
				throw err;
			}
		}
	}

	async _writeLocalArtifactMetadata(id, content) {
		await mkdirp(this._metadataDir);
		return await this._writeJson(path.join(this._metadataDir, `${id}.json`), content);
	}

	_rotateRevision(metadata, newRevision) {
		if (metadata.revision) {
			metadata.staleRevisions.push(metadata.revision);
		}
		metadata.revision = newRevision;
	}

	async _removeStaleRevisions(logId, metadata, {pkgName, groupId, artifactId, classifier, extension}) {
		if (metadata.staleRevisions.length <= 1) {
			// Keep at least one revision. Nothing to do
			return;
		}
		log.verbose(`Removing ${metadata.staleRevisions.length - 1} stale revision for ${logId}`);
		while (metadata.staleRevisions.length > 3) {
			const revision = metadata.staleRevisions.shift();
			const artifactPath = this._getTargetPathForArtifact({
				groupId,
				artifactId,
				revision,
				classifier,
				extension
			});
			log.verbose(`Removing ${artifactPath}...`);
			await rm(artifactPath, {
				force: true
			});

			if (pkgName) {
				const packageDir = this._getTargetDirForPackage(pkgName, revision);
				log.verbose(`Removing directory ${packageDir}...`);
				await rmrf(packageDir);
			}
		}
	}

	/**
	 * @typedef {object} @ui5/project/ui5Framework/maven/Installer~InstalledPackage
	 * @property {string} pkgPath
	 */

	/**
	 * Downloads the respective artifact and extracts the zip archive into a structure similar to
	 * the npm installer
	 *
	 * @param {object} parameters
	 * @param {string} parameters.pkgName Name of the npm package
	 * @param {string} parameters.groupId GroupId of the requested artifact
	 * @param {string} parameters.artifactId ArtifactId of the requested artifact
	 * @param {string} parameters.version Version of the requested artifact
	 * @param {string|null} parameters.classifier Classifier of the requested artifact
	 * @param {string} parameters.extension Extension of the requested artifact
	 * @returns {@ui5/project/ui5Framework/maven/Installer~InstalledPackage}
	 */
	async installPackage({pkgName, groupId, artifactId, version, classifier, extension}) {
		const {revision} = await this._fetchArtifactMetadata({
			pkgName, groupId, artifactId, version, classifier, extension
		});

		const coordinates = {
			groupId, artifactId,
			version, revision,
			classifier, extension
		};

		const targetDir = this._getTargetDirForPackage(pkgName, revision);
		const installed = await this._projectExists(targetDir);

		if (!installed) {
			await this._synchronize(`package-${pkgName}@${revision}`, async () => {
				const installed = await this._projectExists(targetDir);

				if (installed) {
					log.verbose(`Already installed: ${pkgName} in SNAPSHOT version ${revision}`);
					return;
				}

				const stagingDir = this._getStagingDirForPackage(pkgName, revision);

				// Check whether staging dir already exists and remove it
				if (await this._pathExists(stagingDir)) {
					log.verbose(`Removing stale staging directory at ${stagingDir}...`);
					await rmrf(stagingDir);
				}

				await mkdirp(stagingDir);

				const {artifactPath, removeArtifact} = await this.installArtifact(coordinates);

				log.verbose(`Extracting archive at ${artifactPath} to ${stagingDir}...`);
				const zip = new StreamZip({file: artifactPath});
				let rootDir = null;
				if (extension === "jar") {
					rootDir = "META-INF";
				}
				await zip.extract(rootDir, stagingDir);
				await zip.close();

				// Check whether target dir already exists and remove it
				if (await this._pathExists(targetDir)) {
					log.verbose(`Removing existing target directory at ${targetDir}...`);
					await rmrf(targetDir);
				}

				// Do not create target dir itself to prevent EPERM error in following rename operation
				// (https://github.com/SAP/ui5-tooling/issues/487)
				await mkdirp(path.dirname(targetDir));
				log.verbose(`Promoting staging directory from ${stagingDir} to ${targetDir}...`);
				await rename(stagingDir, targetDir);

				await removeArtifact();
			});
		} else {
			log.verbose(`Already installed: ${pkgName} in SNAPSHOT version ${revision}`);
		}
		return {
			pkgPath: targetDir
		};
	}

	/**
	 * @typedef {object} @ui5/project/ui5Framework/maven/Installer~InstalledArtifact
	 * @property {string} artifactPath
	 * @property {Function} removeArtifact Callback to trigger removal of the artifact file in case it
	 * is no longer required.
	 */

	/**
	 * @param {object} parameters
	 * @param {string} parameters.groupId GroupId of the requested artifact
	 * @param {string} parameters.artifactId ArtifactId of the requested artifact
	 * @param {string} parameters.version Version of the requested artifact
	 * @param {string|null} parameters.classifier Classifier of the requested artifact
	 * @param {string} parameters.extension Extension of the requested artifact
	 * @param {string} [parameters.revision] Optional revision of the artifact to request.
	 * 	If not provided, the latest revision will be determined from the registry metadata.
	 * @returns {@ui5/project/ui5Framework/maven/Installer~InstalledArtifact}
	 */
	async installArtifact({groupId, artifactId, version, classifier, extension, revision}) {
		if (!revision) {
			const metadata = await this._fetchArtifactMetadata({
				groupId, artifactId, version, classifier, extension
			});
			revision = metadata.revision;
		}
		const coordinates = {
			groupId, artifactId,
			version, revision,
			classifier, extension
		};

		const targetPath = this._getTargetPathForArtifact(coordinates);
		const installed = await this._pathExists(targetPath);
		const logId = this._generateLogIdFromCoordinates(coordinates);
		const fsId = this._generateFsIdFromCoordinates(coordinates);
		if (!installed) {
			await this._synchronize(`artifact-${fsId}`, async () => {
				// check again whether the artifact is now installed
				const installed = await this._pathExists(targetPath);
				if (installed) {
					log.verbose(`Already installed: ${artifactId} in version ${revision}`);
					return;
				}

				const stagingPath = this._getStagingPathForArtifact(coordinates);
				log.info(`Installing missing artifact ${logId}...`);

				// Check whether staging dir already exists and remove it
				if (await this._pathExists(stagingPath)) {
					log.verbose(`Removing existing file in staging dir at ${stagingPath}...`);
					await rm(stagingPath);
				}
				await mkdirp(path.dirname(stagingPath));

				log.verbose(`Installing ${artifactId} in version ${version} to ${stagingPath}...`);

				// TODO: Stream response body to installPackage and unzip directly via
				// https://github.com/isaacs/minizlib (already in dependencies through pacote)
				// This way we do not store the archive unnecessarily
				const reg = await this.getRegistry();
				await reg.requestArtifact(coordinates, stagingPath);

				await mkdirp(path.dirname(targetPath));
				log.verbose(
					`Promoting artifact from staging path ${stagingPath} to target path at ${targetPath}...`);
				await rename(stagingPath, targetPath);
			});
		} else {
			log.verbose(`Already installed: ${artifactId} in version ${revision}`);
		}
		return {
			artifactPath: targetPath,
			removeArtifact: () => {
				return rm(targetPath);
			}
		};
	}

	async _projectExists(targetDir) {
		return this._pathExists(path.join(targetDir, "package.json"));
	}

	async _pathExists(targetPath) {
		try {
			await stat(targetPath);
			return true;
		} catch (err) {
			if (err.code === "ENOENT") { // "File or directory does not exist"
				return false;
			} else {
				throw err;
			}
		}
	}

	_getStagingPathForArtifact(coordinates) {
		// Staging dir should only contain single files, no directory hierarchy.
		// This makes cleanups after promoting artifacts easier and does not leave empty directories.
		return path.join(this._stagingDir, this._generateFsIdFromCoordinates(coordinates));
	}

	_getTargetPathForArtifact({groupId, artifactId, revision, classifier, extension}) {
		if (!classifier) {
			classifier = revision;
			revision = "";
		}
		return path.join(this._artifactsDir,
			`${groupId}-${artifactId}`.replaceAll(".", "_"), revision, `${classifier}.${extension}`);
	}

	_getStagingDirForPackage(pkgName, version) {
		// Staging dir should only contain single files, no directory hierarchy.
		// This makes cleanups after promoting artifacts easier and does not leave empty directories.
		return path.join(this._stagingDir, `${pkgName.replaceAll("/", "-")}-${version}`);
	}

	_getTargetDirForPackage(pkgName, version) {
		return path.join(this._packagesDir, ...pkgName.split("/"), version);
	}

	/**
	 * Generate an identifier for an artifact that is safe to use in file names.
	 * Used for naming metadata- and lock-files
	 *
	 * @param {object} parameters
	 * @param {string} parameters.groupId GroupId of the artifact
	 * @param {string} parameters.artifactId ArtifactId of the artifact
	 * @param {string} parameters.extension Extension of the artifact
	 * @param {string} [parameters.classifier] Optional classifier of the artifact
	 * @param {string} [parameters.version] Version of the artifact. Optional if revision is provided
	 * @param {string} [parameters.revision] Optional revision of the artifact
	 * @returns {string} A unique identifier for the provided combination of parameters
	 */
	_generateFsIdFromCoordinates({groupId, artifactId, version, classifier, extension, revision}) {
		// Using underscores instead of colons, since the colon is a reserved character for
		// filenames on Windows and macOS
		const optionalClassifier = classifier ? `${classifier}.` : "";
		return `${groupId}_${artifactId}_${revision || version}_${optionalClassifier}${extension}`;
	}

	/**
	 * Generate an identifier for an artifact that is suitable for logging purposes
	 *
	 * @param {object} parameters
	 * @param {string} parameters.groupId GroupId of the artifact
	 * @param {string} parameters.artifactId ArtifactId of the artifact
	 * @param {string} parameters.version Version of the artifact
	 * @param {string} parameters.extension Extension of the artifact
	 * @param {string} [parameters.classifier] Optional classifier of the artifact
	 * @param {string} [parameters.revision] Optional revision of the artifact
	 * @returns {string} A string with the Maven-typical formatting of the provided coordinates
	 */
	_generateLogIdFromCoordinates({groupId, artifactId, version, classifier, extension, revision}) {
		const optionalClassifier = classifier ? `${classifier}.` : "";
		return `${groupId}:${artifactId}:${revision || version}:${optionalClassifier}${extension}`;
	}
}

export default Installer;
