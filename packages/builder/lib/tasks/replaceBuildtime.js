import stringReplacer from "../processors/stringReplacer.js";

function pad(v) {
	return String(v).padStart(2, "0");
}
function getTimestamp() {
	const date = new Date();
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	// yyyyMMdd-HHmm
	return year + month + day + "-" + hours + minutes;
}

/**
 * @public
 * @module @ui5/builder/tasks/replaceBuildtime
 */

/**
 * Task to replace the buildtime <code>${buildtime}</code>.
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
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, changedProjectResourcePaths, options: {pattern}}) {
	let resources;
	if (changedProjectResourcePaths) {
		resources = await Promise.all(changedProjectResourcePaths.map((resource) => workspace.byPath(resource)));
	} else {
		resources = await workspace.byGlob(pattern);
	}
	const timestamp = getTimestamp();
	const processedResources = await stringReplacer({
		resources,
		options: {
			pattern: "${buildtime}",
			replacement: timestamp
		}
	});
	return Promise.all(processedResources.map((resource) => {
		if (resource) {
			return workspace.write(resource);
		}
	}));
}
