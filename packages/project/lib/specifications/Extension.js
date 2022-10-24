import Specification from "./Specification.js";

/**
 * Extension
 *
 * @public
 * @abstract
 * @class
 * @alias @ui5/project/specifications/Extension
 * @extends @ui5/project/specifications/Specification
 * @hideconstructor
 */
class Extension extends Specification {
	constructor(parameters) {
		super(parameters);
		if (new.target === Extension) {
			throw new TypeError("Class 'Extension' is abstract. Please use one of the 'types' subclasses");
		}
	}

	/**
	 * @param {object} parameters Specification parameters
	 * @param {string} parameters.id Unique ID
	 * @param {string} parameters.version Version
	 * @param {string} parameters.modulePath File System path to access resources
	 * @param {object} parameters.configuration Configuration object
	 */
	async init(parameters) {
		await super.init(parameters);

		try {
			await this._validateConfig();
		} catch (err) {
			throw new Error(
				`Failed to validate configuration of ${this.getType()} extension ${this.getName()}: ` +
				err.message);
		}

		return this;
	}

	async _validateConfig() {}
}

export default Extension;
