const path = require("path");
const Extension = require("../../Extension");

class Task extends Extension {
	constructor(parameters) {
		super(parameters);
	}

	/* === Attributes === */
	/**
	* @public
	*/
	getTask() {
		const taskPath = path.join(this.getPath(), this._config.task.path);
		return require(taskPath);
	}
	/* === Internals === */
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

module.exports = Task;
