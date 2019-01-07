const fs = require("graceful-fs");

/**
 * Base class for the formatter implementation of a project type.
 *
 * @abstract
 */
class AbstractFormatter {
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
