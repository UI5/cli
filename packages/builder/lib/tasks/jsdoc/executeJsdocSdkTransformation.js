const log = require("@ui5/logger").getLogger("builder:tasks:jsdoc:executeJsdocSdkTransformation");
const ReaderCollectionPrioritized = require("@ui5/fs").ReaderCollectionPrioritized;
const fsInterface = require("@ui5/fs").fsInterface;
const sdkTransformer = require("../../processors/jsdoc/sdkTransformer");

/**
 * Task to transform the api.json file as created by the
 * [generateJsdoc]{@link module:@ui5/builder.tasks.generateJsdoc} task into a pre-processed api.json
 * file suitable for the SDK.
 *
 * @public
 * @alias module:@ui5/builder.tasks.executeJsdocSdkTransformation
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.options Options
 * @param {string|Array} parameters.options.dotLibraryPattern Pattern to locate the .library resource to be processed
 * @param {string} parameters.options.projectName Project name
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
const executeJsdocSdkTransformation = async function(
	{workspace, dependencies, options: {projectName, dotLibraryPattern}} = {}
) {
	if (!projectName || !dotLibraryPattern) {
		throw new Error("[executeJsdocSdkTransformation]: One or more mandatory options not provided");
	}

	const [apiJsons, dotLibraries, depApiJsons] = await Promise.all([
		workspace.byGlob("/test-resources/**/designtime/api.json"),
		workspace.byGlob(dotLibraryPattern),
		dependencies.byGlob("/test-resources/**/designtime/api.json")
	]);
	if (!apiJsons.length) {
		log.info(`Failed to locate api.json resource for project ${projectName}. ` +
			`Skipping SDK Transformation...`);
		return;
	} else if (apiJsons.length > 1) {
		throw new Error(`[executeJsdocSdkTransformation]: Found more than one api.json resources for project ` +
			`${projectName}.`);
	}
	if (!dotLibraries.length) {
		throw new Error(`[executeJsdocSdkTransformation]: Failed to locate .library resource for project ` +
			`${projectName}.`);
	} else if (dotLibraries.length > 1) {
		throw new Error(`[executeJsdocSdkTransformation]: Found more than one .library resources for project ` +
			`${projectName}.`);
	}

	const combo = new ReaderCollectionPrioritized({
		name: `executeJsdocSdkTransformation - custom workspace + dependencies FS: ${projectName}`,
		readers: [workspace, dependencies]
	});

	const apiJsonPath = apiJsons[0].getPath();
	const dotLibraryPath = dotLibraries[0].getPath();
	const dependencyApiJsonPaths = depApiJsons.map((res) => {
		return res.getPath();
	});

	// Target path is typically "/test-resources/${options.namespace}/designtime/apiref/api.json"
	const targetApiJsonPath = apiJsonPath.replace(/\/api\.json$/i, "/apiref/api.json");

	const createdResources = await sdkTransformer({
		apiJsonPath,
		dotLibraryPath,
		dependencyApiJsonPaths,
		targetApiJsonPath,
		fs: fsInterface(combo)
	});

	await Promise.all(createdResources.map((resource) => {
		return workspace.write(resource);
	}));
};

module.exports = executeJsdocSdkTransformation;
