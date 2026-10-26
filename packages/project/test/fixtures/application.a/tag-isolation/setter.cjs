const assert = require("node:assert/strict");

module.exports = function build() {
	return {
		task: async ({workspace, dependencies, taskUtil, options: {projectNamespace}}) => {
			const resource = await dependencies.byPath("/resources/library/d/tag-input.txt");
			assert.ok(resource);
			assert.equal(taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult), undefined);
			assert.equal(taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsBundle), undefined);
			assert.equal(taskUtil.getTag(resource, "build:Consumer"), undefined);
			const value = await resource.getString();
			assert.equal(taskUtil.getTag(resource, "project:Producer"), value);
			taskUtil.setTag(resource, "build:Consumer", value);

			const omitted = taskUtil.resourceFactory.createResource({
				path: `/resources/${projectNamespace}/tag-omitted.txt`,
				string: value
			});
			taskUtil.setTag(omitted, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
			await workspace.write(omitted);
		},
		determineRequiredDependencies: ({availableDependencies}) => availableDependencies
	};
};
