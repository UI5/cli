const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateFlexChangesBundle");
const flexChangesBundler = require("../../processors/bundlers/flexChangesBundler");

/**
 * Task to create changesBundle.json file containing all changes stored in the /changes folder for easier consumption at runtime.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateFlexChangesBundle
 * @param {Object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Object} [parameters.options] Options
 * @param {string} [parameters.options.namespace] Application Namespace
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, options}) {
	// Use the given namespace if available, otherwise use no namespace
	// (e.g. in case no manifest.json is present)
	let pathPrefix = "";
	if (options && options.namespace) {
		pathPrefix = `/resources/${options.namespace}`;
	}

	log.verbose("Collecting flexibility changes");
	return workspace.byGlob(`${pathPrefix}/changes/*.change`)
		.then((allResources) => {
			return flexChangesBundler({
				resources: allResources,
				options: {
					namespace: options.namespace,
					pathPrefix: pathPrefix
				}
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				log.verbose("Writing flexibility changes bundle");
				return workspace.write(resource);
			}));
		});
};
