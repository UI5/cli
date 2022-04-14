const path = require("path");
const fs = require("graceful-fs");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);
const parseYaml = require("js-yaml").load;

function resolveProjectPaths(cwd, project) {
	project.path = path.resolve(cwd, project.path);
	if (project.dependencies) {
		project.dependencies.forEach((project) => resolveProjectPaths(cwd, project));
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
	 * @param {object} [options.tree] Tree object to be used instead of reading a YAML
	 * @returns {Promise} Promise resolving with a dependency tree
	 */
	async generateDependencyTree(dirPath, options = {}) {
		let tree = options.tree;
		if (!tree) {
			const depFilePath = options.parameters && options.parameters[0] ||
				path.join(dirPath, "projectDependencies.yaml");
			try {
				const contents = await readFile(depFilePath, {encoding: "utf-8"});
				tree = parseYaml(contents, {
					filename: depFilePath
				});
			} catch (err) {
				throw new Error(
					`[static translator] Failed to load dependency tree from path ${depFilePath} `+
					`- Error: ${err.message}`);
			}
		}

		// Ensure that all project paths are absolute
		resolveProjectPaths(dirPath, tree);
		return tree;
	}
};
