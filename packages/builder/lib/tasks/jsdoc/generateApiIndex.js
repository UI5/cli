const ui5Fs = require("@ui5/fs");
const ReaderCollectionPrioritized = ui5Fs.ReaderCollectionPrioritized;
const fsInterface = ui5Fs.fsInterface;
const apiIndexGenerator = require("../../processors/jsdoc/apiIndexGenerator");

/**
 * Compiles an api-index.json resource from all available api.json resources as created by the
 * [executeJsdocSdkTransformation]{@link module:@ui5/builder.tasks.executeJsdocSdkTransformation} task.
 * The resulting api-index.json resource is mainly to be used in the SDK.
 *
 * @public
 * @alias module:@ui5/builder.tasks.generateApiIndex
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({
	workspace,
	dependencies,
	options: {projectName}
}) {
	const combo = new ReaderCollectionPrioritized({
		name: `generateApiIndex - workspace + dependencies: ${projectName}`,
		readers: [workspace, dependencies]
	});

	const versionInfoPath = "/resources/sap-ui-version.json";
	const testResourcesRootPath = "/test-resources";
	const targetApiIndexPath = "/docs/api/api-index.json";
	const targetApiIndexDeprecatedPath = "/docs/api/api-index-deprecated.json";
	const targetApiIndexExperimentalPath = "/docs/api/api-index-experimental.json";
	const targetApiIndexSincePath = "/docs/api/api-index-since.json";

	const createdResources = await apiIndexGenerator({
		versionInfoPath,
		testResourcesRootPath,
		targetApiIndexPath,
		targetApiIndexDeprecatedPath,
		targetApiIndexExperimentalPath,
		targetApiIndexSincePath,
		fs: fsInterface(combo),
	});

	await Promise.all(createdResources.map((resource) => {
		return workspace.write(resource);
	}));
};
