import path from "node:path";
import os from "node:os";
import AbstractResolver from "./AbstractResolver.js";
import Installer from "./npm/Installer.js";

const OPENUI5_CORE_PACKAGE = "@openui5/sap.ui.core";

/**
 * Resolver for the OpenUI5 framework
 *
 * @public
 * @class
 * @alias @ui5/project/ui5Framework/Openui5Resolver
 * @extends @ui5/project/ui5Framework/AbstractResolver
 */
class Openui5Resolver extends AbstractResolver {
	/**
	 * @param {*} options options
	 * @param {string} options.version OpenUI5 version to use
	 * @param {string} [options.cwd=process.cwd()] Working directory to resolve configurations like .npmrc
	 * @param {string} [options.ui5DataDir="~/.ui5"] UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers. Relative to `process.cwd()`
	 * @param {string} [options.cacheDir] Where to store temp/cached packages.
	 * @param {string} [options.packagesDir] Where to install packages
	 * @param {string} [options.stagingDir] The staging directory for the packages
	 */
	constructor(options) {
		super(options);

		const {cacheDir, packagesDir, stagingDir} = options;

		this._installer = new Installer({
			cwd: this._cwd,
			ui5DataDir: this._ui5DataDir,
			cacheDir, packagesDir, stagingDir
		});
		this._loadLibraryMetadata = Object.create(null);
	}
	static _getNpmPackageName(libraryName) {
		return "@openui5/" + libraryName;
	}
	static _getLibaryName(pkgName) {
		return pkgName.replace(/^@openui5\//, "");
	}
	getLibraryMetadata(libraryName) {
		if (!this._loadLibraryMetadata[libraryName]) {
			this._loadLibraryMetadata[libraryName] = Promise.resolve().then(async () => {
				// Trigger manifest request to gather transitive dependencies
				const pkgName = Openui5Resolver._getNpmPackageName(libraryName);
				const libraryManifest = await this._installer.fetchPackageManifest({pkgName, version: this._version});
				let dependencies = [];
				if (libraryManifest.dependencies) {
					const depNames = Object.keys(libraryManifest.dependencies);
					dependencies = depNames.map(Openui5Resolver._getLibaryName);
				}

				// npm devDependencies are handled as "optionalDependencies"
				// in terms of the UI5 framework metadata structure
				let optionalDependencies = [];
				if (libraryManifest.devDependencies) {
					const devDepNames = Object.keys(libraryManifest.devDependencies);
					optionalDependencies = devDepNames.map(Openui5Resolver._getLibaryName);
				}

				return {
					id: pkgName,
					version: this._version,
					dependencies,
					optionalDependencies
				};
			});
		}
		return this._loadLibraryMetadata[libraryName];
	}
	async handleLibrary(libraryName) {
		const pkgName = Openui5Resolver._getNpmPackageName(libraryName);
		return {
			// Trigger metadata request
			metadata: this.getLibraryMetadata(libraryName),
			// Also trigger installation of package
			install: this._installer.installPackage({
				pkgName,
				version: this._version
			})
		};
	}
	static async fetchAllVersions(options) {
		const installer = this._getInstaller(options);
		return await installer.fetchPackageVersions({pkgName: OPENUI5_CORE_PACKAGE});
	}

	static async fetchAllTags(options) {
		const installer = this._getInstaller(options);
		return installer.fetchPackageDistTags({pkgName: OPENUI5_CORE_PACKAGE});
	}

	static _getInstaller({ui5DataDir, cwd} = {}) {
		return new Installer({
			cwd: cwd ? path.resolve(cwd) : process.cwd(),
			ui5DataDir:
				ui5DataDir ? path.resolve(ui5DataDir) :
					path.join(os.homedir(), ".ui5")
		});
	}
}

export default Openui5Resolver;
