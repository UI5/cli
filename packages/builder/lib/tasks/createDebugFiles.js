const dbg = require("../processors/debugFileCreator");
const fsInterface = require("@ui5/fs").fsInterface;

/**
 * Task to create dbg files.
 *
 * @public
 * @module @ui5/builder/tasks/createDebugFiles
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Object} [parameters.options] Options
 * @param {string} [parameters.options.pattern] Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, options}) {
	let allResources;
	if (workspace.byGlobSource) { // API only available on duplex collections
		allResources = await workspace.byGlobSource(options.pattern);
	} else {
		allResources = await workspace.byGlob(options.pattern);
	}
	return dbg({
		fs: fsInterface(workspace),
		resources: allResources
	}).then((processedResources) => {
		return Promise.all(processedResources.map((resource) => {
			return workspace.write(resource);
		}));
	});
};
