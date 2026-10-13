import fsInterface from "@ui5/fs/fsInterface";
import {getDebugName, getNonDebugName} from "../lbt/utils/ModuleName.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:minify");

/**
 * @public
 * @module @ui5/builder/tasks/minify
 */

/**
 * Task to minify resources.
 *
 * A step-based task: the default export is a factory returning one map step with a key per matched
 * resource, so a delta build re-minifies only the resources whose inputs changed. A resource's input
 * source map (the <code>//# sourceMappingURL=</code> target) is read through the step's workspace and
 * thus recorded as an input of that step, so changing only the <code>.js.map</code> re-runs its owning
 * <code>.js</code> and regenerates a correct <code>-dbg.js.map</code>.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string} options.pattern Pattern to locate the files to be processed
 * @param {boolean} [options.omitSourceMapResources=false] Whether source map resources shall
 * 		be tagged as "OmitFromBuildResult" and no sourceMappingURL shall be added to the minified resource
 * @param {boolean} [options.useInputSourceMaps=true] Whether to make use of any existing source
 * 		maps referenced in the resources to be minified. Use this option to preserve reference to the original
 * 		source files, such as TypeScript files, in the generated source map.
 * @returns {object[]} The task's build steps
 */
export default function build({pattern, omitSourceMapResources = false, useInputSourceMaps = true}) {
	const minifierOptions = {
		addSourceMappingUrl: !omitSourceMapResources,
		readSourceMappingUrl: !!useInputSourceMaps,
	};

	// Applies the debug/omit tags to a minified resource and its derived resources, then writes them.
	const tagAndWrite = async (processed, workspace, taskUtil) => {
		const {resource, dbgResource, sourceMapResource, dbgSourceMapResource} = processed;
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
		await Promise.all([
			workspace.write(resource),
			workspace.write(dbgResource),
			workspace.write(sourceMapResource),
			dbgSourceMapResource && workspace.write(dbgSourceMapResource)
		]);
	};

	return [{
		name: "minify",
		// One key per matched resource, so a delta build re-minifies only the resources whose inputs
		// changed. The input source map is read through the step's workspace and thus tracked per step.
		keys: async ({workspace}) => {
			const resources = await workspace.byGlob(pattern);

			// A -dbg.js next to its .js in the sources is a broken input state: the minify task owns the
			// -dbg.js path and generates it from the .js, so a pre-existing one must not be there. Were both
			// kept, the .js key would write its generated debug variant to the -dbg.js path, which the -dbg.js
			// key also writes - two concurrent keys writing one path, which the shared assertDistinctWrite
			// guard rejects, crashing the build. Rather than crash, skip both members of such a pair: the .js
			// is left as it is (the existing -dbg.js already serves as its debug variant) and the -dbg.js is
			// passed through unchanged.
			const paths = new Set(resources.map((resource) => resource.getPath()));
			return resources.filter((resource) => {
				const resourcePath = resource.getPath();
				const dbgPath = getDebugName(resourcePath);
				if (dbgPath && paths.has(dbgPath)) {
					// A .js whose -dbg.js sibling already exists in the sources: skip it
					log.warn(
						`Skipping minification of ${resourcePath}: a debug variant ${dbgPath} already ` +
						`exists next to it. The minify task generates the debug variant itself, so a ` +
						`pre-existing one is unexpected. Remove ${dbgPath} from the sources to let the task ` +
						`generate it.`);
					return false;
				}
				const nonDbgPath = getNonDebugName(resourcePath);
				if (nonDbgPath && paths.has(nonDbgPath)) {
					// Skip the -dbg.js itself when its non-debug .js sibling is also present
					return false;
				}
				return true;
			});
		},
		each: async (inputResource, {workspace, taskUtil}) => {
			// Load the minifier (and its worker-pool module graph) lazily, inside the step body, so plan-time
			// step-name discovery can import this factory module without evaluating that graph. A build whose
			// minify keys are all cache hits never reaches here.
			const minifier = (await import("../processors/minifier.js")).default;
			const [processed] = await minifier({
				resources: [inputResource],
				fs: fsInterface(workspace),
				taskUtil,
				options: {
					...minifierOptions,
					useWorkers: !process.env.UI5_CLI_NO_WORKERS && !!taskUtil
				},
			});
			await tagAndWrite(processed, workspace, taskUtil);
		},
	}];
}
