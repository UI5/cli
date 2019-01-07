/**
 * Wraps readers to access them like a node fs-interface.
 *
 * @public
 * @module @ui5/fs/fsInterface
 * @param {AbstractReader} reader Resource Reader or Collection
 * @returns {Object} Object with wrapped fs functions
 */
const fsInterface = (reader) => {
	return {
		readFile(path, options, callback) {
			if (typeof options === "function") {
				callback = options;
				options = undefined;
			}
			if (typeof options === "string") {
				options = {encoding: options};
			}
			reader.byPath(path, {
				nodir: false
			}).then(function(resource) {
				if (!resource) {
					const error = new Error();
					error.code = "ENOENT"; // "File or directory does not exist"
					callback(error);
					return;
				}

				return resource.getBuffer().then(function(buffer) {
					let res;

					if (options && options.encoding) {
						res = buffer.toString(options.encoding);
					} else {
						res = buffer;
					}

					callback(null, res);
				});
			}).catch(callback);
		},
		stat(path, callback) {
			reader.byPath(path, {
				nodir: false
			}).then(function(resource) {
				if (!resource) {
					const error = new Error();
					error.code = "ENOENT"; // "File or directory does not exist"
					callback(error);
				} else {
					callback(null, resource.getStatInfo());
				}
			}).catch(callback);
		},
		readdir(path, callback) {
			if (!path.match(/\/$/)) {
				// Add trailing slash if not present
				path += "/";
			}
			reader.byGlob(path + "*", {
				nodir: false
			}).then((resources) => {
				const files = resources.map((resource) => {
					return resource._name;
				});
				callback(null, files);
			}).catch(callback);
		}
	};
};

module.exports = fsInterface;
