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
 * A step-based task: the default export is a factory returning one map step with a key per matched
 * resource, so a delta build re-processes only the resources whose content changed. Each step reads the
 * current year through [taskUtil.getTime]{@link @ui5/project/build/helpers/TaskUtil#getTime} so the
 * incremental build cache tracks it: a cached result re-runs when the calendar year rolls over. Without a
 * TaskUtil (e.g. a direct invocation) the step falls back to the wall clock.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.copyright Replacement copyright
 * @param {string} options.pattern Pattern to locate the files to be processed
 * @returns {object[]} The task's build steps
 */
export default function build({copyright, pattern}) {
	if (!copyright) {
		return [];
	}

	const replacePattern = /(?:\$\{copyright\}|@copyright@)/g;

	return [{
		name: "replaceCopyright",
		// One key per matched resource, so a delta build re-processes only the resources that changed.
		keys: async ({workspace}) => workspace.byGlob(pattern),
		each: async (resource, {workspace, taskUtil}) => {
			// Read the current year through taskUtil.getTime so the build cache tracks it as a step input:
			// a cached step then re-runs when the calendar year rolls over. Fall back to a direct Date read
			// when the task runs without a TaskUtil.
			const currentYear = taskUtil?.getTime ? taskUtil.getTime("year") : new Date().getFullYear();
			const replacement = copyright.replace(/(?:\$\{currentYear\})/, currentYear);

			const [processed] = await stringReplacer({
				resources: [resource],
				options: {pattern: replacePattern, replacement}
			});
			if (processed) {
				await workspace.write(processed);
			}
		},
	}];
}
