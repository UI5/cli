const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:toolContentToplevelStepsTask");

// Requires its tool at MODULE TOP LEVEL and exposes a step-based descriptor (a steps array, not a single
// task body). The require resolves when the extension module is loaded, before any step's execution window,
// so the per-stage hook never sees it. Extension-load capture (Task._getImplementation) records it, and the
// step runner folds that load-time set into every step's stage signature.
const transform = require("stub-tool");

module.exports = function build() {
	return {
		steps: [{
			name: "transform",
			run: async ({workspace, options: {projectNamespace}}) => {
				log.verbose("tool-content-toplevel-steps-task executed");
				const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
				if (resource) {
					resource.setString(transform(await resource.getString()));
					await workspace.write(resource);
				}
			},
		}],
	};
};
