const path = require("path");
const semver = require("semver");
const AbstractResolver = require("./AbstractResolver");
const Installer = require("./npm/Installer");
const log = require("@ui5/logger").getLogger("normalizer:ui5Framework:Sapui5Resolver");

const DIST_PKG_NAME = "@sapui5/distribution-metadata";

/**
 * Resolver for the SAPUI5 framework
 *
 * @public
 * @memberof module:@ui5/project.ui5Framework
 * @augments  module:@ui5/project.ui5Framework.AbstractResolver
 */
class Sapui5Resolver extends AbstractResolver {
	/**
	 * @param {*} options options
	 * @param {string} options.version SAPUI5 version to use
	 * @param {string} [options.cwd=process.cwd()] Working directory to resolve configurations like .npmrc
	 * @param {string} [options.ui5HomeDir="~/.ui5"] UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers. Relative to `process.cwd()`
	 */
	constructor(options) {
		super(options);

		this._installer = new Installer({
			cwd: this._cwd,
			ui5HomeDir: this._ui5HomeDir
		});
		this._loadDistMetadata = null;
	}
	loadDistMetadata() {
		if (!this._loadDistMetadata) {
			this._loadDistMetadata = Promise.resolve().then(async () => {
				const version = this._version;
				log.verbose(`Installing ${DIST_PKG_NAME} in version ${version}...`);
				const pkgName = DIST_PKG_NAME;
				const {pkgPath} = await this._installer.installPackage({
					pkgName,
					version
				});

				const metadata = await this._installer.readJson(path.join(pkgPath, "metadata.json"));
				return metadata;
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

		if (metadata.npmPackageName.startsWith("@openui5/") &&
				semver.satisfies(this._version, "1.77.x")) {
			// TODO 3.0: Remove this workaround
			// 1.77.x (at least 1.77.0-1.77.2) distribution metadata.json is missing
			//	dependency information for all OpenUI5 libraries.
			// Therefore we need to request those from the registry like it is done
			//	for OpenUI5 projects.
			const Openui5Resolver = require("./Openui5Resolver");
			const openui5Resolver = new Openui5Resolver({
				cwd: this._cwd,
				version: metadata.version
			});
			const openui5Metadata = await openui5Resolver.getLibraryMetadata(libraryName);
			return {
				npmPackageName: openui5Metadata.id,
				version: openui5Metadata.version,
				dependencies: openui5Metadata.dependencies,
				optionalDependencies: openui5Metadata.optionalDependencies
			};
		}

		return metadata;
	}
	async handleLibrary(libraryName) {
		const metadata = await this.getLibraryMetadata(libraryName);

		return {
			metadata: Promise.resolve({
				id: metadata.npmPackageName,
				version: metadata.version,
				dependencies: metadata.dependencies,
				optionalDependencies: metadata.optionalDependencies
			}),
			// Trigger installation of package
			install: this._installer.installPackage({
				pkgName: metadata.npmPackageName,
				version: metadata.version
			})
		};
	}
	static async fetchAllVersions({ui5HomeDir, cwd} = {}) {
		const installer = new Installer({
			cwd: cwd ? path.resolve(cwd) : process.cwd(),
			ui5HomeDir:
				ui5HomeDir ? path.resolve(ui5HomeDir) :
					path.join(require("os").homedir(), ".ui5")
		});
		return await installer.fetchPackageVersions({pkgName: DIST_PKG_NAME});
	}
}

module.exports = Sapui5Resolver;
