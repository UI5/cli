import stringReplacer from "../processors/stringReplacer.js";

/**
 * @public
 * @module @ui5/builder/tasks/replaceVersion
 */

/**
 * Task to replace the version <code>${version}</code>.
 *
 * Each matched resource is processed as its own cached step via
 * [taskUtil.processEach]{@link @ui5/project/build/helpers/TaskUtil#processEach}, so a delta build
 * re-processes only the resources whose content changed. The replacement is a step's only input, and a
 * resource key is content-addressed, so a changed resource is a new key that re-runs and any removed
 * resource drops its stale output.
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
 * @param {string} parameters.options.version Replacement version
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, options: {pattern, version}}) {
	const resources = await workspace.byGlob(pattern);

	const replacerOptions = {
		pattern: /\$\{(?:project\.)?version\}/g,
		replacement: version
	};

	if (taskUtil?.processEach) {
		// One cached step per resource, so a delta build re-processes only the resources that changed.
		await taskUtil.processEach("replaceVersion", resources, async (resource, {workspace}) => {
			const [processed] = await stringReplacer({resources: [resource], options: replacerOptions});
			if (processed) {
				await workspace.write(processed);
			}
		});
		return;
	}

	// Standalone use without the build cache (e.g. a direct task invocation): replace in one batch.
	const processedResources = await stringReplacer({resources, options: replacerOptions});
	await Promise.all(processedResources.map((resource) => {
		if (resource) {
			return workspace.write(resource);
		}
	}));
}
