const manifestBundler = require("../../processors/bundlers/manifestBundler");
const DESCRIPTOR = "manifest.json";
const PROPERTIES_EXT = ".properties";
const BUNDLE_NAME = "manifest-bundle.zip";

/**
 * Task for manifestBundler.
 *
 * @public
 * @module @ui5/builder/tasks/bundlers/generateManifestBundle
 * @param {Object} parameters Parameters
 * @param {DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {Object} parameters.options Options
 * @param {string} parameters.options.namespace Namespace of the application
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = function({workspace, options}) {
	return workspace.byGlobSource(`/**/{${DESCRIPTOR},*${PROPERTIES_EXT}}`)
		.then((allResources) => {
			return manifestBundler({
				resources: allResources,
				options: {
					descriptor: DESCRIPTOR,
					propertiesExtension: PROPERTIES_EXT,
					bundleName: BUNDLE_NAME,
					namespace: options.namespace
				}
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource);
			}));
		});
};
