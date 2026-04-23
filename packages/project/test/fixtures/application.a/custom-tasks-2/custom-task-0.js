const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:customTask0");

let buildRanOnce;
module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	log.verbose("Custom task 0 executed");

	// Read a file to trigger execution of this task:
	const testJS = await workspace.byPath(`/resources/${projectNamespace}/test.js`);

	if (buildRanOnce != true) {
		log.verbose("Flag NOT set -> We are in #1 Build still");
		buildRanOnce = true;
		taskUtil.setTag(testJS, taskUtil.STANDARD_TAGS.IsDebugVariant);
	} else {
		log.verbose("Flag set -> We are in #2 Build");
		taskUtil.setTag(testJS, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
	}
};
