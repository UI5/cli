const resourceFactory = require("@ui5/fs").resourceFactory;

/**
 * Task to generate the application cachebuster info file.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateCachebusterInfo
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.namespace Namespace of the application
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, dependencies, options}) {
	return workspace.byGlob(`/resources/${options.namespace}/**/*`)
		.then(async (resources) => {
			const cachebusterInfo = {};
			const regex = new RegExp(`^/resources/${options.namespace}/`);
			resources.forEach((resource) => {
				const normalizedPath = resource.getPath().replace(regex, "");
				cachebusterInfo[normalizedPath] = resource.getStatInfo().mtime.getTime();
			});
			const cachebusterInfoResource = resourceFactory.createResource({
				path: `/resources/${options.namespace}/sap-ui-cachebuster-info.json`,
				string: JSON.stringify(cachebusterInfo, null, 2)
			});
			return workspace.write(cachebusterInfoResource);
		});
};
