const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
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
		this._baseDir = path.join(ui5HomeDir, "framework", "packages");
		log.verbose(`Installing to: ${this._baseDir}`);
		this._registry = new Registry({
			cwd,
			cacheDir: path.join(ui5HomeDir, "framework", "cacache")
		});
		this._lockDir = path.join(ui5HomeDir, "framework", "locks");
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
					log.info(`Installing missing package ${pkgName}...`);
					log.verbose(`Installing ${pkgName} in version ${version} to ${targetDir}...`);
					await this._registry.extractPackage(pkgName, version, targetDir);
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
		try {
			await stat(path.join(targetDir, "package.json"));
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
		return path.join(this._baseDir, ...pkgName.split("/"), version);
	}
}

module.exports = Installer;
