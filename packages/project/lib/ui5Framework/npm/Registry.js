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
		if (this._pGetPacote) {
			return this._pGetPacote;
		}
		return this._pGetPacote = (async () => {
			return {
				pacote: (await import("pacote")).default,
				pacoteOptions: await this._getPacoteOptions()
			};
		})();
	}

	async _getPacoteOptions() {
		const {default: Config} = await import("@npmcli/config");
		const {
			default: {flatten, definitions, shorthands, defaults},
		} = await import("@npmcli/config/lib/definitions/index.js");

		const configuration = new Config({
			cwd: this._cwd,
			npmPath: this._cwd,
			definitions,
			flatten,
			shorthands,
			defaults
		});

		await configuration.load(); // Reads through the configurations
		const config = configuration.flat; // JSON. Formatted via "flatten"

		// Always use our cache dir instead of the configured one
		config.cache = this._cacheDir;

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

		return config;
	}
}

export default Registry;
