const moduleBundler = require("../../processors/bundlers/moduleBundler");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;

/**
 * Generates a bundle based on the given bundle definition
 *
 * @public
 * @module @ui5/builder/tasks/bundlers/generateBundle
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Collection} parameters.dependencies Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {Object} parameters.options.bundleDefintion Module bundle definition
 * @param {Object} parameters.options.bundleOptions Module bundle options
 * @returns {Promise} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	const combo = new ReaderCollectionPrioritized({
		name: `libraryBundler - prioritize workspace over dependencies: ${options.projectName}`,
		readers: [workspace, dependencies]
	});

	return combo.byGlob("/resources/**/*.{js,json,xml,html,properties,library}").then((resources) => {
		return moduleBundler({
			options: {
				bundleDefinition: options.bundleDefinition,
				bundleOptions: options.bundleOptions
			},
			resources
		}).then((bundles) => {
			bundles.forEach((bundle) => {
				workspace.write(bundle);
			});
		});
	});
};
