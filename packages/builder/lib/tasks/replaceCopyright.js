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
 * @param {object} parameters.options Options
 * @param {string} parameters.options.copyright Replacement copyright
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default function({workspace, options: {copyright, pattern}}) {
	if (!copyright) {
		return Promise.resolve();
	}

	// Replace optional placeholder ${currentYear} with the current year
	copyright = copyright.replace(/(?:\$\{currentYear\})/, new Date().getFullYear());

	return workspace.byGlob(pattern)
		.then((processedResources) => {
			return stringReplacer({
				resources: processedResources,
				options: {
					pattern: /(?:\$\{copyright\}|@copyright@)/g,
					replacement: copyright
				}
			});
		})
		.then((processedResources) => {
			return Promise.all(processedResources.map((resource) => {
				return workspace.write(resource);
			}));
		});
}
