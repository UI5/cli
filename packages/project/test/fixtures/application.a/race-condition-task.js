const {readFile, writeFile} = require("fs/promises");
const path = require("path");

module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	const webappPath = taskUtil.getProject().getSourcePath();
	// Modify source file during build
	const testFilePath = path.join(webappPath, "test.js");
	const originalContent = await readFile(testFilePath, {encoding: "utf8"});
	await writeFile(testFilePath, originalContent + `\nconsole.log("RACE CONDITION MODIFICATION");\n`);
};
