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
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @param {string} parameters.options.version Replacement version
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default function({workspace, options: {pattern, version}}) {
	return workspace.byGlob(pattern)
		.then((allResources) => {
			return stringReplacer({
				resources: allResources,
				options: {
					pattern: /\$\{(?:project\.)?version\}/g,
					replacement: version
				}
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource);
			}));
		});
}
