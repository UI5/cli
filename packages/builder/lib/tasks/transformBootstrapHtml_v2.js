import bootstrapHtmlTransformer from "../processors/bootstrapHtmlTransformer.js";

// Prototype task using the declarative "new task system". Instead of executing directly, this task
// registers via newTaskSystem.forEachResource(); the system decides when and with which resources to
// invoke the callback (the single index.html on a full build, and only if it changed on a delta build).
//
// Unlike minify, this task reads only the resource it processes (no cross-resource input such as a
// `.js.map`) and transforms it with a constant bootstrap src, so there is no resource-tracking
// staleness to close here — integrating it proves the system fits a straightforward per-resource task.
// Its one untracked input is the cheerio library version (same class as the terser/less-openui5
// processor-version gap tracked as §1 in
// ../../../project/lib/build/helpers/NewTaskSystem.open-gaps.md).
//
// The namespace-derived index.html path is expressed as the forEachResource pattern, so the single
// matching resource flows through the same per-invocation read attribution as any other task. The
// original task's "missing index.html" warning is intentionally dropped: a pattern that matches nothing
// is a normal no-op in the declarative model (and on a delta build a missing/unchanged index.html is
// expected), rather than a task-authored special case.
export default async function({newTaskSystem, options: {projectNamespace}}) {
	const indexPattern = projectNamespace ? `/resources/${projectNamespace}/index.html` : "/index.html";

	newTaskSystem.forEachResource(indexPattern, async (resource, {workspace}) => {
		const [processedResource] = await bootstrapHtmlTransformer({
			resources: [resource],
			options: {
				src: "resources/sap-ui-custom.js"
			}
		});
		await workspace.write(processedResource);
	});
}
