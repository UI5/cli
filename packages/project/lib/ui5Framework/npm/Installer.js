const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const rename = promisify(fs.rename);
const lockfile = require("lockfile");
const lock = promisify(lockfile.lock);
const unlock = promisify(lockfile.unlock);
const mkdirp = require("mkdirp");
const Registry = require("./Registry");
const log = require("@ui5/logger").getLogger("normalizer:ui5Framework:npm:Installer");

class Installer {
	constructor({cwd, ui5HomeDir}) {
		if (!cwd) {
			throw new Error(`Installer: Missing parameter "cwd"`);
		}
		if (!ui5HomeDir) {
			throw new Error(`Installer: Missing parameter "ui5HomeDir"`);
		}
		this._packagesDir = path.join(ui5HomeDir, "framework", "packages");
		log.verbose(`Installing to: ${this._packagesDir}`);
		this._registry = new Registry({
			cwd,
			cacheDir: path.join(ui5HomeDir, "framework", "cacache")
		});
		this._lockDir = path.join(ui5HomeDir, "framework", "locks");
		this._stagingDir = path.join(ui5HomeDir, "framework", "staging");
	}

	async readJson(jsonPath) {
		return JSON.parse(await readFile(jsonPath, {encoding: "utf8"}));
	}

	async fetchPackageVersions({pkgName}) {
		const packument = await this._registry.requestPackagePackument(pkgName);
		return Object.keys(packument.versions);
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
				const manifest = await this._registry.requestPackageManifest(pkgName, version);
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
			await this._synchronize({pkgName, version}, async () => {
				// check again whether package is now installed
				const installed = await this._packageJsonExists(targetDir);
				if (!installed) {
					const stagingDir = this._getStagingDirForPackage({pkgName, version});
					log.info(`Installing missing package ${pkgName}...`);

					// Check whether staging dir already exists and remove it
					if (await this._pathExists(stagingDir)) {
						const rimraf = promisify(require("rimraf"));
						log.verbose(`Removing existing staging directory at ${stagingDir}...`);
						await rimraf(stagingDir);
					}

					// Check whether target dir already exists and remove it.
					// A target directory already existing but missing a package.json should
					// never happen. However, we want to be *really* sure that there is no target
					// directory so that the rename operation won't have any no trouble.
					if (await this._pathExists(targetDir)) {
						const rimraf = promisify(require("rimraf"));
						log.verbose(`Removing existing target directory at ${targetDir}...`);
						await rimraf(targetDir);
					}

					log.verbose(`Installing ${pkgName} in version ${version} to ${stagingDir}...`);
					await this._registry.extractPackage(pkgName, version, stagingDir);

					// Do not create target dir itself to prevent EPERM error in following rename operation
					// (https://github.com/SAP/ui5-tooling/issues/487)
					await mkdirp(path.dirname(targetDir));
					log.verbose(`Promoting staging directory from ${stagingDir} to ${targetDir}...`);
					await rename(stagingDir, targetDir);
				} else {
					log.verbose(`Alrady installed: ${pkgName} in version ${version}`);
				}
			});
		} else {
			log.verbose(`Alrady installed: ${pkgName} in version ${version}`);
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

	async _synchronize({pkgName, version}, callback) {
		const lockPath = this._getLockPath({pkgName, version});
		await mkdirp(this._lockDir);
		log.verbose("Locking " + lockPath);
		await lock(lockPath, {
			wait: 10000,
			stale: 60000,
			retries: 10
		});
		try {
			await callback();
		} finally {
			log.verbose("Unlocking " + lockPath);
			await unlock(lockPath);
		}
	}

	_getLockPath({pkgName, version}) {
		const lockName = pkgName.replace(/\//g, "-");
		return path.join(this._lockDir, `package-${lockName}@${version}.lock`);
	}

	_getTargetDirForPackage({pkgName, version}) {
		return path.join(this._packagesDir, ...pkgName.split("/"), version);
	}

	_getStagingDirForPackage({pkgName, version}) {
		return path.join(this._stagingDir, `${pkgName.replace("/", "-")}-${version}`);
	}
}

module.exports = Installer;
