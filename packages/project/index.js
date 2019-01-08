/**
 * @module @ui5/project
 * @public
 */
module.exports = {
	/**
	 * @public
	 * @see @ui5/project.normalizer
	 */
	normalizer: require("./lib/normalizer"),
	/**
	 * @public
	 * @see @ui5/project.projectPreprocessor
	 */
	projectPreprocessor: require("./lib/projectPreprocessor"),
	translators: {
		"npm": require("./lib/translators/npm"),
		"static": require("./lib/translators/static")
	}
};
