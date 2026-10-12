const {readFile, writeFile} = require("fs/promises");
const path = require("path");

// Specification Version 5.0 descriptor: the default export is a factory that returns the task body.
module.exports = function build() {
	return {
		task: async ({workspace, taskUtil, options: {projectNamespace}}) => {
			const webappPath = taskUtil.getProject().getSourcePath();
			// Modify source file during build
			const testFilePath = path.join(webappPath, "test.js");
			const originalContent = await readFile(testFilePath, {encoding: "utf8"});
			await writeFile(testFilePath, originalContent + `\nconsole.log("RACE CONDITION MODIFICATION");\n`);
		}
	};
};
