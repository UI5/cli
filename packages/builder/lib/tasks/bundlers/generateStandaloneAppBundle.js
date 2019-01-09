const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Task for bundling standalone applications.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateStandaloneAppBundle
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} parameters.options.namespace Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `appBundlerStandalone - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});
	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}")
		.then((resources) => {
			const isEvo = resources.find((resource) => {
				return resource.getPath() === "/resources/ui5loader.js";
			});
			let filters;
			if (isEvo) {
				filters = ["ui5loader-autoconfig.js"];
			} else {
				filters = ["jquery.sap.global.js"];
			}

			return moduleBundler({
				resources,
				options: {
					bundleDefinition: {
						name: "sap-ui-custom.js",
						defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
						sections: [
							{
								// include all 'raw' modules that are needed for the UI5 loader
								mode: "raw",
								filters,
								resolve: true, // dependencies for raw modules are taken from shims in .library files
								sort: true, // topological sort on raw modules is mandatory
								declareModules: false
							},
							{
								mode: "preload",
								filters: [
									`${options.namespace}/`,
									`!${options.namespace}/test/`,
									`!${options.namespace}/*.html`,
									"sap/ui/core/Core.js"
								],
								resolve: true,
								resolveConditional: true,
								renderer: true
							},
							// finally require and execute sap/ui/core/Core
							{
								mode: "require",
								filters: [
									"sap/ui/core/Core.js"
								]
							}
						]
					}
				}
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource);
			}));
		});
};
