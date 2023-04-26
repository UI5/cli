import {getLogger} from "@ui5/logger";
const log = getLogger("ui5Framework:npm:Registry");

function logConfig(config, configName) {
	const configValue = config[configName];
	if (configValue) {
		log.verbose(`   ${configName}: ${configValue}`);
	}
}

class Registry {
	/**
	 * @param {object} parameters Parameters
	 * @param {string} parameters.cwd Current working directory
	 * @param {string} parameters.cacheDir Cache directory
	 */
	constructor({cwd, cacheDir}) {
		if (!cwd) {
			throw new Error(`Registry: Missing parameter "cwd"`);
		}
		if (!cacheDir) {
			throw new Error(`Registry: Missing parameter "cacheDir"`);
		}
		this._cwd = cwd;
		this._cacheDir = cacheDir;
	}
	async requestPackagePackument(pkgName) {
		const {pacote, pacoteOptions} = await this._getPacote();
		return pacote.packument(pkgName, pacoteOptions);
	}
	async requestPackageManifest(pkgName, version) {
		const {pacote, pacoteOptions} = await this._getPacote();

		return pacote.manifest(`${pkgName}@${version}`, pacoteOptions);
	}
	async extractPackage(pkgName, version, targetDir) {
		const {pacote, pacoteOptions} = await this._getPacote();
		try {
			await pacote.extract(`${pkgName}@${version}`, targetDir, pacoteOptions);
		} catch (err) {
			throw new Error(`Failed to extract package ${pkgName}@${version}: ${err.message}`);
		}
	}
	async _getPacote() {
		return {
			pacote: (await import("pacote")).default,
			pacoteOptions: await this._getPacoteOptions()
		};
	}
	async _getPacoteOptions() {
		if (!this._npmConfig) {
			const {default: libnpmconfig} = await import("libnpmconfig");
			const opts = {
				cache: this._cacheDir,
			};
			const config = libnpmconfig.read(opts, {
				cwd: this._cwd
			}).toJSON();

			// Rename https-proxy to httpsProxy so that it is picked up by npm-registry-fetch (via pacote)
			if (config["https-proxy"]) {
				config.httpsProxy = config["https-proxy"];
				delete config["https-proxy"];
			}

			if (!config.proxy && !config.httpsProxy) {
				// Disable usage of shared keep-alive agents unless a proxy is configured
				// which only works with agents.

				// make-fetch-happen uses a hard-coded 15 seconds freeSocketTimeout
				// that can be easily reached (Error: Socket timeout) and there doesn't
				// seem to be another way to disable or increase it.
				// Also see: https://github.com/node-modules/agentkeepalive/issues/106
				config.agent = false;
			}

			log.verbose(`Using npm configuration (extract):`);
			// Do not log full configuration as it may contain authentication tokens
			logConfig(config, "registry");
			logConfig(config, "@sapui5:registry");
			logConfig(config, "@openui5:registry");
			logConfig(config, "proxy");
			logConfig(config, "httpsProxy");
			logConfig(config, "globalconfig");
			logConfig(config, "userconfig");
			logConfig(config, "cache");
			logConfig(config, "cwd");

			this._npmConfig = config;
		}

		// Use cached config
		return this._npmConfig;
	}
}

export default Registry;
