const {rm} = require("fs/promises");
const path = require("path");

// Specification Version 5.0 descriptor: the default export is a factory that returns the task body.
module.exports = function build() {
	return {
		task: async ({workspace, taskUtil, options: {projectNamespace}}) => {
			const webappPath = taskUtil.getProject().getSourcePath();
			const deletedFilePath = path.join(webappPath, "test.js");
			await rm(deletedFilePath, {force: true});
		}
	};
};
