const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:customTask2");

module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	log.verbose("Custom task 2 executed");

	// Read a file which is an input of custom-task-1 (which sets a tag on it):
	const testJS = await workspace.byPath(`/resources/${projectNamespace}/test.js`);

	const tag = taskUtil.getTag(testJS, taskUtil.STANDARD_TAGS.IsDebugVariant);
	// For #1 & #3 build:
	if (!tag) {
		throw new Error("Tag set by custom-task-1 is NOT present in custom-task-2, which is UNEXPECTED.");
	}

	// For #3 build: Read a different file which is not an input of custom-task-1
	// (ensures that this task is executed):
	const test2JS = await workspace.byPath(`/resources/${projectNamespace}/test2.js`);
};
