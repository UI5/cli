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
 * @param {object} [options]
 * @param {Array} [options.parameters] CLI configuration options
 * @returns {Promise} Promise resolving with a dependency tree
 */
function generateDependencyTree(dirPath, options = {}) {
	// TODO NEXT MAJOR: "options" used to be the the parameters array. We check for that here to stay compatible:
	const parameters = Array.isArray(options) ? options : options.parameters;
	const depFilePath = parameters && parameters[0] || path.join(dirPath, "projectDependencies.yaml");

	return new Promise(function(resolve, reject) {
		fs.readFile(depFilePath, function(err, buffer) {
			if (err) {
				reject(new Error(`[static translator] Failed to locate projectDependencies.json at path: "${dirPath}" - Error: ${err.message}`));
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
