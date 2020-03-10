const path = require("path");
const AbstractResolver = require("./AbstractResolver");
const Installer = require("./npm/Installer");
const log = require("@ui5/logger").getLogger("normalizer:ui5Framework:Sapui5Resolver");

const DIST_PKG_NAME = "@sapui5/distribution-metadata";

/**
 * Resolver for the SAPUI5 framework
 *
 * @public
 * @memberof module:@ui5/project.ui5Framework
 * @extends  module:@ui5/project.ui5Framework.AbstractResolver
 */
class Sapui5Resolver extends AbstractResolver {
	/**
	 * @param {*} options options
	 * @param {string} options.version SAPUI5 version to use
	 * @param {string} [options.cwd=process.cwd()] Working directory to resolve configurations like .npmrc
	 * @param {string} [options.ui5HomeDir="~/.ui5"] UI5 home directory location. This will be used to store packages, metadata and configuration used by the resolvers. Relative to `process.cwd()`
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
	async handleLibrary(libraryName) {
		const distMetadata = await this.loadDistMetadata();
		const metadata = distMetadata.libraries[libraryName];
		if (!metadata) {
			throw new Error(`Could not find library "${libraryName}"`);
		}

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
}

module.exports = Sapui5Resolver;
