const test = require("ava");
const sinon = require("sinon");
const normalizer = require("../..").normalizer;
const npmTranslatorStub = sinon.stub(require("../..").translators.npm);
const staticTranslatorStub = sinon.stub(require("../..").translators.static);
const projectPreprocessor = require("../../lib/projectPreprocessor");

test.serial("Uses npm translator as default strategy", (t) => {
	normalizer.generateDependencyTree();
	t.truthy(npmTranslatorStub.generateDependencyTree.called);
});

test.serial("Uses static translator as strategy", (t) => {
	normalizer.generateDependencyTree({
		translatorName: "static"
	});
	t.truthy(staticTranslatorStub.generateDependencyTree.called);
});

test.serial("Generate project tree using with overwritten config path", async (t) => {
	sinon.stub(normalizer, "generateDependencyTree").resolves({configPath: "defaultPath/config.json"});
	const projectPreprocessorStub = sinon.stub(projectPreprocessor, "processTree").resolves(true);
	await normalizer.generateProjectTree({configPath: "newPath/config.json"});
	t.deepEqual(projectPreprocessorStub.getCall(0).args[0], {
		configPath: "newPath/config.json"
	}, "Process tree with config loaded from custom path");
	projectPreprocessorStub.restore();
	normalizer.generateDependencyTree.restore();
});

test("Error: Throws if unknown translator should be used as strategy", async (t) => {
	const translatorName = "notExistingTranslator";
	return normalizer.generateDependencyTree({
		translatorName
	}).catch((error) => {
		t.is(error.message, `Unknown translator ${translatorName}`);
	});
});
