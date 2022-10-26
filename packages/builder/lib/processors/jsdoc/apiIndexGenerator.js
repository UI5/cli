import {createResource} from "@ui5/fs/resourceFactory";
import createIndex from "./lib/createIndexFiles.cjs";

/**
 * @public
 * @module @ui5/builder/processors/jsdoc/apiIndexGenerator
 */

/**
 * Compiles API index resources from all <code>api.json</code> resources available in the given test resources directory
 * as created by the [sdkTransformer]{@link @ui5/builder/processors/sdkTransformer} processor.
 * The resulting index resources (e.g. <code>api-index.json</code>,  <code>api-index-deprecated.json</code>,
 * <code>api-index-experimental.json</code> and <code>api-index-since.json</code>) are mainly to be used in the SDK.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {string} parameters.versionInfoPath Path to <code>sap-ui-version.json</code> resource
 * @param {string} parameters.testResourcesRootPath Path to <code>/test-resources</code> root directory in the
 *														given fs
 * @param {string} parameters.targetApiIndexPath Path to create the generated API index JSON resource for
 * @param {string} parameters.targetApiIndexDeprecatedPath Path to create the generated API index "deprecated" JSON
 *															resource for
 * @param {string} parameters.targetApiIndexExperimentalPath Path to create the generated API index "experimental" JSON
 *																resource for
 * @param {string} parameters.targetApiIndexSincePath Path to create the generated API index "since" JSON resource for
 * @param {fs|module:@ui5/fs/fsInterface} parameters.fs Node fs or
 * 				custom [fs interface]{@link module:@ui5/fs/fsInterface} to use
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with created resources <code>api-index.json</code>,
 * <code>api-index-deprecated.json</code>, <code>api-index-experimental.json</code> and
 * <code>api-index-since.json</code> (names depend on the supplied paths)
 */
const apiIndexGenerator = async function({
	versionInfoPath, testResourcesRootPath, targetApiIndexPath, targetApiIndexDeprecatedPath,
	targetApiIndexExperimentalPath, targetApiIndexSincePath, fs
} = {}) {
	if (!versionInfoPath || !testResourcesRootPath || !targetApiIndexPath || !targetApiIndexDeprecatedPath ||
			!targetApiIndexExperimentalPath || !targetApiIndexSincePath || !fs) {
		throw new Error("[apiIndexGenerator]: One or more mandatory parameters not provided");
	}

	const resourceMap = await createIndex(versionInfoPath, testResourcesRootPath, targetApiIndexPath,
		targetApiIndexDeprecatedPath, targetApiIndexExperimentalPath, targetApiIndexSincePath, {
			fs,
			returnOutputFiles: true
		});

	return Object.keys(resourceMap).map((resPath) => {
		return createResource({
			path: resPath,
			string: resourceMap[resPath]
		});
	});
};

export default apiIndexGenerator;
