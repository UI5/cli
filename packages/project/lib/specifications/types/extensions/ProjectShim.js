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
		return this._config.shims.dependencies || {};
	}

	/**
	* @public
	*/
	getConfigurationShims() {
		return this._config.shims.configurations || {};
	}

	/**
	* @public
	*/
	getCollectionShims() {
		return this._config.shims.collections || {};
	}

	/* === Internals === */
	/**
	 * @private
	*/
	async _validateConfig() {
		if (this._config.shims.collections) {
			const path = require("path");
			for (const dependencyDefinition of Object.values(this._config.shims.collections)) {
				Object.values(dependencyDefinition.modules).forEach((depPath) => {
					if (path.isAbsolute(depPath)) {
						throw new Error("All module paths of collections defined in a project-shim must be relative");
					}
				});
			}
		}
	}
}

module.exports = ProjectShim;
