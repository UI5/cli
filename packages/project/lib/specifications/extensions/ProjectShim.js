import Extension from "../Extension.js";

/**
 * ProjectShim
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/extensions/ProjectShim
 * @extends @ui5/project/specifications/Extension
 * @hideconstructor
 */
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
			const {
				default: path
			} = await import("path");
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

export default ProjectShim;
