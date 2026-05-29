import stringReplacer from "../processors/stringReplacer.js";

/**
 * @public
 * @module @ui5/builder/tasks/replaceVersion
 */

/**
 * Task to replace the version <code>${version}</code>.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {string[]} [parameters.changedProjectResourcePaths] Set of changed resource paths within the project.
 * This is only set if a cache is used and changes have been detected.
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @param {string} parameters.options.version Replacement version
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, changedProjectResourcePaths, options: {pattern, version}}) {
	let resources;
	if (changedProjectResourcePaths) {
		resources = await Promise.all(changedProjectResourcePaths.map((resource) => workspace.byPath(resource)));
	} else {
		resources = await workspace.byGlob(pattern);
	}
	const processedResources = await stringReplacer({
		resources,
		options: {
			pattern: /\$\{(?:project\.)?version\}/g,
			replacement: version
		}
	});
	await Promise.all(processedResources.map((resource) => {
		if (resource) {
			return workspace.write(resource);
		}
	}));
}
