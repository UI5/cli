module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	console.log("Custom task 1 executed");

	// Set a tag on a specific resource
	const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
	if (resource) {
		taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
	};
};
