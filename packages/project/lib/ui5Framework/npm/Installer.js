import path from "node:path";
import {mkdirp} from "../../utils/fs.js";
import fs from "graceful-fs";
import {promisify} from "node:util";
import Registry from "./Registry.js";
import AbstractInstaller from "../AbstractInstaller.js";
import {rmrf} from "../../utils/fs.js";
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const rename = promisify(fs.rename);
import {getLogger} from "@ui5/logger";
const log = getLogger("ui5Framework:npm:Installer");

class Installer extends AbstractInstaller {
	/**
	 * @param {object} parameters Parameters
	 * @param {string} parameters.cwd Current working directory
	 * @param {string} parameters.ui5DataDir UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers.
	 * @param {string} [parameters.packagesDir="${ui5DataDir}/framework/packages"] Where to install packages
	 * @param {string} [parameters.stagingDir="${ui5DataDir}/framework/staging"] The staging directory for the packages
	 * @param {string} [parameters.cacheDir="${ui5DataDir}/framework/cacache"] Where to store temp/cached packages.
	 */
	constructor({cwd, ui5DataDir, packagesDir, stagingDir, cacheDir}) {
		super(ui5DataDir);
		if (!cwd) {
			throw new Error(`Installer: Missing parameter "cwd"`);
		}
		this._packagesDir = packagesDir ?
			path.resolve(packagesDir) : path.join(ui5DataDir, "framework", "packages");

		log.verbose(`Installing to: ${this._packagesDir}`);

		this._cwd = cwd;
		this._caCacheDir = cacheDir ?
			path.resolve(cacheDir) : path.join(ui5DataDir, "framework", "cacache");
		this._stagingDir = stagingDir ?
			path.resolve(stagingDir) : path.join(ui5DataDir, "framework", "staging");
	}

	getRegistry() {
		if (this._cachedRegistry) {
			return this._cachedRegistry;
		}
		return this._cachedRegistry = new Registry({
			cwd: this._cwd,
			cacheDir: this._caCacheDir
		});
	}

	async readJson(jsonPath) {
		return JSON.parse(await readFile(jsonPath, {encoding: "utf8"}));
	}

	async fetchPackageVersions({pkgName}) {
		const packument = await this.getRegistry().requestPackagePackument(pkgName);
		return Object.keys(packument.versions);
	}

	async fetchPackageDistTags({pkgName}) {
		const packument = await this.getRegistry().requestPackagePackument(pkgName);
		return packument["dist-tags"];
	}

	async fetchPackageManifest({pkgName, version}) {
		const targetDir = this._getTargetDirForPackage({pkgName, version});
		try {
			const pkg = await this.readJson(path.join(targetDir, "package.json"));
			return {
				name: pkg.name,
				dependencies: pkg.dependencies,
				devDependencies: pkg.devDependencies
			};
		} catch (err) {
			if (err.code === "ENOENT") { // "File or directory does not exist"
				const manifest = await this.getRegistry().requestPackageManifest(pkgName, version);
				return {
					name: manifest.name,
					dependencies: manifest.dependencies,
					devDependencies: manifest.devDependencies
				};
			} else {
				throw err;
			}
		}
	}

	async installPackage({pkgName, version}) {
		const targetDir = this._getTargetDirForPackage({pkgName, version});
		const installed = await this._packageJsonExists(targetDir);
		if (!installed) {
			await this._synchronize(`package-${pkgName}@${version}`, async () => {
				// check again whether package is now installed
				const installed = await this._packageJsonExists(targetDir);
				if (!installed) {
					const stagingDir = this._getStagingDirForPackage({pkgName, version});
					log.info(`Installing missing package ${pkgName}...`);

					// Check whether staging dir already exists and remove it
					if (await this._pathExists(stagingDir)) {
						log.verbose(`Removing existing staging directory at ${stagingDir}...`);
						await rmrf(stagingDir);
					}

					// Check whether target dir already exists and remove it.
					// A target directory already existing but missing a package.json should
					// never happen. However, we want to be *really* sure that there is no target
					// directory so that the rename operation won't have any no trouble.
					if (await this._pathExists(targetDir)) {
						log.verbose(`Removing existing target directory at ${targetDir}...`);
						await rmrf(targetDir);
					}

					log.verbose(`Installing ${pkgName} in version ${version} to ${stagingDir}...`);
					await this.getRegistry().extractPackage(pkgName, version, stagingDir);

					// Do not create target dir itself to prevent EPERM error in following rename operation
					// (https://github.com/SAP/ui5-tooling/issues/487)
					await mkdirp(path.dirname(targetDir));
					log.verbose(`Promoting staging directory from ${stagingDir} to ${targetDir}...`);
					await rename(stagingDir, targetDir);
				} else {
					log.verbose(`Already installed: ${pkgName} in version ${version}`);
				}
			});
		} else {
			log.verbose(`Already installed: ${pkgName} in version ${version}`);
		}
		return {
			pkgPath: targetDir
		};
	}

	async _packageJsonExists(targetDir) {
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

	_getTargetDirForPackage({pkgName, version}) {
		return path.join(this._packagesDir, ...pkgName.split("/"), version);
	}

	_getStagingDirForPackage({pkgName, version}) {
		return path.join(this._stagingDir, `${pkgName.replaceAll("/", "-")}-${version}`);
	}
}

export default Installer;
