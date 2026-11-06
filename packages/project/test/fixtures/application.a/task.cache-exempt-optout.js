const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:cacheExemptOptOut");

// Specification Version 5.0 descriptor that opts out of the build cache via `cache: false`. The task
// could otherwise be cached, but the author declares it must run on every build (e.g. because it writes
// files outside the build's resource model that the cache cannot track).
module.exports = function build() {
	return {
		cache: false,
		task: async ({workspace, options: {projectNamespace}}) => {
			log.verbose("Cache-exempt opt-out task executed");
			await workspace.byPath(`/resources/${projectNamespace}/manifest.json`);
		}
	};
};
