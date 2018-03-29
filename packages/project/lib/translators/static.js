const path = require("path");
const fs = require("graceful-fs");
const parseYaml = require("js-yaml").safeLoad;

/**
 * Translator for static resources
 *
 * @module normalizer/translators/static
 */

/**
 * Generates a dependency tree from static resources
 *
 * This feature is <b>EXPERIMENTAL</b> and used for testing purposes only.
 *
 * @param {string} dirPath Project path
 * @param {Array} [translatorOptions] Configuration options
 * @returns {Promise} Promise resolving with a dependency tree
 */
function generateDependencyTree(dirPath, translatorOptions) {
	const depFilePath = translatorOptions[0] || path.join(dirPath, "projectDependencies.yaml");

	return new Promise(function(resolve, reject) {
		fs.readFile(depFilePath, function(err, buffer) {
			if (err) {
				reject(err);
			} else {
				resolve(parseYaml(buffer.toString(), {
					filename: depFilePath
				}));
			}
		});
	});
}

module.exports = {
	generateDependencyTree: generateDependencyTree
};
