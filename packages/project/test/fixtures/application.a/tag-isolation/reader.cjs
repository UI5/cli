const assert = require("node:assert/strict");

module.exports = function build() {
	return {
		task: async ({workspace, dependencies, taskUtil, options: {projectNamespace}}) => {
			const resource = await dependencies.byPath("/resources/library/d/tag-input.txt");
			assert.ok(resource);
			const value = await resource.getString();
			assert.equal(taskUtil.getTag(resource, "build:Consumer"), value);
			assert.equal(taskUtil.getTag(resource, "project:Producer"), value);
			assert.equal(taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult), undefined);
			assert.equal(taskUtil.getTag(resource, taskUtil.STANDARD_TAGS.IsBundle), undefined);
			const trigger = await workspace.byPath(`/resources/${projectNamespace}/tag-trigger.txt`);
			await workspace.write(taskUtil.resourceFactory.createResource({
				path: `/resources/${projectNamespace}/tag-report.txt`,
				string: `${value}:${await trigger.getString()}`
			}));
		},
		determineRequiredDependencies: ({availableDependencies}) => availableDependencies
	};
};
