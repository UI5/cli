import path from "node:path";
import os from "node:os";
import {getLogger} from "@ui5/logger";
const log = getLogger("ui5Framework:AbstractResolver");
import semver from "semver";

// Reduced Semantic Versioning pattern
// Matches MAJOR or MAJOR.MINOR as a simple version range to be resolved to the latest minor/patch
const VERSION_RANGE_REGEXP = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-SNAPSHOT)?$/;

/**
 * Abstract Resolver
 *
 * @abstract
 * @public
 * @class
 * @alias @ui5/project/ui5Framework/AbstractResolver
 * @hideconstructor
 */
class AbstractResolver {
	/* eslint-disable max-len */
	/**
	 * @param {*} options options
	 * @param {string} [options.version] Framework version to use. When omitted, all libraries need to be available
	 * via <code>providedLibraryMetadata</code> parameter. Otherwise an error is thrown.
	 * @param {boolean} [options.sources=false] Whether to install framework libraries as sources or
	 * 					pre-built (with build manifest)
	 * @param {string} [options.cwd=process.cwd()] Current working directory
	 * @param {string} [options.ui5HomeDir="~/.ui5"] UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers. Relative to `process.cwd()`
	 * @param {object.<string, @ui5/project/ui5Framework/AbstractResolver~LibraryMetadataEntry>} [options.providedLibraryMetadata]
	 * Resolver skips installing listed libraries and uses the dependency information to resolve their dependencies.
	 * <code>version</code> can be omitted in case all libraries can be resolved via the <code>providedLibraryMetadata</code>.
	 * Otherwise an error is thrown.
	 */
	/* eslint-enable max-len */
	constructor({cwd, version, sources, ui5HomeDir, providedLibraryMetadata}) {
		if (new.target === AbstractResolver) {
			throw new TypeError("Class 'AbstractResolver' is abstract");
		}

		// In some CI environments, the homedir might be set explicitly to a relative
		// path (e.g. "./"), but tooling requires an absolute path
		this._ui5HomeDir = path.resolve(
			ui5HomeDir || path.join(os.homedir(), ".ui5")
		);
		this._cwd = cwd ? path.resolve(cwd) : process.cwd();
		this._version = version;

		// Environment variable should always enforce usage of sources
		if (process.env.UI5_PROJECT_USE_FRAMEWORK_SOURCES) {
			sources = true;
		}
		this._sources = !!sources;

		this._providedLibraryMetadata = providedLibraryMetadata;
	}

	async _processLibrary(libraryName, libraryMetadata, errors) {
		// Check if library is already processed
		if (libraryMetadata[libraryName]) {
			return;
		}
		// Mark library as handled
		libraryMetadata[libraryName] = Object.create(null);

		log.verbose("Processing " + libraryName);

		let promises;
		const providedLibraryMetadata = this._providedLibraryMetadata?.[libraryName];
		if (providedLibraryMetadata) {
			log.verbose(`Skipping install for ${libraryName} (provided)`);
			promises = {
				// Use existing metadata if library is provided from outside (e.g. workspace)
				metadata: Promise.resolve(providedLibraryMetadata),
				// Provided libraries are already "installed"
				install: Promise.resolve({
					pkgPath: providedLibraryMetadata.path
				})
			};
		} else if (!this._version) {
			throw new Error(`Unable to install library ${libraryName}. No framework version provided.`);
		} else {
			promises = await this.handleLibrary(libraryName);
		}

		const [metadata, {pkgPath}] = await Promise.all([
			promises.metadata.then((metadata) =>
				this._processDependencies(libraryName, metadata, libraryMetadata, errors)),
			promises.install
		]);

		// Add path to installed package to metadata
		metadata.path = pkgPath;

		// Add metadata entry
		libraryMetadata[libraryName] = metadata;
	}

	async _processDependencies(libraryName, metadata, libraryMetadata, errors) {
		if (metadata.dependencies.length > 0) {
			log.verbose("Processing dependencies of " + libraryName);
			await this._processLibraries(metadata.dependencies, libraryMetadata, errors);
			log.verbose("Done processing dependencies of " + libraryName);
		}
		return metadata;
	}

	async _processLibraries(libraryNames, libraryMetadata, errors) {
		const sourceErrors = new Set();
		const results = await Promise.all(libraryNames.map(async (libraryName) => {
			try {
				await this._processLibrary(libraryName, libraryMetadata, errors);
			} catch (err) {
				if (sourceErrors.has(err.message)) {
					return `Failed to resolve library ${libraryName}: Error already logged`;
				}
				sourceErrors.add(err.message);
				log.verbose(`Failed to process library ${libraryName}`);
				log.verbose(`Error: ${err.message}`);
				log.verbose(`Call stack: ${err.stack}`);
				return `Failed to resolve library ${libraryName}: ${err.message}`;
			}
		}));
		// Don't add empty results (success)
		errors.push(...results.filter(($) => $));
	}

	/**
	 * Library metadata entry
	 *
	 * @example
	 * const libraryMetadataEntry = {
	 *		"id": "@openui5/sap.ui.core",
	 *		"version": "1.75.0",
	 *		"path": "~/.ui5/framework/packages/@openui5/sap.ui.core/1.75.0",
	 *		"dependencies": [],
	 *		"optionalDependencies": []
	 * };
	 *
	 * @public
	 * @typedef {object} @ui5/project/ui5Framework/AbstractResolver~LibraryMetadataEntry
	 * @property {string} id Identifier
	 * @property {string} version Version
	 * @property {string} path Path
	 * @property {string[]} dependencies List of dependency ids
	 * @property {string[]} optionalDependencies List of optional dependency ids
	 */

	/**
	 * Install result
	 *
	 * @example
	 * const resolverInstallResult = {
	 * 	"libraryMetadata": {
	 * 		"sap.ui.core": {
	 * 			// ...
	 * 		},
	 * 		"sap.m": {
	 * 			// ...
	 * 		}
	 * 	}
	 * };
	 *
	 * @public
	 * @typedef {object} @ui5/project/ui5Framework/AbstractResolver~ResolverInstallResult
	 * @property {object.<string, @ui5/project/ui5Framework/AbstractResolver~LibraryMetadataEntry>} libraryMetadata
	 *   Object containing all installed libraries with library name as key
	 */

	/**
	 * Installs the provided libraries and their dependencies
	 *
	 * @example
	 * const resolver = new Sapui5Resolver({version: "1.76.0"});
	 * // Or for OpenUI5:
	 * // const resolver = new Openui5Resolver({version: "1.76.0"});
	 *
	 * resolver.install(["sap.ui.core", "sap.m"]).then(({libraryMetadata}) => {
	 * 	// Installation done
	 * }).catch((err) => {
	 * 	// Handle installation errors
	 * });
	 *
	 * @public
	 * @param {string[]} libraryNames List of library names to be installed
	 * @returns {@ui5/project/ui5Framework/AbstractResolver~ResolverInstallResult}
	 *   Resolves with an object containing the <code>libraryMetadata</code>
	 */
	async install(libraryNames) {
		const libraryMetadata = Object.create(null);
		const errors = [];

		await this._processLibraries(libraryNames, libraryMetadata, errors);

		if (errors.length === 1) {
			throw new Error(errors[0]);
		} if (errors.length > 1) {
			const msg = errors.map((err, idx) => `  ${idx + 1}. ${err}`).join("\n");
			throw new Error(`Resolution of framework libraries failed with errors:\n${msg}`);
		}

		return {
			libraryMetadata
		};
	}

	static async resolveVersion(version, {ui5HomeDir, cwd} = {}) {
		// Don't allow nullish values
		// An empty string is a valid semver range that converts to "*", which should not be supported
		if (!version) {
			throw new Error(`Framework version specifier "${version}" is incorrect or not supported`);
		}

		const spec = await this._getVersionSpec(version, {ui5HomeDir, cwd});

		// For all invalid cases which are not explicitly handled in _getVersionSpec
		if (!spec) {
			throw new Error(`Framework version specifier "${version}" is incorrect or not supported`);
		}

		const versions = await this.fetchAllVersions({ui5HomeDir, cwd});
		const resolvedVersion = semver.maxSatisfying(versions, spec, {
			// Allow ranges that end with -SNAPSHOT to match any -SNAPSHOT version
			// like a normal version in order to support ranges like 1.x.x-SNAPSHOT.
			includePrerelease: this._isSnapshotVersionOrRange(version)
		});

		if (!resolvedVersion) {
			if (semver.valid(spec)) {
				if (this.name === "Sapui5Resolver" && semver.lt(spec, "1.76.0")) {
					throw new Error(`Could not resolve framework version ${version}. ` +
						`Note that SAPUI5 framework libraries can only be consumed by the UI5 Tooling ` +
						`starting with SAPUI5 v1.76.0`);
				} else if (this.name === "Openui5Resolver" && semver.lt(spec, "1.52.5")) {
					throw new Error(`Could not resolve framework version ${version}. ` +
						`Note that OpenUI5 framework libraries can only be consumed by the UI5 Tooling ` +
						`starting with OpenUI5 v1.52.5`);
				}
			}
			throw new Error(
				`Could not resolve framework version ${version}. ` +
				`Make sure the version is valid and available in the configured registry.`);
		}

		return resolvedVersion;
	}

	static async _getVersionSpec(version, {ui5HomeDir, cwd}) {
		if (this._isSnapshotVersionOrRange(version)) {
			const versionMatch = version.match(VERSION_RANGE_REGEXP);
			if (versionMatch) {
				// For snapshot version ranges we need to insert a stand-in "x" for the patch level
				// and - in case none is provided - another "x" for the major version in order to
				// convert it to a valid semver range:
				// "1-SNAPSHOT" becomes "1.x.x-SNAPSHOT" and "1.112-SNAPSHOT" becomes "1.112.x-SNAPSHOT"
				return `${versionMatch[1]}.${versionMatch[2] || "x"}.x-SNAPSHOT`;
			}
		}

		// Covers versions and ranges, as versions are also valid ranges
		if (semver.validRange(version)) {
			return version;
		}

		// Check for invalid tag name (same check as npm does)
		if (encodeURIComponent(version) !== version) {
			return null;
		}

		const allTags = await this.fetchAllTags({ui5HomeDir, cwd});

		if (!allTags) {
			// Resolver doesn't support tags (e.g. Sapui5MavenSnapshotResolver)
			// Only latest and latest-snapshot are supported which both resolve
			// to the latest available version.
			// See "isSnapshotVersionOrRange" for -snapshot handling
			if ((version === "latest" || version === "latest-snapshot")) {
				return "*";
			} else {
				return null;
			}
		}

		if (!allTags[version]) {
			throw new Error(
				`Could not resolve framework version via tag '${version}'. ` +
				`Make sure the tag is available in the configured registry.`
			);
		}

		// Use version from tag
		return allTags[version];
	}

	static _isSnapshotVersionOrRange(version) {
		return version.toLowerCase().endsWith("-snapshot");
	}

	// To be implemented by resolver
	async getLibraryMetadata(libraryName) {
		throw new Error("AbstractResolver: getLibraryMetadata must be implemented!");
	}
	async handleLibrary(libraryName) {
		throw new Error("AbstractResolver: handleLibrary must be implemented!");
	}
	static fetchAllVersions(options) {
		throw new Error("AbstractResolver: static fetchAllVersions must be implemented!");
	}
	static fetchAllTags(options) {
		return null;
	}
}

export default AbstractResolver;
