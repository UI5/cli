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
 * Each pair has a separate tagging key, so its tags can be restored without re-running the callback.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} options Options
 * @param {string|string[]} options.pattern Patterns defining the resource scope, including existing debug pairs
 * @param {string[]} [options.excludes=[]] Minification exclusions relative to <code>/resources/</code>.
 *   A leading <code>!</code> re-includes matches; later entries take precedence. Support rules
 *   (<code>*.support.js</code>) are excluded by default, unless explicitly re-included.
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
	// Compile once per task, not once per resource or delta build. Match backwards so the last
	// matching exclusion/re-inclusion wins.
	const filters = excludes.map((exclude) => {
		const include = exclude.startsWith("!");
		const pattern = include ? exclude.slice(1) : exclude;
		return {
			include,
			matches: micromatch.matcher(`/resources/${pattern}`, {dot: true}),
		};
	}).reverse();
	const shouldMinify = (resourcePath) => {
		for (const {include, matches} of filters) {
			if (matches(resourcePath)) {
				return include;
			}
		}
		// Support rules should not be minified to have readable code in the Support Assistant.
		// This is a minification default, not a discovery filter: existing support pairs still get tags.
		return !resourcePath.endsWith(".support.js");
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
		// Ordinary resource keys retain their content-based identity and source-map dependency tracking.
		// Existing pairs use string keys and do not load/hash their content during key enumeration.
		keys: async ({workspace}) => {
			// The single discovery query records every input needed for pairing. Exclusions only select
			// minification keys; they are task options and therefore already part of the build signature.
			const resources = await workspace.byGlob(pattern);
			const paths = new Set(resources.map((resource) => resource.getPath()));
			const minificationPaths = new Set([...paths].filter(shouldMinify));
			const keys = [];
			for (const resource of resources) {
				const resourcePath = resource.getPath();
				const dbgPath = getDebugName(resourcePath);
				if (dbgPath && paths.has(dbgPath)) {
					// Neither member may be minified: their generated outputs would collide. Give the pair
					// its own invocation so tags are replayed on a delta, and dropped when the pair disappears.
					keys.push(JSON.stringify({resourcePath, dbgPath,
						warn: minificationPaths.has(resourcePath) || minificationPaths.has(dbgPath)}));
				} else if (!paths.has(getNonDebugName(resourcePath)) && minificationPaths.has(resourcePath)) {
					keys.push(resource);
				}
			}
			return keys;
		},
		each: async (inputResource, {workspace, taskUtil}) => {
			if (typeof inputResource === "string") {
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
					// Attribute these reads and tag operations to the pair, not the enumerator. Unrelated
					// minification keys stay cached when a member changes; excluded pairs are never written.
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
