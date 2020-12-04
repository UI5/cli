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
}

module.exports = Task;
