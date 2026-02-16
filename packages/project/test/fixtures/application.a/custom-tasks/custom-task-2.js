module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	console.log("Custom task 2 executed");

	// For #1 Build: Read a file which is an input of custom-task-1 (which sets a tag on it)
	const testJS = await workspace.byPath(`/resources/${projectNamespace}/test.js`);

	// For #3 Build: Read a different file (which is NOT an input of custom-task-1)
	const test2JS = await workspace.byPath(`/resources/${projectNamespace}/test2.js`);

	const tag = taskUtil.getTag(testJS, taskUtil.STANDARD_TAGS.IsDebugVariant);
	if (!test2JS && testJS) {
		// For #1 Build:
		if (tag) {
			console.log("Tag set by custom-task-1 is present in custom-task-2, as EXPECTED.");
		} else {
			throw new Error("Tag set by custom-task-1 is NOT present in custom-task-2, which is UNEXPECTED.");
		}
	} else {
		// For #3 Build (SAME behavior expected as in #1):
		if (tag) {
			console.log("Tag set by custom-task-1 is present in custom-task-2, as EXPECTED.");
		} else {
			throw new Error("Tag set by custom-task-1 is NOT present in custom-task-2, which is UNEXPECTED.");
		}
	}
};
