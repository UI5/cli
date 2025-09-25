import test from "ava";
import sinon from "sinon";
import path from "node:path";
import versions from "../../../../lib/cli/commands/versions.js";
const __dirname = path.join(import.meta.dirname, "..");

test.afterEach.always((t) => {
	sinon.restore();
});

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

test.serial("Retrieves version and package path in verbose mode", async (t) => {
	const {setLogLevel} = await import("@ui5/logger");
	setLogLevel("verbose");
	const builderPath = "../../../test/fixtures/@ui5/builder";
	const builderVersion = versions.getVersion(builderPath);
	const serverPath = "../../../test/fixtures/@ui5/server";
	const serverVersion = versions.getVersion(serverPath);
	const fsPath = "../../../test/fixtures/@ui5/fs";
	const fsVersion = versions.getVersion(fsPath);
	const projectPath = "../../../test/fixtures/@ui5/project";
	const projectVersion = versions.getVersion(projectPath);
	const loggerPath = "../../../test/fixtures/@ui5/logger";
	const loggerVersion = versions.getVersion(loggerPath);
	t.is(builderVersion, `0.2.6 (from ${path.resolve(__dirname, builderPath)})`,
		"retrieved correct version and path for builder");
	t.is(serverVersion, `0.2.2 (from ${path.resolve(__dirname, serverPath)})`,
		"retrieved correct version and path for server");
	t.is(fsVersion, `0.2.0 (from ${path.resolve(__dirname, fsPath)})`,
		"retrieved correct version and path for fs");
	t.is(projectVersion, `0.2.3 (from ${path.resolve(__dirname, projectPath)})`,
		"retrieved correct version and path for project");
	t.is(loggerVersion, `0.2.2 (from ${path.resolve(__dirname, loggerPath)})`,
		"retrieved correct version and path for logger");
});

test.serial("Error: returns not installed if version was not found", (t) => {
	t.is(versions.getVersion("not/existing/path"), "===(not installed)", "No version found");
});

test.serial("Error: throws with error if error occurred while processing", async (t) => {
	sinon.stub(versions, "getVersion").throws(new Error("Error occurred"));
	const error = await t.throwsAsync(versions.handler({}));
	t.is(error.message, "Error occurred", "Correct error message thrown");
});
