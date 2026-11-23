// Fixture standard-task module for the load-time tool-capture test. It top-level-requires a dedicated tool
// (standard-task-tool) that no other test in this file loads, so the require resolves cold in this test
// process and the recorder's resolve hook fires deterministically. This mirrors a real standard task
// (generateLibraryManifest -> xml2js) without depending on that module being loaded cold, which the full
// suite cannot guarantee.
const transform = require("standard-task-tool");

module.exports = function build(options) {
	return {
		task: async ({workspace}) => {
			transform(options);
		}
	};
};
