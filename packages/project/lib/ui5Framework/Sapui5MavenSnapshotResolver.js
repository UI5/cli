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
	 * @param {string} [options.snapshotEndpointUrl] Maven Repository Snapshot URL. Can by overruled
	 *	by setting the <code>UI5_MAVEN_SNAPSHOT_ENDPOINT_URL</code> environment variable. If neither is provided,
	 *	falling back to the standard Maven settings.xml file (if existing).
	 * @param {string} options.version SAPUI5 version to use
	 * @param {boolean} [options.sources=false] Whether to install framework libraries as sources or
	 * pre-built (with build manifest)
	 * @param {string} [options.cwd=process.cwd()] Current working directory
	 * @param {string} [options.ui5HomeDir="~/.ui5"] UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers. Relative to `process.cwd()`
	 * @param {module:@ui5/project/ui5Framework/maven/CacheMode} [options.cacheMode=Default]
	 * Cache mode to use
	 */
	constructor(options) {
		super(options);

		const {
			cacheMode,
		} = options;

		this._installer = new Installer({
			ui5HomeDir: this._ui5HomeDir,
			snapshotEndpointUrlCb:
				Sapui5MavenSnapshotResolver._createSnapshotEndpointUrlCallback(options.snapshotEndpointUrl),
			cacheMode,
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
		snapshotEndpointUrl = process.env.UI5_MAVEN_SNAPSHOT_ENDPOINT_URL || snapshotEndpointUrl;

		if (!snapshotEndpointUrl) {
			// Here we return a function which returns a promise that resolves with the URL.
			// If we would already start resolving the settings.xml at this point, we'd need to always ask the
			// end user for confirmation whether the resolved URL should be used. In some cases where the resources
			// are already cached, this is actually not necessary and could be skipped
			return Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrl;
		} else {
			return () => Promise.resolve(snapshotEndpointUrl);
		}
	}

	/**
	 * Read the Maven repository snapshot endpoint URL from the central
	 * UI5 Tooling configuration, with a fallback to central Maven configuration (is existing)
	 *
	 * @returns {Promise<string>} The resolved snapshotEndpointUrl
	 */
	static async _resolveSnapshotEndpointUrl() {
		const {default: Configuration} = await import("../config/Configuration.js");
		const config = await Configuration.fromFile();
		let url = config.getMavenSnapshotEndpointUrl();
		if (url) {
			log.verbose(`Using UI5 Tooling configuration for mavenSnapshotEndpointUrl: ${url}`);
		} else {
			log.verbose(`No mavenSnapshotEndpointUrl configuration found`);
			url = await Sapui5MavenSnapshotResolver._resolveSnapshotEndpointUrlFromMaven();
			if (url) {
				log.verbose(`Updating UI5 Tooling configuration with new mavenSnapshotEndpointUrl: ${url}`);
				const configJson = config.toJson();
				configJson.mavenSnapshotEndpointUrl = url;
				await Configuration.toFile(new Configuration(configJson));
			}
		}
		return url;
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
				log.verbose(`"snapshot.build" attribute could not be found in ${settingsXML}`);
				return null;
			}
		} catch (err) {
			if (err.code === "ENOENT") {
				// "File or directory does not exist"
				log.verbose(`File does not exist: ${settingsXML}`);
			} else {
				log.warning(`Failed to read Maven configuration file from ${settingsXML}: ${err.message}`);
			}
			return null;
		}

		const {default: yesno} = await import("yesno");
		const ok = await yesno({
			question:
				"\nA Maven repository endpoint URL is required for consuming snapshot versions of UI5 libraries.\n" +
				"You can configure one using the command: 'ui5 config set mavenSnapshotEndpointUrl <url>'\n\n" +
				`The following URL has been found in a Maven configuration file at ${settingsXML}:\n${url}\n\n` +
				`Continue with this endpoint URL and remember it for the future? (yes)`,
			defaultValue: true,
		});

		if (ok) {
			log.verbose(`Using Maven snapshot endpoint URL resolved from Maven configuration file: ${url}`);
			return url;
		} else {
			log.verbose(`User rejected usage of the resolved URL`);
			return null;
		}
	}
}

export default Sapui5MavenSnapshotResolver;
