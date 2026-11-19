const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:cacheExemptLegacy");

// Specification Version 4.0 legacy task: the default export is the task body itself, not a descriptor
// factory. A custom task below Specification Version 5.0 may read and write files outside the build's
// resource model, which the build cache cannot track, so it is never cached and runs on every build.
module.exports = async function({workspace, options: {projectNamespace}}) {
	log.verbose("Cache-exempt legacy task executed");
	// Read a project resource so the task participates in the pipeline like a real custom task would.
	await workspace.byPath(`/resources/${projectNamespace}/manifest.json`);
};
