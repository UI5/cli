const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:stepBasedTask");

// Custom step-based task: one cached unit per `.src` resource under /procEach, expressed as a single map
// step. The step's keys enumerator lists the `.src` resources; each unit reads its sibling `.dep` file as
// a cross-resource input through the step workspace and writes a combined `.out`. Because the `.dep` read
// goes through the step workspace, it is recorded as that unit's input, so on a delta build changing only
// a `.dep` re-runs its owning unit and leaves the others served from cache. This is the same reverse
// mapping the built-in minify relies on for its `.js.map` -> `.js` relation, expressed by a custom task.
module.exports = function build() {
	return [{
		name: "procEach",
		keys: async ({workspace, taskUtil, options: {projectNamespace}}) => {
			// Tag from the enumerator, not from a unit: the enumerator runs whenever the stage runs, but
			// it owns no key, so its tags have no per-key invocation entry to be replayed from. They
			// survive a fully cached stage through the stage's own recorded tag operations.
			const omittedResources = await workspace.byGlob(`/resources/${projectNamespace}/procEach/*.omitme`);
			for (const omittedResource of omittedResources) {
				taskUtil.setTag(omittedResource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
			}
			const srcResources = await workspace.byGlob(`/resources/${projectNamespace}/procEach/*.src`);
			log.verbose(`step-based-task processing ${srcResources.length} source(s)`);
			return srcResources;
		},
		each: async (srcResource, {workspace, taskUtil}) => {
			const srcPath = srcResource.getPath();
			const depPath = srcPath.replace(/\.src$/, ".dep");
			// Read the cross-resource input through the step workspace so it is tracked as this unit's input.
			const depResource = await workspace.byPath(depPath);
			const depContent = depResource ? await depResource.getString() : "<no-dep>";
			const srcContent = await srcResource.getString();
			const outResource = taskUtil.resourceFactory.createResource({
				path: srcPath.replace(/\.src$/, ".out"),
				string: `${srcContent}\n// dep: ${depContent}\n`,
			});
			await workspace.write(outResource);
		},
	}];
};
module.exports.stepBased = true;
