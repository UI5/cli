import {createResource} from "@ui5/fs/resourceFactory";
import transformer from "./lib/transformApiJson.js";

/**
 * @public
 * @module @ui5/builder/processors/jsdoc/sdkTransformer
 */

/**
 * Transform api.json as created by [jsdocGenerator]{@link @ui5/builder/processors/jsdoc/jsdocGenerator}
 * for usage in a UI5 SDK
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {string} parameters.apiJsonPath Path to the projects api.json file as created by
 *				[jsdocGenerator]{@link @ui5/builder/processors/jsdoc/jsdocGenerator}
 * @param {string} parameters.dotLibraryPath Path to the projects .library file
 * @param {string[]} parameters.dependencyApiJsonPaths List of paths to the api.json files of all dependencies of
 *				the project as created by [jsdocGenerator]{@link @ui5/builder/processors/jsdoc/jsdocGenerator}
 * @param {string} parameters.targetApiJsonPath Path to create the new, transformed api.json resource for
 * @param {fs|module:@ui5/fs/fsInterface} parameters.fs Node fs or
 * 				custom [fs interface]{@link module:@ui5/fs/fsInterface} to use
 *
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with created resources
 */
const sdkTransformer = async function({
	apiJsonPath, dotLibraryPath, dependencyApiJsonPaths, targetApiJsonPath, fs} = {}
) {
	if (!apiJsonPath || !dotLibraryPath || !targetApiJsonPath || !dependencyApiJsonPaths || !fs) {
		throw new Error("[sdkTransformer]: One or more mandatory parameters not provided");
	}
	const fakeTargetPath = "/ignore/this/path/resource/will/be/returned";
	const apiJsonContent = await transformer(apiJsonPath, fakeTargetPath, dotLibraryPath, dependencyApiJsonPaths, "", {
		fs,
		returnOutputFiles: true
	});
	return [createResource({
		path: targetApiJsonPath,
		string: apiJsonContent
	})];
};

export default sdkTransformer;
