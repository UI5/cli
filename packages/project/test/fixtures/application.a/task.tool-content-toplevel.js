const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:toolContentToplevelTask");

// Requires its tool at MODULE TOP LEVEL, not inside the task body. The require resolves when the extension
// module is loaded (during graph/signature resolution), before the task's per-stage execution window, so
// the execution-window hook never sees it. Extension-load capture (Task._getImplementation) records it
// instead, and the task's stage folds it into the tool-content signature.
const transform = require("stub-tool");

module.exports = function build() {
	return {
		task: async ({workspace, options: {projectNamespace}}) => {
			log.verbose("tool-content-toplevel-task executed");
			const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
			if (resource) {
				resource.setString(transform(await resource.getString()));
				await workspace.write(resource);
			}
		}
	};
};
