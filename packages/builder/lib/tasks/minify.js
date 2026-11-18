import fsInterface from "@ui5/fs/fsInterface";
import micromatch from "micromatch";
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
 * Existing debug/non-debug pairs are left unchanged and tagged, even when excluded from minification.
 * A warning is logged for the non-debug resource if it's not excluded from minification.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string|string[]} options.pattern Patterns defining the resource scope, including existing debug pairs
 * @param {string[]} [options.excludes=[]] Glob patterns matched against absolute virtual resource paths.
 *   A leading <code>!</code> re-includes matches; later entries take precedence. Patterns are used as
 *   supplied, without a path prefix or implicit exclusions.
 *   Exclusions do not affect discovery or tagging of existing debug pairs.
 * @param {boolean} [options.omitSourceMapResources=false] Whether source map resources shall
 * 		be tagged as "OmitFromBuildResult" and no sourceMappingURL shall be added to the minified resource
 * @param {boolean} [options.useInputSourceMaps=true] Whether to make use of any existing source
 * 		maps referenced in the resources to be minified. Use this option to preserve reference to the original
 * 		source files, such as TypeScript files, in the generated source map.
 * @returns {module:@ui5/builder/tasks/runTask~TaskDescriptor} The task descriptor with its build steps
 */
export default function defineTask({
	pattern, excludes = [], omitSourceMapResources = false, useInputSourceMaps = true,
}) {
	// We loop through all the exclusions of the ui5 config and prepare them once to efficiently
	// use them later in calls of shouldBeMinified():
	const preProcessedExclusions = excludes.map((exclude) => {
		// Entries marked with "!" should be re-included:
		const isReInclusion = exclude.startsWith("!");
		// Return clean glob (remove leading "!" incase of re-inclusion):
		const normalizedGlob = isReInclusion ? exclude.slice(1) : exclude;
		return {
			exclusionGlobMatcher: micromatch.matcher(normalizedGlob, {dot: true}),
			isReInclusion,
		};
	}).reverse(); // Reverse the order so that the last exclusion in the list takes precedence ("last one wins")

	// Determines whether a resource should be minified based on the exclusion patterns:
	const shouldBeMinified = (resourcePath) => {
		// Handle excluded paths:
		for (const {exclusionGlobMatcher, isReInclusion} of preProcessedExclusions) {
			if (exclusionGlobMatcher(resourcePath)) {
				return isReInclusion;
			}
		}
		// Handle remaining regular paths:
		return true;
	};
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

	return {steps: [{
		name: "minify",
		keys: async ({workspace}) => {
			const resources = await workspace.byGlob(pattern);
			const paths = new Set(resources.map((resource) => resource.getPath()));
			// Filter resources by the exclusions:
			const shouldBeMinifiedPaths = new Set([...paths].filter(shouldBeMinified));
			const keys = [];
			for (const resource of resources) {
				const resourcePath = resource.getPath();
				const dbgPath = getDebugName(resourcePath);
				if (dbgPath && paths.has(dbgPath)) {
					// Special dbg/non-dbg pair handling: if a debug variant ("-dbg.js"),
					// and a non-debug resource (".js") exist together, both should not be minified.
					// In case such a scenario (& no exclusion), log a warning for the non-debug resource:
					keys.push(JSON.stringify({resourcePath, dbgPath,
						warn: shouldBeMinifiedPaths.has(resourcePath)}));
					// We use JSON.stringify & parse to pass multiple values through the build framework
					// to be picked up later in the 'each' step.
				} else if (!paths.has(getNonDebugName(resourcePath)) && shouldBeMinifiedPaths.has(resourcePath)) {
					// Standard case: resources without a debug variant
					// (+ cases where the resource is simply called "-dbg.js")
					keys.push(resource);
				}
			}
			return keys;
		},
		each: async (inputResource, {workspace, taskUtil}) => {
			if (typeof inputResource === "string") {
				// Special dbg/non-dbg pair handling:
				const {resourcePath, dbgPath, warn} = JSON.parse(inputResource);
				if (warn) {
					log.warn(
						`Skipping minification of ${resourcePath}: a debug variant ${dbgPath} already ` +
						`exists next to it. The minify task generates the debug variant itself, so sources ` +
						`normally must not contain one. If this is intentional (for example the file uses ` +
						`ECMAScript syntax the minify task does not support yet), list both ${resourcePath} ` +
						`and ${dbgPath} in the 'builder.minification.excludes' configuration of the ` +
						`project's ui5.yaml.`);
				}
				if (taskUtil) {
					// Tag both resources (even if not minified)
					const [resource, dbgResource] = await Promise.all([
						workspace.byPath(resourcePath), workspace.byPath(dbgPath),
					]);
					taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.HasDebugVariant);
					taskUtil.setTag(dbgResource, taskUtil.STANDARD_TAGS.IsDebugVariant);
				}
				return;
			}
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
	}]};
}
