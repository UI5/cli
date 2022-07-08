/**
 * @module module:@ui5/project
 * @public
 */
module.exports = {
	/**
	 * @type {import('./lib/generateProjectGraph')}
	 */
	generateProjectGraph: "./lib/generateProjectGraph",
	/**
	 * @public
	 * @alias module:@ui5/project.ui5Framework
	 * @namespace
	 */
	ui5Framework: {
		/**
		 * @type {typeof import('./lib/ui5Framework/Openui5Resolver')}
		 */
		Openui5Resolver: "./lib/ui5Framework/Openui5Resolver",
		/**
		 * @type {typeof import('./lib/ui5Framework/Sapui5Resolver')}
		 */
		Sapui5Resolver: "./lib/ui5Framework/Sapui5Resolver"
	},
	/**
	 * @public
	 * @alias module:@ui5/project.validation
	 * @namespace
	 */
	validation: {
		/**
		 * @type {import('./lib/validation/validator')}
		 */
		validator: "./lib/validation/validator",
		/**
		 * @type {typeof import('./lib/validation/ValidationError')}
		 */
		ValidationError: "./lib/validation/ValidationError"
	},
	/**
	 * @public
	 * @alias module:@ui5/project.graph
	 * @namespace
	 */
	graph: {
		/**
		 * @type {typeof import('./lib/graph/ProjectGraph')}
		 */
		ProjectGraph: "./lib/graph/ProjectGraph",
		/**
		 * @type {typeof import('./lib/graph/projectGraphBuilder')}
		 */
		projectGraphBuilder: "./lib/graph/projectGraphBuilder",
	},
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

exportModules(module.exports, JSON.parse(JSON.stringify(module.exports)));
