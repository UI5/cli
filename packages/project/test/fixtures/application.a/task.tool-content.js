const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:toolContentTask");

// POC custom task for CPOUI5FOUNDATION-1386. Loads an external stub tool and uses it to transform a
// resource. The tool's content is a build input, so changing the stub (version bump / content edit) must
// re-run this stage. The ToolDependencyRecorder observes the require("stub-tool") resolution during this
// task body and folds the tool's content into the stage signature, which is what makes the cache notice.
module.exports = function build() {
	return {
		task: async ({workspace, options: {projectNamespace}}) => {
			log.verbose("tool-content-task executed");
			const transform = require("stub-tool");
			const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
			if (resource) {
				resource.setString(transform(await resource.getString()));
				await workspace.write(resource);
			}
		}
	};
};
