module.exports = {
	getRootProjectConfiguration: async function({normalizerOptions}) {
		const {normalizer, projectPreprocessor} = require("@ui5/project");

		const tree = await normalizer.generateDependencyTree(normalizerOptions);

		if (normalizerOptions.configPath) {
			tree.configPath = normalizerOptions.configPath;
		}

		// Prevent dependencies from being processed
		tree.dependencies = [];

		return projectPreprocessor.processTree(tree);
	},
	getFrameworkResolver: function(frameworkName) {
		if (frameworkName === "SAPUI5") {
			return require("@ui5/project").ui5Framework.Sapui5Resolver;
		} else if (frameworkName === "OpenUI5") {
			return require("@ui5/project").ui5Framework.Openui5Resolver;
		} else {
			throw new Error("Invalid framework.name: " + frameworkName);
		}
	},
	isValidSpecVersion: function(specVersion) {
		return specVersion && (specVersion !== "0.1" && specVersion !== "1.0" && specVersion !== "1.1");
	}
};
