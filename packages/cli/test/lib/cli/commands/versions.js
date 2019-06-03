const test = require("ava");
const sinon = require("sinon");
const versions = require("../../../../lib/cli/commands/versions");

test.serial("Retrieves version from package.json", (t) => {
	const builderVersion = versions.getVersion("../../../test/fixtures/@ui5/builder");
	const serverVersion = versions.getVersion("../../../test/fixtures/@ui5/server");
	const fsVersion = versions.getVersion("../../../test/fixtures/@ui5/fs");
	const projectVersion = versions.getVersion("../../../test/fixtures/@ui5/project");
	const loggerVersion = versions.getVersion("../../../test/fixtures/@ui5/logger");

	t.is(builderVersion, "0.2.6", "retrieved correct version for builder");
	t.is(serverVersion, "0.2.2", "retrieved correct version for server");
	t.is(fsVersion, "0.2.0", "retrieved correct version for fs");
	t.is(projectVersion, "0.2.3", "retrieved correct version for project");
	t.is(loggerVersion, "0.2.2", "retrieved correct version for logger");
});

test.serial("Error: returns not installed if version was not found", (t) => {
	t.is(versions.getVersion("not/existing/path"), "===(not installed)", "No version found");
});

test.serial("Error: kills process if error occurred while processing", (t) => {
	sinon.stub(process, "exit");
	sinon.stub(versions, "getVersion").throws("Error occurred");
	versions.handler({});
	t.is(process.exit.getCall(0).args[0], 1, "Process was killed with code 1");
	process.exit.restore();
});
