import stringReplacer from "../processors/stringReplacer.js";

export default async function({newTaskSystem, options: {pattern, version}}) {
	newTaskSystem.forEachResource(pattern, async (inputResource, {workspace}) => {
		const [processedResource] = await stringReplacer({
			resources: [inputResource],
			options: {
				pattern: /\$\{(?:project\.)?version\}/g,
				replacement: version
			}
		});
		if (processedResource) {
			await workspace.write(processedResource);
		}
	});
}

// "workspace" provided in the callback of newTaskSystem.forEachResource associates reads/writes
// with the resource that is currently being processed.
