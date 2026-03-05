const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:customTask1");

let buildRanOnce;
module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	log.verbose("Custom task 1 executed");

	// Read a file to trigger execution of this task:
	const testJS = await workspace.byPath(`/resources/${projectNamespace}/test.js`);

	if (buildRanOnce != true) {
		log.verbose("Flag NOT set -> We are in #1 Build still");
		buildRanOnce = true;
		const tag = taskUtil.getTag(testJS, taskUtil.STANDARD_TAGS.IsDebugVariant);
		if (!tag) {
			throw new Error("Tag set during #1 Build is not readable, which is UNEXPECTED.");
		}
	} else {
		const previousTag = taskUtil.getTag(testJS, taskUtil.STANDARD_TAGS.IsDebugVariant);
		if (previousTag) {
			throw new Error("Tag set during #1 Build is still readable, which is UNEXPECTED.");
		}
		log.verbose("Flag set -> We are in #2 Build");
		const tag = taskUtil.getTag(testJS, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
		if (!tag) {
			throw new Error("Tag set during #2 Build is not readable, which is UNEXPECTED.");
		}
	}
};
