const assert = require("node:assert/strict");

module.exports = function build() {
	return {
		task: async ({workspace, taskUtil}) => {
			const resource = await workspace.byPath("/resources/library/d/tag-input.txt");
			assert.ok(resource);
			taskUtil.setTag(resource, "project:Producer", await resource.getString());
			taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
			taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.IsBundle);
		}
	};
};
