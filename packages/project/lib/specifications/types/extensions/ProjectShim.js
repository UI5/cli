const Extension = require("../../Extension");

class ProjectShim extends Extension {
	constructor(parameters) {
		super(parameters);
	}


	/* === Attributes === */
	/**
	* @public
	*/
	getDependencyShims() {
		return this._config.shims.dependencies;
	}

	/**
	* @public
	*/
	getConfigurationShims() {
		return this._config.shims.configurations;
	}

	/**
	* @public
	*/
	getCollectionShims() {
		return this._config.shims.collections;
	}
}

module.exports = ProjectShim;
