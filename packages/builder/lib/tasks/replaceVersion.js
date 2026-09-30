import stringReplacer from "../processors/stringReplacer.js";

/**
 * @public
 * @module @ui5/builder/tasks/replaceVersion
 */

/**
 * Task to replace the version <code>${version}</code>.
 *
 * A step-based task: the default export is a factory returning one map step with a key per matched
 * resource, so a delta build re-processes only the resources whose content changed. The replacement is
 * a step's only input, and a resource key is content-addressed, so a changed resource is a new key that
 * re-runs and any removed resource drops its stale output.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.pattern Pattern to locate the files to be processed
 * @param {string} options.version Replacement version
 * @returns {object[]} The task's build steps
 */
export default function build({pattern, version}) {
	const replacerOptions = {
		pattern: /\$\{(?:project\.)?version\}/g,
		replacement: version
	};

	return [{
		name: "replaceVersion",
		// One key per matched resource, so a delta build re-processes only the resources that changed.
		keys: async ({workspace}) => workspace.byGlob(pattern),
		each: async (resource, {workspace}) => {
			const [processed] = await stringReplacer({resources: [resource], options: replacerOptions});
			if (processed) {
				await workspace.write(processed);
			}
		},
	}];
}
