/**
 * @module module:@ui5/project
 * @public
 */
module.exports = {
	normalizer: require("./lib/normalizer"),
	projectPreprocessor: require("./lib/projectPreprocessor"),
	/**
	 * @public
	 * @see module:@ui5/project.ui5Framework
	 * @namespace
	 */
	ui5Framework: {
		Openui5Resolver: require("./lib/ui5Framework/Openui5Resolver"),
		Sapui5Resolver: require("./lib/ui5Framework/Sapui5Resolver")
	},
	/**
	 * @public
	 * @see module:@ui5/project.validation
	 * @namespace
	 */
	validation: {
		validator: require("./lib/validation/validator"),
		ValidationError: require("./lib/validation/ValidationError")
	},
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
