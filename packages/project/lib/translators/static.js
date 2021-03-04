const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const parseYaml = require("js-yaml").load;

function resolveProjectPaths(project) {
	project.path = path.resolve(project.path);
	if (project.dependencies) {
		project.dependencies.forEach(resolveProjectPaths);
	}
	return project;
}

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
	 * @param {object} [options]
	 * @param {Array} [options.parameters] CLI configuration options
	 * @returns {Promise} Promise resolving with a dependency tree
	 */
	async generateDependencyTree(dirPath, options = {}) {
		const depFilePath = options.parameters && options.parameters[0] ||
								path.join(dirPath, "projectDependencies.yaml");
		try {
			const buffer = await readFile(depFilePath);
			const tree = parseYaml(buffer.toString(), {
				filename: depFilePath
			});

			// Ensure that all project paths are absolute
			resolveProjectPaths(tree);
			return tree;
		} catch (err) {
			throw new Error(
				`[static translator] Failed to load dependency tree from path ${depFilePath} `+
				`- Error: ${err.message}`);
		}
	}
};
