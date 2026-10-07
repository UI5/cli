import stringReplacer from "../processors/stringReplacer.js";

function pad(v) {
	return String(v).padStart(2, "0");
}
function formatTimestamp(date) {
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
 * A step-based task: the default export is a factory returning one map step with a key per matched
 * resource, so a delta build re-processes only the resources whose content changed. The buildtime comes
 * from the build run's shared timestamp via
 * [taskUtil.getBuildTime]{@link @ui5/project/build/helpers/TaskUtil#getBuildTime}, which is not a tracked
 * cache input: a cached step keeps its previous timestamp until its resource content changes. Without a
 * TaskUtil (e.g. a direct invocation) the step falls back to the wall clock.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.pattern Pattern to locate the files to be processed
 * @returns {object[]} The task's build steps
 */
export default function build({pattern}) {
	return [{
		name: "replaceBuildtime",
		// One key per matched resource, so a delta build re-processes only the resources that changed.
		keys: async ({workspace}) => workspace.byGlob(pattern),
		each: async (resource, {workspace, taskUtil}) => {
			// Source the timestamp from the build run's shared clock so every project and task in the run
			// agrees. Fall back to a direct Date read when the task runs without a TaskUtil.
			const timestamp = formatTimestamp(taskUtil?.getBuildTime ? taskUtil.getBuildTime() : new Date());
			const [processed] = await stringReplacer({
				resources: [resource],
				options: {pattern: "${buildtime}", replacement: timestamp}
			});
			if (processed) {
				await workspace.write(processed);
			}
		},
	}];
}
