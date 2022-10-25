import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.initCommand);
});

test.serial("Writes ui5.yaml to fs", async (t) => {
	const ui5YamlPath = "./ui5.yaml";
	const ui5Yaml = `
	specVersion: '0.1'
	metadata:
	name: sample-app
	type: application`;

	const fsWriteFileStub = sinon.stub().resolves();

	const initCommand = t.context.initCommand = await esmock.p("../../../../lib/cli/commands/init.js", {
		"../../../../lib/utils/fsHelper": {
			exists: sinon.stub().resolves(false)
		},
		"../../../../lib/init/init": sinon.stub().resolves({}),
		"js-yaml": {
			dump: sinon.stub().returns(ui5Yaml)
		},
		"node:path": {
			resolve: () => ui5YamlPath
		},
		"node:fs/promises": {
			writeFile: fsWriteFileStub
		}
	});

	await initCommand.handler({});

	t.is(fsWriteFileStub.getCall(0).args[0], ui5YamlPath, "Passes yaml path to write the yaml file to");
	t.is(fsWriteFileStub.getCall(0).args[1], ui5Yaml, "Passes yaml content to write to fs");
});

test.serial("Error: throws if ui5.yaml already exists", async (t) => {
	const initCommand = t.context.initCommand = await esmock.p("../../../../lib/cli/commands/init.js", {
		"../../../../lib/utils/fsHelper": {
			exists: sinon.stub().resolves(true)
		}
	});

	await t.throwsAsync(initCommand.handler(), {
		message: "Initialization not possible: ui5.yaml already exists"
	});
});
