import minifier from "../processors/minifier.js";
import fsInterface from "@ui5/fs/fsInterface";

/**
 * @public
 * @module @ui5/builder/tasks/minify
 */

/**
 * Task to minify resources.
 *
 * Each matched resource is processed as its own cached step via
 * [taskUtil.processEach]{@link @ui5/project/build/helpers/TaskUtil#processEach}, so a delta build
 * re-minifies only the resources whose inputs changed. A resource's input source map (the
 * <code>//# sourceMappingURL=</code> target) is read through the step's workspace and thus recorded
 * as an input of that step, so changing only the <code>.js.map</code> re-runs its owning
 * <code>.js</code> and regenerates a correct <code>-dbg.js.map</code>.
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
 * @param {boolean} [parameters.options.omitSourceMapResources=false] Whether source map resources shall
 * 		be tagged as "OmitFromBuildResult" and no sourceMappingURL shall be added to the minified resource
 * @param {boolean} [parameters.options.useInputSourceMaps=true] Whether to make use of any existing source
 * 		maps referenced in the resources to be minified. Use this option to preserve reference to the original
 * 		source files, such as TypeScript files, in the generated source map.
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function({
	workspace, taskUtil,
	options: {pattern, omitSourceMapResources = false, useInputSourceMaps = true}
}) {
	const resources = await workspace.byGlob(pattern);
	if (resources.length === 0) {
		return;
	}

	// Applies the debug/omit tags to a minified resource and its derived resources, then writes them.
	const tagAndWrite = async (processed, stepWorkspace, stepTaskUtil) => {
		const {resource, dbgResource, sourceMapResource, dbgSourceMapResource} = processed;
		if (stepTaskUtil) {
			// Carry over OmitFromBuildResult from input resource to all derived resources
			if (stepTaskUtil.getTag(resource, stepTaskUtil.STANDARD_TAGS.OmitFromBuildResult)) {
				stepTaskUtil.setTag(dbgResource, stepTaskUtil.STANDARD_TAGS.OmitFromBuildResult);
				stepTaskUtil.setTag(sourceMapResource, stepTaskUtil.STANDARD_TAGS.OmitFromBuildResult);
			}
			stepTaskUtil.setTag(resource, stepTaskUtil.STANDARD_TAGS.HasDebugVariant);
			stepTaskUtil.setTag(dbgResource, stepTaskUtil.STANDARD_TAGS.IsDebugVariant);
			stepTaskUtil.setTag(sourceMapResource, stepTaskUtil.STANDARD_TAGS.HasDebugVariant);
			if (omitSourceMapResources) {
				stepTaskUtil.setTag(sourceMapResource, stepTaskUtil.STANDARD_TAGS.OmitFromBuildResult);
			}
			if (dbgSourceMapResource) {
				stepTaskUtil.setTag(dbgSourceMapResource, stepTaskUtil.STANDARD_TAGS.IsDebugVariant);
				if (omitSourceMapResources) {
					stepTaskUtil.setTag(dbgSourceMapResource, stepTaskUtil.STANDARD_TAGS.OmitFromBuildResult);
				}
			}
		}
		await Promise.all([
			stepWorkspace.write(resource),
			stepWorkspace.write(dbgResource),
			stepWorkspace.write(sourceMapResource),
			dbgSourceMapResource && stepWorkspace.write(dbgSourceMapResource)
		]);
	};

	const minifierOptions = {
		addSourceMappingUrl: !omitSourceMapResources,
		readSourceMappingUrl: !!useInputSourceMaps,
	};

	if (taskUtil?.processEach) {
		// One cached step per resource, so a delta build re-minifies only the resources whose inputs
		// changed. The input source map is read through the step's workspace and thus tracked per step.
		await taskUtil.processEach("minify", resources, async (inputResource, {workspace, taskUtil}) => {
			const [processed] = await minifier({
				resources: [inputResource],
				fs: fsInterface(workspace),
				taskUtil,
				options: {...minifierOptions, useWorkers: !process.env.UI5_CLI_NO_WORKERS && !!taskUtil},
			});
			await tagAndWrite(processed, workspace, taskUtil);
		});
	} else {
		// Standalone use without the build cache (e.g. a direct task invocation): minify in one batch.
		const processedResources = await minifier({
			resources,
			fs: fsInterface(workspace),
			taskUtil,
			options: {...minifierOptions, useWorkers: !process.env.UI5_CLI_NO_WORKERS && !!taskUtil},
		});
		await Promise.all(processedResources.map((processed) => tagAndWrite(processed, workspace, taskUtil)));
	}
}
