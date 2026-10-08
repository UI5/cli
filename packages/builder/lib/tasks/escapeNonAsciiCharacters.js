import nonAsciiEscaper from "../processors/nonAsciiEscaper.js";

/**
 * @public
 * @module @ui5/builder/tasks/escapeNonAsciiCharacters
 */

/**
 * Task to escape non ascii characters in properties files resources.
 *
 * A step-based task: the default export is a factory returning one map step with a key per matched
 * resource, so a delta build re-processes only the resources whose content changed. Escaping is a step's
 * only input, and a resource key is content-addressed, so a changed resource is a new key that re-runs and
 * any removed resource drops its stale output.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.pattern Glob pattern to locate the files to be processed
 * @param {string} options.encoding source file encoding either "UTF-8" or "ISO-8859-1"
 * @returns {object[]} The task's build steps
 */
export default function build({pattern, encoding}) {
	if (!encoding) {
		throw new Error("[escapeNonAsciiCharacters] Mandatory option 'encoding' not provided");
	}

	const escaperOptions = {
		encoding: nonAsciiEscaper.getEncodingFromAlias(encoding)
	};

	return [{
		name: "escapeNonAsciiCharacters",
		// One key per matched resource, so a delta build re-processes only the resources that changed.
		keys: async ({workspace}) => workspace.byGlob(pattern),
		each: async (resource, {workspace}) => {
			const [processed] = await nonAsciiEscaper({resources: [resource], options: escaperOptions});
			if (processed) {
				await workspace.write(processed);
			}
		},
	}];
}
