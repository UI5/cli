const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:buildSignatureTask");

const {readFile} = require("node:fs/promises");
const {join} = require("node:path");

// Reads the control file located at the project root (outside the monitored source/dependency
// readers). Both the task body and the determineBuildSignature callback derive their value from it,
// so a test can change the returned value / produced output independently of any source-file change.
async function readControlValue(rootPath) {
	const controlFilePath = join(rootPath, "buildSignatureControl.txt");
	try {
		const content = await readFile(controlFilePath, {encoding: "utf8"});
		return content.trim();
	} catch (err) {
		// Fall back to a constant if the control file is missing
		log.verbose(`build-signature-task: control file missing (${err.code})`);
		return "no-control-file";
	}
}

// Task body: appends the current control value to the application's test.js. This makes the built
// output observably depend on the control file, so a served resource reflects its value.
module.exports = async function ({taskUtil, workspace, options: {projectNamespace}}) {
	log.verbose("build-signature-task executed");

	const controlValue = await readControlValue(taskUtil.getProject().getRootPath());
	const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
	if (resource) {
		const content = `${await resource.getString()}\n// build-signature-control: ${controlValue}\n`;
		resource.setString(content);
		await workspace.write(resource);
	}
};

// determineBuildSignature is invoked by TaskDefinitions#getBuildSignatures() to contribute a value
// to the project's build signature. We derive it from the same control file so that changing the
// file changes the returned signature (and thus must invalidate the project's build cache).
module.exports.determineBuildSignature = async function ({taskUtil}) {
	const controlValue = await readControlValue(taskUtil.getProject().getRootPath());
	log.verbose(`build-signature-task determineBuildSignature: ${controlValue}`);
	return controlValue;
};
