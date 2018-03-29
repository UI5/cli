const fs = require("graceful-fs");

/**
 * Base class for the formatter implementation of a project type.
 *
 * @abstract
 */
class AbstractFormatter {
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
