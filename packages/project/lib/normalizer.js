const log = require("@ui5/logger").getLogger("normalizer:normalizer");
const projectPreprocessor = require("./projectPreprocessor");


/**
 * Generate project and dependency trees via translators.
 * Optionally configure all projects with the projectPreprocessor.
 *
 * @public
 * @namespace
 * @alias module:@ui5/project.normalizer
 */
const Normalizer = {
	/**
	 * Generates a project and dependency tree via translators and configures all projects via the projectPreprocessor
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.cwd] Current working directory
	 * @param {string} [options.configPath] Path to configuration file
	 * @param {string} [options.translatorName] Translator to use
	 * @param {object} [options.translatorOptions] Options to pass to translator
	 * @param {object} [options.frameworkOptions] Options to pass to the framework installer
	 * @param {string} [options.frameworkOptions.versionOverride] Framework version to use instead of the root projects
	 * framework
	 * @returns {Promise<object>} Promise resolving to tree object
	 */
	generateProjectTree: async function(options = {}) {
		let tree = await Normalizer.generateDependencyTree(options);

		if (options.configPath) {
			tree.configPath = options.configPath;
		}
		tree = await projectPreprocessor.processTree(tree);

		if (tree.framework) {
			const ui5Framework = require("./translators/ui5Framework");
			log.verbose(`Root project ${tree.metadata.name} defines framework ` +
				`configuration. Installing UI5 dependencies...`);
			let frameworkTree = await ui5Framework.generateDependencyTree(tree, options.frameworkOptions);
			if (frameworkTree) {
				frameworkTree = await projectPreprocessor.processTree(frameworkTree);
				ui5Framework.mergeTrees(tree, frameworkTree);
			}
		}
		return tree;
	},

	/**
	 * Generates a project and dependency tree via translators
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.cwd=.] Current working directory
	 * @param {string} [options.translatorName=npm] Translator to use
	 * @param {object} [options.translatorOptions] Options to pass to translator
	 * @returns {Promise<object>} Promise resolving to tree object
	 */
	generateDependencyTree: async function({cwd = ".", translatorName="npm", translatorOptions={}} = {}) {
		log.verbose("Building dependency tree...");

		let translatorParams = [];
		let translator = translatorName;
		if (translatorName.indexOf(":") !== -1) {
			translatorParams = translatorName.split(":");
			translator = translatorParams[0];
			translatorParams = translatorParams.slice(1);
		}

		let translatorModule;
		switch (translator) {
		case "static":
			translatorModule = require("./translators/static");
			break;
		case "npm":
			translatorModule = require("./translators/npm");
			break;
		default:
			return Promise.reject(new Error(`Unknown translator ${translator}`));
		}

		translatorOptions.parameters = translatorParams;
		return translatorModule.generateDependencyTree(cwd, translatorOptions);
	}
};

module.exports = Normalizer;
