const minifier = require("../processors/minifier");

/**
 * Task to minify resources.
 *
 * @public
 * @alias module:@ui5/builder.tasks.minify
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/builder.tasks.TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, taskUtil, options: {pattern}}) {
	const resources = await workspace.byGlob(pattern);
	const processedResources = await minifier({resources});

	return Promise.all(processedResources.map(async ({resource, dbgResource, sourceMapResource}) => {
		if (taskUtil) {
			taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.HasDebugVariant);
			taskUtil.setTag(dbgResource, taskUtil.STANDARD_TAGS.IsDebugVariant);
		}
		return Promise.all([
			workspace.write(resource),
			workspace.write(dbgResource),
			workspace.write(sourceMapResource)
		]);
	}));
};
