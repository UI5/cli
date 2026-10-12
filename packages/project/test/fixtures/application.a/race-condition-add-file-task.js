const {writeFile} = require("fs/promises");
const path = require("path");

// Specification Version 5.0 descriptor: the default export is a factory that returns the task body.
module.exports = function build() {
	return {
		task: async ({workspace, taskUtil, options: {projectNamespace}}) => {
			const webappPath = taskUtil.getProject().getSourcePath();
			const addedFilePath = path.join(webappPath, "added-during-build.js");
			await writeFile(addedFilePath, `console.log("RACE CONDITION ADDED FILE");\n`);
		}
	};
};
