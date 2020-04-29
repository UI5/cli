const fs = require("graceful-fs");

/**
 * Base class for the formatter implementation of a project type.
 *
 * @abstract
 */
class AbstractFormatter {
	/**
	 * Constructor
	 *
	 * @param {object} parameters
	 * @param {object} parameters.project Project
	 */
	constructor({project}) {
		if (new.target === AbstractFormatter) {
			throw new TypeError("Class 'AbstractFormatter' is abstract");
		}
		this._project = project;
	}

	/**
	 * Formats and validates the project
	 *
	 * @returns {Promise}
	 */
	format() {
		throw new Error("AbstractFormatter: Function format Not implemented");
	}

	/**
	 * Validates the project
	 *
	 * @returns {Promise} resolves if successfully validated
	 * @throws {Error} if validation fails
	 */
	validate() {
		throw new Error("AbstractFormatter: Function validate Not implemented");
	}

	/**
	 * Checks whether or not the given input is a directory on the file system.
	 *
	 * @param {string} dirPath directory
	 * @returns {Promise<boolean>} whether or not the given directory exists.
	 * <code>true</code> directory exists
	 * <code>false</code> directory does not exist
	 */
	dirExists(dirPath) {
		return new Promise((resolve, reject) => {
			fs.stat(dirPath, (err, stats) => {
				if (err) {
					if (err.code === "ENOENT") { // "File or directory does not exist"
						resolve(false);
					} else {
						reject(err);
					}
				} else {
					resolve(stats.isDirectory());
				}
			});
		});
	}
}

module.exports = AbstractFormatter;
