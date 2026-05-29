const {writeFile} = require("fs/promises");
const path = require("path");

module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	const webappPath = taskUtil.getProject().getSourcePath();
	const addedFilePath = path.join(webappPath, "added-during-build.js");
	await writeFile(addedFilePath, `console.log("RACE CONDITION ADDED FILE");\n`);
};
