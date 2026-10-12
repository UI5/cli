const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:customTask1");

// Specification Version 5.0 descriptor: the default export is a factory that returns the task body.
module.exports = function build() {
	return {
		task: async ({workspace, taskUtil, options: {projectNamespace}}) => {
			log.verbose("Custom task 1 executed");

			// Set a tag on a specific resource:
			const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
			if (resource) {
				taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.IsDebugVariant);
			};
		}
	};
};
