const ui5Project = {
	normalizer: require("./lib/normalizer"),
	projectPreprocessor: require("./lib/projectPreprocessor"),
	translators: {
		"npm": require("./lib/translators/npm"),
		"static": require("./lib/translators/static")
	}
};

module.exports = ui5Project;
