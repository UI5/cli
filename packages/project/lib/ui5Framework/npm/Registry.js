const log = require("@ui5/logger").getLogger("normalizer:ui5Framework:npm:Registry");

function logConfig(config, configName) {
	const configValue = config[configName];
	if (configValue) {
		log.verbose(`   ${configName}: ${configValue}`);
	}
}

class Registry {
	constructor({cwd, cacheDir}) {
		this._pacote = require("pacote");
		this._cwd = cwd;
		this._cacheDir = cacheDir;
	}
	requestPackageManifest(pkgName, version) {
		return this._pacote.manifest(`${pkgName}@${version}`, this._getPacoteOptions());
	}
	extractPackage(pkgName, version, targetDir) {
		return this._pacote.extract(`${pkgName}@${version}`, targetDir, this._getPacoteOptions());
	}
	_getPacoteOptions() {
		if (!this._npmConfig) {
			const libnpmconfig = require("libnpmconfig");
			const opts = {
				cache: this._cacheDir
			};
			if (log.isLevelEnabled("verbose")) {
				opts.log = log._getLogger();
			}
			const config = libnpmconfig.read(opts, {
				cwd: this._cwd
			}).toJSON();

			log.verbose(`Using npm configuration (extract):`);
			// Do not log full configuration as it may contain authentication tokens
			logConfig(config, "registry");
			logConfig(config, "@sapui5:registry");
			logConfig(config, "@openui5:registry");
			logConfig(config, "proxy");
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

module.exports = Registry;
