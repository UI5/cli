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
 * @param {string[]} [parameters.changedProjectResourcePaths] Set of changed resource paths within the project.
 * This is only set if a cache is used and changes have been detected.
 * @param {object} parameters.options Options
 * @param {string} parameters.options.copyright Replacement copyright
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, changedProjectResourcePaths, options: {copyright, pattern}}) {
	if (!copyright) {
		return;
	}

	// Replace optional placeholder ${currentYear} with the current year
	copyright = copyright.replace(/(?:\$\{currentYear\})/, new Date().getFullYear());

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
