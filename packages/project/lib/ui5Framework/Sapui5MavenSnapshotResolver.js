import path from "node:path";
import os from "node:os";
import AbstractResolver from "./AbstractResolver.js";
import Installer from "./maven/Installer.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("ui5Framework:Sapui5MavenSnapshotResolver");

const DIST_PKG_NAME = "@sapui5/distribution-metadata";
const DIST_GROUP_ID = "com.sap.ui5.dist";
const DIST_ARTIFACT_ID = "sapui5-sdk-dist";

/**
 * Resolver for the SAPUI5 framework
 *
 * This Resolver downloads and installs SNAPSHOTS of UI5 libraries from
 * a Maven repository. It's meant for internal usage only as no use cases
 * outside of SAP are known.
 *
 * @public
 * @class
 * @alias @ui5/project/ui5Framework/Sapui5MavenSnapshotResolver
 * @extends @ui5/project/ui5Framework/AbstractResolver
 */
class Sapui5MavenSnapshotResolver extends AbstractResolver {
	/**
	 * @param {*} options options
	 * @param {string} [options.snapshotEndpointUrl] Maven Repository Snapshot URL. If not provided,
	 *	falls back to an optional <code>UI5_MAVEN_SNAPSHOT_ENDPOINT</code> environment variable,
	 *	or the standard Maven settings.xml file (if existing).
	 * @param {string} options.version SAPUI5 version to use
	 * @param {boolean} [options.sources=false] Whether to install framework libraries as sources or
	 * pre-built (with build manifest)
	 * @param {string} [options.cwd=process.cwd()] Current working directory
	 * @param {string} [options.ui5HomeDir="~/.ui5"] UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers. Relative to `process.cwd()`
	 * @param {string} [options.cacheMode="default"] Can be "default" (cache everything, invalidate after 9 hours),
	 * 	"off" (do not cache) and "force" (use cache only - no requests)
	 * @param {string} [options.artifactsDir] Where to install Maven artifacts
	 * @param {string} [options.packagesDir] Where to install packages
	 * @param {string} [options.metadataDir] Where to store the metadata for Maven artifacts
	 * @param {string} [options.stagingDir] The staging directory for artifacts and packages
	 */
	constructor(options) {
		super(options);

		const {
			cacheMode,
			artifactsDir,
			packagesDir,
			metadataDir,
			stagingDir,
		} = options;

		this._installer = new Installer({
			ui5HomeDir: this._ui5HomeDir,
			snapshotEndpointUrlCb:
				Sapui5MavenSnapshotResolver._createSnapshotEndpointUrlCallback(options.snapshotEndpointUrl),
			cacheMode,
			artifactsDir,
			packagesDir,
			metadataDir,
			stagingDir,
		});
		this._loadDistMetadata = null;
	}
	loadDistMetadata() {
		if (!this._loadDistMetadata) {
			this._loadDistMetadata = Promise.resolve().then(async () => {
				const version = this._version;
				log.verbose(
					`Installing ${DIST_ARTIFACT_ID} in version ${version}...`
				);

				const {pkgPath: distPkgPath} = await this._installer.installPackage({
					pkgName: DIST_PKG_NAME,
					groupId: DIST_GROUP_ID,
					artifactId: DIST_ARTIFACT_ID,
					version,
					classifier: "npm-sources",
					extension: "zip",
				});

				return await this._installer.readJson(
					path.join(distPkgPath, "metadata.json")
				);
			});
		}
		return this._loadDistMetadata;
	}
	async getLibraryMetadata(libraryName) {
		const distMetadata = await this.loadDistMetadata();
		const metadata = distMetadata.libraries[libraryName];

		if (!metadata) {
			throw new Error(`Could not find library "${libraryName}"`);
		}

		return metadata;
	}
	async handleLibrary(libraryName) {
		const metadata = await this.getLibraryMetadata(libraryName);
		if (!metadata.gav) {
			throw new Error(
				"Metadata is missing GAV (group, artifact and version) " +
					"information. This might indicate an unsupported SNAPSHOT version."
			);
		}
		const gav = metadata.gav.split(":");
		let pkgName = metadata.npmPackageName;
		if (!this._sources) {
			pkgName += "-prebuilt";
		}

		return {
			metadata: Promise.resolve({
				id: pkgName,
				version: metadata.version,
				dependencies: metadata.dependencies,
				optionalDependencies: metadata.optionalDependencies,
			}),
			// Trigger installation of package
			install: this._installer.installPackage({
				pkgName,
				groupId: gav[0],
				artifactId: gav[1],
				version: metadata.version,
				classifier: this._sources ? "npm-sources" : null,
				extension: this._sources ? "zip" : "jar",
			}),
		};
	}

	static async fetchAllVersions({ui5HomeDir, cwd, snapshotEndpointUrl} = {}) {
		const installer = new Installer({
			cwd: cwd ? path.resolve(cwd) : process.cwd(),
			ui5HomeDir: path.resolve(
				ui5HomeDir || path.join(os.homedir(), ".ui5")
			),
			snapshotEndpointUrlCb: Sapui5MavenSnapshotResolver._createSnapshotEndpointUrlCallback(snapshotEndpointUrl),
		});
		return await installer.fetchPackageVersions({
			groupId: DIST_GROUP_ID,
			artifactId: DIST_ARTIFACT_ID,
		});
	}

	static _createSnapshotEndpointUrlCallback(snapshotEndpointUrl) {
		snapshotEndpointUrl = snapshotEndpointUrl || process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT;

		if (!snapshotEndpointUrl) {
			// If we resolve the settings.xml at this point, we'd need to always ask the end
			// user for confirmation. In some cases where the resources are already cached,
			// this is not necessary and we could skip it as a real request to the repository won't
			// be made.
			return Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrlFromMaven;
		} else {
			return () => Promise.resolve(snapshotEndpointUrl);
		}
	}

	/**
	 * Tries to detect whether ~/.m2/settings.xml exist, and if so, whether
	 * the snapshot.build URL is extracted from there
	 *
	 * @param {string} [settingsXML=~/.m2/settings.xml] Path to the settings.xml.
	 * 				If not provided, the default location is used
	 * @returns {Promise<string>} The resolved snapshot.build URL from ~/.m2/settings.xml
	 */
	static async _resolveSnapshotEndpointUrlFromMaven(settingsXML) {
		if (!process.stdout.isTTY) {
			// We can't prompt the user if stdout is non-interactive (i.e. in CI environments)
			// Therefore skip resolution from Maven settings.xml altogether
			return null;
		}

		let skipConfirmation = false;
		settingsXML =
			settingsXML || path.resolve(path.join(os.homedir(), ".m2", "settings.xml"));

		const {default: fs} = await import("graceful-fs");
		const {promisify} = await import("node:util");
		const readFile = promisify(fs.readFile);
		const xml2js = await import("xml2js");
		const parser = new xml2js.Parser({
			preserveChildrenOrder: true,
			xmlns: true,
		});
		let url;

		log.verbose(`Attempting to resolve snapshot endpoint URL from Maven configuration file at ${settingsXML}...`);
		try {
			const fileContent = await readFile(settingsXML);
			const xmlContents = await parser.parseStringPromise(fileContent);

			const snapshotBuildChunk = xmlContents?.settings?.profiles[0]?.profile.filter(
				(prof) => prof.id[0]._ === "snapshot.build"
			)[0];

			url =
				snapshotBuildChunk?.repositories?.[0]?.repository?.[0]?.url?.[0]?._ ||
				snapshotBuildChunk?.pluginRepositories?.[0]?.pluginRepository?.[0]?.url?.[0]?._;

			if (!url) {
				skipConfirmation = true;
				log.verbose(`"snapshot.build" attribute could not be found in ${settingsXML}`);
			}
		} catch (err) {
			skipConfirmation = true;
			if (err.code === "ENOENT") {
				// "File or directory does not exist"
				log.verbose(`File does not exist: ${settingsXML}`);
			} else {
				log.warning(`Failed to read Maven configuration file from ${settingsXML}: ${err.message}`);
			}
		}

		if (!skipConfirmation) {
			const {default: yesno} = await import("yesno");
			const ok = await yesno({
				question:
					"A Maven snapshot endpoint URL is required for consuming snapshot versions of UI5 libraries. " +
					`The following URL has been found in a Maven configuration file at ${settingsXML}: '${url}'. ` +
					`Continue with this endpoint URL? (yes)`,
				defaultValue: true,
			});

			if (ok) {
				log.info(`Using Maven snapshot endpoint URL resolved from Maven configuration file: ${url}`);
				log.info(`Consider persisting this choice by executing the following command: ` +
					`ui5 config set mavenSnapshotEndpointUrl ${url}`);
			} else {
				log.verbose(`User rejected usage of the resolved URL`);
				url = null;
			}
		}

		return url;
	}
}

export default Sapui5MavenSnapshotResolver;
