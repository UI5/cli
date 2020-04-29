const uglifyProcessor = require("../processors/uglifier");

/**
 * Task to minify resources.
 *
 * @public
 * @alias module:@ui5/builder.tasks.uglify
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {object} parameters.options Options
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
