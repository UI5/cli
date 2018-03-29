const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Task to for application bundling.
 *
 * @module builder/tasks/bundlers/generateAppPreload
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.namespace Project namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `appBundler - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});
	return combo.byGlob("/**/*.{js,json,xml,html,properties,library}")
		.then((resources) => {
			return moduleBundler({
				resources,
				options: {
					bundleDefinition: {
						name: `${options.namespace}/Component-preload.js`,
						defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
						sections: [
							{
								mode: "preload",
								filters: [
									`${options.namespace}/`,
									`!${options.namespace}/test/`,
									`!${options.namespace}/*.html`
								],
								resolve: false,
								resolveConditional: false,
								renderer: false
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
