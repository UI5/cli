const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:processEachTask");

// Custom task exercising taskUtil.processEach: one cached step per `.src` resource under
// /procEach. Each step reads its sibling `.dep` file as a cross-resource input through the step
// workspace and writes a combined `.out`. Because the `.dep` read goes through the step workspace, it
// is recorded as that step's input, so on a delta build changing only a `.dep` re-runs its owning step
// and leaves the other steps served from cache. This is the same reverse-mapping the built-in minify
// relies on for its `.js.map` -> `.js` relation, expressed by a custom task.
module.exports = async function({workspace, taskUtil, options: {projectNamespace}}) {
	const srcResources = await workspace.byGlob(`/resources/${projectNamespace}/procEach/*.src`);
	if (!taskUtil?.processEach) {
		throw new Error("process-each-task requires taskUtil.processEach (Specification Version 5.0)");
	}
	log.verbose(`process-each-task processing ${srcResources.length} source(s)`);

	await taskUtil.processEach(srcResources, async (srcResource, {workspace, taskUtil}) => {
		const srcPath = srcResource.getPath();
		const depPath = srcPath.replace(/\.src$/, ".dep");
		// Read the cross-resource input through the step workspace so it is tracked as this step's input.
		const depResource = await workspace.byPath(depPath);
		const depContent = depResource ? await depResource.getString() : "<no-dep>";
		const srcContent = await srcResource.getString();
		const outResource = taskUtil.resourceFactory.createResource({
			path: srcPath.replace(/\.src$/, ".out"),
			string: `${srcContent}\n// dep: ${depContent}\n`,
		});
		await workspace.write(outResource);
	});
};

// Opt into differential builds so a delta re-runs only the affected steps rather than the whole task.
module.exports.supportsDifferentialBuilds = () => true;
