import nonAsciiEscaper from "../processors/nonAsciiEscaper.js";

/**
 * @public
 * @module @ui5/builder/tasks/escapeNonAsciiCharacters
 */

/**
 * Task to escape non ascii characters in properties files resources.
 *
 * Each matched resource is processed as its own cached step via
 * [taskUtil.processEach]{@link @ui5/project/build/helpers/TaskUtil#processEach}, so a delta build
 * re-processes only the resources whose content changed. Escaping is a step's only input, and a resource
 * key is content-addressed, so a changed resource is a new key that re-runs and any removed resource
 * drops its stale output.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Glob pattern to locate the files to be processed
 * @param {string} parameters.options.encoding source file encoding either "UTF-8" or "ISO-8859-1"
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({workspace, taskUtil, options: {pattern, encoding}}) {
	if (!encoding) {
		throw new Error("[escapeNonAsciiCharacters] Mandatory option 'encoding' not provided");
	}

	const allResources = await workspace.byGlob(pattern);

	const escaperOptions = {
		encoding: nonAsciiEscaper.getEncodingFromAlias(encoding)
	};

	if (taskUtil?.processEach) {
		// One cached step per resource, so a delta build re-processes only the resources that changed.
		await taskUtil.processEach("escapeNonAsciiCharacters", allResources, async (resource, {workspace}) => {
			const [processed] = await nonAsciiEscaper({resources: [resource], options: escaperOptions});
			if (processed) {
				await workspace.write(processed);
			}
		});
		return;
	}

	// Standalone use without the build cache (e.g. a direct task invocation): escape in one batch.
	const processedResources = await nonAsciiEscaper({
		resources: allResources,
		options: escaperOptions
	});

	await Promise.all(processedResources.map((resource) => resource && workspace.write(resource)));
}
