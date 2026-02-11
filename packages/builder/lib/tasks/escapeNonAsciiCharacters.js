import nonAsciiEscaper from "../processors/nonAsciiEscaper.js";

/**
 * @public
 * @module @ui5/builder/tasks/escapeNonAsciiCharacters
 */

/**
 * Task to escape non ascii characters in properties files resources.
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
 * @param {string} parameters.options.pattern Glob pattern to locate the files to be processed
 * @param {string} parameters.options.encoding source file encoding either "UTF-8" or "ISO-8859-1"
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, changedProjectResourcePaths, options: {pattern, encoding}}) {
	if (!encoding) {
		throw new Error("[escapeNonAsciiCharacters] Mandatory option 'encoding' not provided");
	}

	let allResources;
	if (changedProjectResourcePaths) {
		allResources = await Promise.all(changedProjectResourcePaths.map((resource) => workspace.byPath(resource)));
	} else {
		allResources = await workspace.byGlob(pattern);
	}

	const processedResources = await nonAsciiEscaper({
		resources: allResources,
		options: {
			encoding: nonAsciiEscaper.getEncodingFromAlias(encoding)
		}
	});

	await Promise.all(processedResources.map((resource) => resource && workspace.write(resource)));
}
