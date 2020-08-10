const log = require("@ui5/logger").getLogger("builder:tasks:bundlers:generateManifestBundle");
const manifestBundler = require("../../processors/bundlers/manifestBundler");
const DESCRIPTOR = "manifest.json";
const PROPERTIES_EXT = ".properties";
const BUNDLE_NAME = "manifest-bundle.zip";

/**
 *
 * @public
 * @typedef {object} ManifestBundlerOptions
 * @property {string} projectName Project Name
 * @property {string} namespace Namespace
 */

/**
 * Task for manifestBundler.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateManifestBundle
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {ManifestBundlerOptions} parameters.options Options
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, options = {}}) {
	const {projectName, namespace} = options;
	if (!projectName || !namespace) {
		throw new Error("[generateManifestBundle]: One or more mandatory options not provided");
	}

	const allResources = await workspace.byGlob(`/resources/${namespace}/**/{${DESCRIPTOR},*${PROPERTIES_EXT}}`);
	if (allResources.length === 0) {
		log.verbose(`Could not find a "${DESCRIPTOR}" file for project ${projectName}, ` +
			`creation of "${BUNDLE_NAME}" is skipped!`);
		return;
	}

	const processedResources = await manifestBundler({
		resources: allResources,
		options: {
			descriptor: DESCRIPTOR,
			propertiesExtension: PROPERTIES_EXT,
			bundleName: BUNDLE_NAME,
			namespace
		}
	});

	await Promise.all(processedResources.map((resource) => {
		return workspace.write(resource);
	}));
};
