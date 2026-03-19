const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:customTask1");

module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	log.verbose("Custom task 1 executed");

	// Set a tag on a specific resource:
	const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
	if (resource) {
		taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
	};
};
