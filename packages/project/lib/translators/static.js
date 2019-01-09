const path = require("path");
const fs = require("graceful-fs");
const parseYaml = require("js-yaml").safeLoad;

/**
 * Translator for static resources
 *
 * @private
 * @namespace
 * @alias module:@ui5/project.translators.static
 */
module.exports = {
	/**
	 * Generates a dependency tree from static resources
	 *
	 * This feature is <b>EXPERIMENTAL</b> and used for testing purposes only.
	 *
	 * @public
	 * @param {string} dirPath Project path
	 * @param {Object} [options]
	 * @param {Array} [options.parameters] CLI configuration options
	 * @returns {Promise} Promise resolving with a dependency tree
	 */
	generateDependencyTree(dirPath, options = {}) {
		const depFilePath = options.parameters && options.parameters[0] ||
								path.join(dirPath, "projectDependencies.yaml");

		return new Promise(function(resolve, reject) {
			fs.readFile(depFilePath, function(err, buffer) {
				if (err) {
					reject(new Error(
						`[static translator] Failed to locate projectDependencies.json at path: "${dirPath}" `+
						`- Error: ${err.message}`));
				} else {
					resolve(parseYaml(buffer.toString(), {
						filename: depFilePath
					}));
				}
			});
		});
	}
};
