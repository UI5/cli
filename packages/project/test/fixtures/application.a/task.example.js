const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:exampleTask");

module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	log.verbose("Example task executed");

	// Omit a specific resource from the build result
	const omittedResource = await workspace.byPath(`/resources/${projectNamespace}/fileToBeOmitted.js`);
	if (omittedResource) {
		taskUtil.setTag(omittedResource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
	};
};
