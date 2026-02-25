let buildRanOnce;
module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	console.log("Custom task 0 executed");

	// Read a file to trigger execution of this task:
	const testJS = await workspace.byPath(`/resources/${projectNamespace}/test.js`);

	if (buildRanOnce != true) {
		console.log("Flag NOT set -> We are in #1 Build still");
		buildRanOnce = true;
		taskUtil.setTag(testJS, taskUtil.STANDARD_TAGS.IsDebugVariant);
	} else {
		console.log("Flag set -> We are in #2 Build");
		taskUtil.setTag(testJS, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
	}
};
