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
	 * @param {Object} [options]
	 * @param {string} [options.cwd] Current working directory
	 * @param {string} [options.configPath] Path to configuration file
	 * @param {string} [options.translatorName] Translator to use
	 * @param {Object} [options.translatorOptions] Options to pass to translator
	 * @returns {Promise<Object>} Promise resolving to tree object
	 */
	generateProjectTree: async function(options = {}) {
		const tree = await Normalizer.generateDependencyTree(options);

		if (options.configPath) {
			tree.configPath = options.configPath;
		}
		return projectPreprocessor.processTree(tree);
	},

	/**
	 * Generates a project and dependency tree via translators
	 *
	 * @public
	 * @param {Object} [options]
	 * @param {string} [options.cwd=.] Current working directory
	 * @param {string} [options.translatorName=npm] Translator to use
	 * @param {Object} [options.translatorOptions] Options to pass to translator
	 * @returns {Promise<Object>} Promise resolving to tree object
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
