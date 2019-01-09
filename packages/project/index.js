/**
 * @module module:@ui5/project
 * @public
 */
module.exports = {
	normalizer: require("./lib/normalizer"),
	projectPreprocessor: require("./lib/projectPreprocessor"),
	/**
	 * @private
	 * @see module:@ui5/project.translators
	 * @namespace
	 */
	translators: {
		"npm": require("./lib/translators/npm"),
		"static": require("./lib/translators/static")
	}
};
