const uglifyProcessor = require("../processors/uglifier");

/**
 * Task to minify resources.
 *
 * @module builder/tasks/uglify
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, options}) {
	return workspace.byGlobSource(options.pattern)
		.then((allResources) => {
			return uglifyProcessor({
				resources: allResources
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource);
			}));
		});
};
