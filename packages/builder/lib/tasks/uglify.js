const uglifyProcessor = require("../processors/uglifier");

/**
 * Task to minify resources.
 *
 * @public
 * @alias module:@ui5/builder.tasks.uglify
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/builder.tasks.TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, taskUtil, options: {pattern}}) {
	return workspace.byGlobSource(pattern)
		.then((allResources) => {
			let resources = allResources;
			if (taskUtil) {
				resources = allResources.filter((resource) => {
					return !taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsBundle);
				});
			}
			return uglifyProcessor({
				resources
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource);
			}));
		});
};
