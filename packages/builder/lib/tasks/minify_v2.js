import minifier from "../processors/minifier.js";
import fsInterface from "@ui5/fs/fsInterface";

// Prototype task using the declarative "new task system". Instead of executing directly, this task
// registers via newTaskSystem.forEachResource(); the system decides when and with which resources to
// invoke the callback (all matches on a full build, only affected ones on a delta build). The callback's
// reads (including the input source map read via fsInterface) are attributed per invocation, so a change
// to only a `.js.map` re-runs the owning `.js` and regenerates a correct `-dbg.js.map` — no task-authored
// delta logic, no staleness (contrast the FIXME in minify.js).
//
// PARKED follow-ups (not handled here): process.env is read below as a non-deterministic input that is not
// yet modeled as a monitored/invalidating input; a new terser version does not yet invalidate the cache;
// full resource-tag propagation through the per-invocation layer.
export default async function({
	newTaskSystem,
	options: {pattern, omitSourceMapResources = false, useInputSourceMaps = true}
}) {
	newTaskSystem.forEachResource(pattern, async (inputResource, {workspace, taskUtil}) => {
		const [{
			resource,
			dbgResource,
			sourceMapResource,
			dbgSourceMapResource
		}] = await minifier({
			resources: [inputResource],
			fs: fsInterface(workspace),
			taskUtil,
			options: {
				addSourceMappingUrl: !omitSourceMapResources,
				readSourceMappingUrl: !!useInputSourceMaps,
				useWorkers: !process.env.UI5_CLI_NO_WORKERS && !!taskUtil,
			}
		});
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
	});
}

// "workspace" provided in the callback of newTaskSystem.forEachResource associates reads/writes
// with the resource being processed.

// "taskUtil" provided in the callback of newTaskSystem.forEachResource associates access to utility
// functions for managing resource tags with the resource being processed.
