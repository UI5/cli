/**
 * @module module:@ui5/project
 * @public
 */
const modules = {
	normalizer: "./lib/normalizer",
	projectPreprocessor: "./lib/projectPreprocessor",
	/**
	 * @public
	 * @alias module:@ui5/project.ui5Framework
	 * @namespace
	 */
	ui5Framework: {
		Openui5Resolver: "./lib/ui5Framework/Openui5Resolver",
		Sapui5Resolver: "./lib/ui5Framework/Sapui5Resolver"
	},
	/**
	 * @public
	 * @alias module:@ui5/project.validation
	 * @namespace
	 */
	validation: {
		validator: "./lib/validation/validator",
		ValidationError: "./lib/validation/ValidationError"
	},
	/**
	 * @private
	 * @alias module:@ui5/project.translators
	 * @namespace
	 */
	translators: {
		npm: "./lib/translators/npm",
		static: "./lib/translators/static"
	}
};

function exportModules(exportRoot, modulePaths) {
	for (const moduleName of Object.keys(modulePaths)) {
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

exportModules(module.exports, modules);
