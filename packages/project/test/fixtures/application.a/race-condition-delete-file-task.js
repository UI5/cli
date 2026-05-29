const {rm} = require("fs/promises");
const path = require("path");

module.exports = async function ({
	workspace, taskUtil,
	options: {projectNamespace}
}) {
	const webappPath = taskUtil.getProject().getSourcePath();
	const deletedFilePath = path.join(webappPath, "test.js");
	await rm(deletedFilePath, {force: true});
};
