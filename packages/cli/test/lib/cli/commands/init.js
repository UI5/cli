const test = require("ava");
const sinon = require("sinon");
const initCommand = require("../../../../lib/cli/commands/init");
const fsHelper = require("../../../../lib/utils/fsHelper");
const init = require("../../../../lib/init/init");
const mock = require("mock-require");
const jsYaml = require("js-yaml");
const fs = require("fs");

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("Writes ui5.yaml to fs", async (t) => {
	const ui5YamlPath = "./ui5.yaml";
	const ui5Yaml = `
	specVersion: '0.1'
	metadata:
	name: sample-app
	type: application`;

	mock("path", {resolve: () => ui5YamlPath});
	sinon.stub(fsHelper, "exists").resolves(false);
	sinon.stub(init, "init").resolves({});
	sinon.stub(jsYaml, "safeDump").returns(ui5Yaml);
	const fsWriteFileStub = sinon.stub(fs, "writeFile").callsArgWith(2);

	await initCommand.handler({});

	t.is(fsWriteFileStub.getCall(0).args[0], ui5YamlPath, "Passes yaml path to write the yaml file to");
	t.is(fsWriteFileStub.getCall(0).args[1], ui5Yaml, "Passes yaml content to write to fs");
});

test.serial("Error: throws if ui5.yaml already exists", async (t) => {
	sinon.stub(fsHelper, "exists").resolves(true);

	await t.throwsAsync(initCommand.handler(), {
		message: "Initialization not possible: ui5.yaml already exists"
	});
});
