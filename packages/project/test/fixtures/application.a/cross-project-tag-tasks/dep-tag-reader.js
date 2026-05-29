const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:depTagReader");

let buildRanOnce;
module.exports = async function ({taskUtil, dependencies}) {
	log.verbose("dep-tag-reader executed");

	// const libraryDProject = taskUtil.getProject("library.d");
	const resources = await dependencies.byGlob("**/some.js");
	if (resources.length === 0) {
		throw new Error("dep-tag-reader: some.js not found in library.d");
	}
	const someJs = resources[0];

	if (buildRanOnce !== true) {
		log.verbose("First build: Verifying ui5:IsDebugVariant is set on some.js");
		buildRanOnce = true;
		const tag = taskUtil.getTag(someJs, taskUtil.STANDARD_TAGS.IsDebugVariant);
		if (!tag) {
			throw new Error(
				"dep-tag-reader: Expected ui5:IsDebugVariant tag to be set on some.js in first build"
			);
		}
	} else {
		log.verbose("Subsequent build: Verifying ui5:HasDebugVariant is set on some.js");
		const tag = taskUtil.getTag(someJs, taskUtil.STANDARD_TAGS.HasDebugVariant);
		if (!tag) {
			throw new Error(
				"dep-tag-reader: Expected ui5:HasDebugVariant tag to be set on some.js in subsequent build"
			);
		}
	}
};

module.exports.determineRequiredDependencies = function ({availableDependencies}) {
	return availableDependencies;
}
