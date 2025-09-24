import minifier from "../processors/minifier.js";
import fsInterface from "@ui5/fs/fsInterface";

/**
 * @public
 * @module @ui5/builder/tasks/minify
 */

/**
 * Task to minify resources.
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
	workspace, taskUtil, options: {pattern, omitSourceMapResources = false, useInputSourceMaps = true
	}}) {
	const resources = await workspace.byGlob(pattern);
	const processedResources = await minifier({
		resources,
		fs: fsInterface(workspace),
		taskUtil,
		options: {
			addSourceMappingUrl: !omitSourceMapResources,
			readSourceMappingUrl: !!useInputSourceMaps,
			useWorkers: !!taskUtil,
		}
	});

	return Promise.all(processedResources.map(async ({
		resource, dbgResource, sourceMapResource, dbgSourceMapResource
	}) => {
		if (taskUtil) {
			// Carry over OmitFromBuildResult from input resource to all derived resources
			if (taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult)) {
				taskUtil.setTag(dbgResource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
				taskUtil.setTag(sourceMapResource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
			}
			taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.HasDebugVariant);
			taskUtil.setTag(dbgResource, taskUtil.STANDARD_TAGS.IsDebugVariant);
			taskUtil.setTag(sourceMapResource, taskUtil.STANDARD_TAGS.HasDebugVariant);
			if (omitSourceMapResources) {
				taskUtil.setTag(sourceMapResource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
			}
			if (dbgSourceMapResource) {
				taskUtil.setTag(dbgSourceMapResource, taskUtil.STANDARD_TAGS.IsDebugVariant);
				if (omitSourceMapResources) {
					taskUtil.setTag(dbgSourceMapResource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
				}
			}
		}
		return Promise.all([
			workspace.write(resource),
			workspace.write(dbgResource),
			workspace.write(sourceMapResource),
			dbgSourceMapResource && workspace.write(dbgSourceMapResource)
		]);
	}));
}
