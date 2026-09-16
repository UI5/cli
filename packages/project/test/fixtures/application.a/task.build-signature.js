const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:buildSignatureTask");

const {readFile} = require("node:fs/promises");
const {join} = require("node:path");

// No-op task body: the task itself does nothing. This extension exists solely to exercise the
// determineBuildSignature callback below.
module.exports = async function () {
	log.verbose("build-signature-task executed");
};

// determineBuildSignature is invoked by TaskDefinitions#getBuildSignatures() to contribute a value
// to the project's build signature. Here we derive the signature from an on-disk control file
// located at the project root (outside the monitored source/dependency readers), so that a test can
// change the returned signature independently of any source-file change.
module.exports.determineBuildSignature = async function ({taskUtil}) {
	const rootPath = taskUtil.getProject().getRootPath();
	const controlFilePath = join(rootPath, "buildSignatureControl.txt");
	try {
		const content = await readFile(controlFilePath, {encoding: "utf8"});
		log.verbose(`build-signature-task determineBuildSignature: ${content.trim()}`);
		return content.trim();
	} catch (err) {
		// Fall back to a constant if the control file is missing
		log.verbose(`build-signature-task determineBuildSignature: control file missing (${err.code})`);
		return "no-control-file";
	}
};
