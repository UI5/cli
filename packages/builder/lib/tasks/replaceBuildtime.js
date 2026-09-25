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
 * Each matched resource is processed as its own cached step via
 * [taskUtil.processEach]{@link @ui5/project/build/helpers/TaskUtil#processEach}, so a delta build
 * re-processes only the resources whose content changed. The buildtime is read from the wall clock
 * once before the steps run and is not a tracked cache input, preserving the task's existing behavior:
 * a cached step keeps its previous timestamp until its resource content changes.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern to locate the files to be processed
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, options: {pattern}}) {
	const resources = await workspace.byGlob(pattern);
	const timestamp = getTimestamp();

	const replacerOptions = {
		pattern: "${buildtime}",
		replacement: timestamp
	};

	if (taskUtil?.processEach) {
		// One cached step per resource, so a delta build re-processes only the resources that changed.
		await taskUtil.processEach(resources, async (resource, {workspace}) => {
			const [processed] = await stringReplacer({resources: [resource], options: replacerOptions});
			if (processed) {
				await workspace.write(processed);
			}
		});
		return;
	}

	// Standalone use without the build cache (e.g. a direct task invocation): replace in one batch.
	const processedResources = await stringReplacer({resources, options: replacerOptions});
	return Promise.all(processedResources.map((resource) => {
		if (resource) {
			return workspace.write(resource);
		}
	}));
}
