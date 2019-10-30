const test = require("ava");
const sinon = require("sinon");
const normalizer = require("@ui5/project").normalizer;
const tree = require("../../../../lib/cli/commands/tree");
const treeify = require("treeify");

test.beforeEach((t) => {
	sinon.stub(normalizer, "generateProjectTree");
	sinon.stub(normalizer, "generateDependencyTree");
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("ui5 tree (generates dependency tree before output)", async (t) => {
	normalizer.generateDependencyTree.resolves({});
	await tree.handler({});
	t.is(normalizer.generateDependencyTree.called, true, "dependency tree output");
});

test.serial("ui5 tree --full (generates project tree before output)", async (t) => {
	normalizer.generateProjectTree.resolves({});
	await tree.handler({full: true});
	t.is(normalizer.generateProjectTree.called, true, "project tree output");
});

test.serial("ui5 tree --json (output tree in json)", async (t) => {
	const jsonStringifySpy = sinon.spy(JSON, "stringify");
	const consoleStub = sinon.stub(console, "log");

	normalizer.generateDependencyTree.resolves({name: "sample"});
	await tree.handler({json: true});

	// Note: Some versions of Node.js seem to call stringify internally during this test
	t.deepEqual(jsonStringifySpy.called, true, "Stringify got called at least once");
	t.deepEqual(jsonStringifySpy.getCall(jsonStringifySpy.callCount - 1).args[0], {name: "sample"},
		"JSON.stringify called with correct argument");
	t.deepEqual(consoleStub.callCount, 1, "console.log was called once");
	t.deepEqual(consoleStub.getCall(0).args[0], `{
    "name": "sample"
}`, "console.log was called with correct argument");
});

test.serial("ui5 tree (output tree)", async (t) => {
	const treeifySpy = sinon.stub(treeify, "asTree").returns("🌲");
	const consoleStub = sinon.stub(console, "log");
	normalizer.generateDependencyTree.resolves({name: "sample"});
	await tree.handler({});

	t.deepEqual(treeifySpy.callCount, 1, "Treeify called once");
	t.deepEqual(treeifySpy.getCall(0).args[0], {name: "sample"}, "Treeify called with correct argument");
	t.deepEqual(consoleStub.callCount, 1, "console.log was called once");
	t.deepEqual(consoleStub.getCall(0).args[0], "🌲", "console.log was called with correct argument");
});

test.serial("ui5 tree --dedupe=false (default)", async (t) => {
	normalizer.generateDependencyTree.resolves({});
	await tree.handler({dedupe: false});
	t.is(normalizer.generateDependencyTree.calledWithMatch({
		translatorOptions: {
			includeDeduped: true
		}
	}), true, "includeDeduped passed as expected");
});

test.serial("ui5 tree --dedupe=true", async (t) => {
	normalizer.generateDependencyTree.resolves({});
	await tree.handler({dedupe: true});
	t.is(normalizer.generateDependencyTree.calledWithMatch({
		translatorOptions: {
			includeDeduped: false
		}
	}), true, "includeDeduped passed as expected");
});

// test.serial("Error: throws on error during processing", async (t) => {
// 	normalizer.generateDependencyTree.rejects(new Error("Some error happened ..."));
// 	const processExitStub = sinon.stub(process, "exit");
// 	t.is(processExitStub.getCall(0).args[0], 1, "killed process on error using process.exit(1)");
// 	processExitStub.restore();
// });
