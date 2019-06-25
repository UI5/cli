/**
 * @module module:@ui5/project
 * @public
 */
const modules = {
	normalizer: "./lib/normalizer",
	projectPreprocessor: "./lib/projectPreprocessor",
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
		"npm": "./lib/translators/npm",
		"static": "./lib/translators/static"
	}
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName in modulePaths) {
		if (modulePaths.hasOwnProperty(moduleName)) {
			if (typeof modulePaths[moduleName] === "object") {
				exportRoot[moduleName] = {};
				exportModules(exportRoot[moduleName], modulePaths[moduleName]);
			} else {
				Object.defineProperty(exportRoot, moduleName, {
					get() {
						return require(modulePaths[moduleName]);
					}
				});
			}
		}
	}
}

exportModules(module.exports, modules);
