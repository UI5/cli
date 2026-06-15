import path from "node:path";
import Extension from "../Extension.js";
import {pathToFileURL} from "node:url";

/**
 * Task
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/extensions/Task
 * @extends @ui5/project/specifications/Extension
 * @hideconstructor
 */
class Task extends Extension {
	constructor(parameters) {
		super(parameters);
	}

	/* === Attributes === */
	/**
	* @public
	*/
	async getTask() {
		return (await this._getImplementation()).default;
	}

	/**
	* @public
	*/
	async getRequiredDependenciesCallback() {
		return (await this._getImplementation()).determineRequiredDependencies;
	}

	/**
	* @public
	*/
	async getDetermineBuildSignatureCallback() {
		return (await this._getImplementation()).determineBuildSignature;
	}

	/**
	* @public
	*/
	async getSupportsDifferentialBuildsCallback() {
		return (await this._getImplementation()).supportsDifferentialBuilds;
	}

	/**
	* @public
	*/
	async getExpectedOutputCallback() {
		return (await this._getImplementation()).determineExpectedOutput;
	}

	/* === Internals === */
	/**
	 * @private
	*/
	async _getImplementation() {
		if (!this._modulePromise) {
			const taskPath = path.join(this.getRootPath(), this._config.task.path);
			this._modulePromise = import(pathToFileURL(taskPath).href);
		}
		return this._modulePromise;
	}

	/**
	 * @private
	*/
	async _validateConfig() {
		// TODO: Move to validator
		if (/--\d+$/.test(this.getName())) {
			throw new Error(`Task name must not end with '--<number>'`);
		}
		// TODO: Check that paths exist
	}
}

export default Task;
