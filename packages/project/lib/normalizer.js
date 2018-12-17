const log = require("@ui5/logger").getLogger("normalizer:normalizer");
const projectPreprocessor = require("./projectPreprocessor");


/**
 * Generate project and dependency trees via translators. Optionally configure all projects with the projectPreprocessor.
 *
 * @module normalizer/normalizer
 */
const Normalizer = {

	/**
	 * Generates a project and dependency tree via translators and configures all projects via the projectPreprocessor
	 *
	 * @param {Object} options Options
	 * @param {string} options.cwd Current working directory
	 * @param {string} options.configPath Path to configuration file
	 * @param {string} options.translator Translator to use
	 * @returns {Promise} Promise resolving to tree object
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
	 * @param {Object} options Options
	 * @param {string} options.cwd Current working directory
	 * @param {string} options.configPath Path to configuration file
	 * @param {string} options.translator Translator to use
	 * @returns {Promise} Promise resolving to tree object
	 */
	generateDependencyTree: async function(options = {}) {
		log.verbose("Building dependency tree...");
		const cwd = options && options.cwd || ".";

		let translatorName = "npm"; // Default is npm translator
		let translatorParams = [];
		if (options.translator) {
			const translatorOptions = options.translator.split(":");
			translatorName = translatorOptions[0];
			translatorParams = translatorOptions.slice(1);
		}

		let translator;
		switch (translatorName) {
		case "static":
			translator = require("./translators/static");
			break;
		case "npm":
			translator = require("./translators/npm");
			break;
		default:
			return Promise.reject(new Error(`Unknown translator ${translatorName}`));
		}

		return translator.generateDependencyTree(cwd, translatorParams);
	}
};

module.exports = Normalizer;
