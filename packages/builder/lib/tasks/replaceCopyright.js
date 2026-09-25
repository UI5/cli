import stringReplacer from "../processors/stringReplacer.js";

/**
 * @public
 * @module @ui5/builder/tasks/replaceCopyright
 */

/**
 * Task to to replace the copyright.
 *
 * The following placeholders are replaced with corresponding values:
 * <ul>
 * 	<li>${copyright}</li>
 * 	<li>@copyright@</li>
 * </ul>
 *
 * If the copyright string contains the optional placeholder ${currentYear}
 * it will be replaced with the current year.
 * If no copyright string is given, no replacement is being done.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {string[]} [parameters.changedProjectResourcePaths] Set of changed resource paths within the project.
 * This is only set if a cache is used and changes have been detected.
 * @param {object} parameters.options Options
 * @param {string} parameters.options.copyright Replacement copyright
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, changedProjectResourcePaths, options: {copyright, pattern}}) {
	if (!copyright) {
		return;
	}

	// Read the current year through taskUtil.getTime so the incremental build cache tracks it as a
	// task input: a cached result then re-runs when the calendar year rolls over. Fall back to a
	// direct Date read when the task runs without a TaskUtil.
	const currentYear = taskUtil?.getTime ? taskUtil.getTime("year") : new Date().getFullYear();

	// Replace optional placeholder ${currentYear} with the current year
	copyright = copyright.replace(/(?:\$\{currentYear\})/, currentYear);

	let resources;
	if (changedProjectResourcePaths) {
		resources = await Promise.all(changedProjectResourcePaths.map((resource) => workspace.byPath(resource)));
	} else {
		resources = await workspace.byGlob(pattern);
	}

	const processedResources = await stringReplacer({
		resources,
		options: {
			pattern: /(?:\$\{copyright\}|@copyright@)/g,
			replacement: copyright
		}
	});
	return Promise.all(processedResources.map((resource) => {
		if (resource) {
			return workspace.write(resource);
		}
	}));
}
