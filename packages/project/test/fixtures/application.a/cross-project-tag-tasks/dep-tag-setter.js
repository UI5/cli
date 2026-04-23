const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:depTagSetter");

let buildRanOnce;
module.exports = async function ({workspace, taskUtil}) {
	log.verbose("dep-tag-setter executed");

	const resources = await workspace.byGlob("**/some.js");
	if (resources.length === 0) {
		throw new Error("dep-tag-setter: some.js not found in workspace");
	}
	const someJs = resources[0];

	if (buildRanOnce !== true) {
		log.verbose("First build: Setting ui5:IsDebugVariant on some.js");
		buildRanOnce = true;
		taskUtil.setTag(someJs,  taskUtil.STANDARD_TAGS.IsDebugVariant);
	} else {
		log.verbose("Subsequent build: Setting ui5:HasDebugVariant on some.js");
		taskUtil.setTag(someJs, taskUtil.STANDARD_TAGS.HasDebugVariant);
	}
};
