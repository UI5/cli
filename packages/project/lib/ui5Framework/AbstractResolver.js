const path = require("path");
const log = require("@ui5/logger").getLogger("ui5Framework:AbstractResolver");
const semver = require("semver");

// Matches Semantic Versioning 2.0.0 versions
// https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
//
// This needs to be aligned with the ui5.yaml JSON schema:
// lib/validation/schema/specVersion/2.0/kind/project.json#/definitions/framework/properties/version/pattern
//
// eslint-disable-next-line max-len
const SEMVER_VERSION_REGEXP = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// Reduced Semantic Versioning pattern
// Matches MAJOR.MINOR as a simple version range to be resolved to the latest patch
const VERSION_RANGE_REGEXP = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Abstract Resolver
 *
 * @public
 * @abstract
 * @memberof module:@ui5/project.ui5Framework
 */
class AbstractResolver {
	/**
	 * @param {*} options options
	 * @param {string} options.version Framework version to use
	 * @param {string} [options.cwd=process.cwd()] Working directory to resolve configurations like .npmrc
	 * @param {string} [options.ui5HomeDir="~/.ui5"] UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers. Relative to `process.cwd()`
	 */
	constructor({cwd, version, ui5HomeDir}) {
		if (new.target === AbstractResolver) {
			throw new TypeError("Class 'AbstractResolver' is abstract");
		}

		if (!version) {
			throw new Error(`AbstractResolver: Missing parameter "version"`);
		}

		this._ui5HomeDir = ui5HomeDir ? path.resolve(ui5HomeDir) : path.join(require("os").homedir(), ".ui5");
		this._cwd = cwd ? path.resolve(cwd) : process.cwd();
		this._version = version;
	}

	async _processLibrary(libraryName, libraryMetadata, errors) {
		// Check if library is already processed
		if (libraryMetadata[libraryName]) {
			return;
		}
		// Mark library as handled
		libraryMetadata[libraryName] = {};

		log.verbose("Processing " + libraryName);

		const promises = await this.handleLibrary(libraryName);

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
		const results = await Promise.all(libraryNames.map(async (libraryName) => {
			try {
				await this._processLibrary(libraryName, libraryMetadata, errors);
			} catch (err) {
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
	 * @typedef {object} LibraryMetadataEntry
	 * @property {string} id Identifier
	 * @property {string} version Version
	 * @property {string} path Path
	 * @property {string[]} dependencies List of dependency ids
	 * @property {string[]} optionalDependencies List of optional dependency ids
	 * @memberof module:@ui5/project.ui5Framework
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
	 * @typedef {object} ResolverInstallResult
	 * @property {object.<string, module:@ui5/project.ui5Framework.LibraryMetadataEntry>} libraryMetadata
	 *   Object containing all installed libraries with library name as key
	 * @memberof module:@ui5/project.ui5Framework
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
	 * @returns {module:@ui5/project.ui5Framework.ResolverInstallResult}
	 *   Resolves with an object containing the <code>libraryMetadata</code>
	 */
	async install(libraryNames) {
		const libraryMetadata = {};
		const errors = [];

		await this._processLibraries(libraryNames, libraryMetadata, errors);

		if (errors.length > 0) {
			throw new Error("Resolution of framework libraries failed with errors:\n" + errors.join("\n"));
		}

		return {
			libraryMetadata
		};
	}

	static async resolveVersion(version, {ui5HomeDir, cwd} = {}) {
		let spec;
		if (version === "latest") {
			spec = "*";
		} else if (VERSION_RANGE_REGEXP.test(version) || SEMVER_VERSION_REGEXP.test(version)) {
			spec = version;
		} else {
			throw new Error(`Framework version specifier "${version}" is incorrect or not supported`);
		}
		const versions = await this.fetchAllVersions({ui5HomeDir, cwd});
		const resolvedVersion = semver.maxSatisfying(versions, spec);
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
			throw new Error(`Could not resolve framework version ${version}`);
		}
		return resolvedVersion;
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
}

if (process.env.NODE_ENV === "test") {
	// Export pattern for testing to be checked against JSON schema pattern
	AbstractResolver._SEMVER_VERSION_REGEXP = SEMVER_VERSION_REGEXP;
}

module.exports = AbstractResolver;
