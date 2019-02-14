const {test} = require("ava");
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
	normalizer.generateDependencyTree.resolves({name: "sample"});
	await tree.handler({json: true});
	t.is(JSON.stringify.called, true, "retrieves dependency tree as json");
	jsonStringifySpy.restore();
});

test.serial("ui5 tree (output tree)", async (t) => {
	const treeifySpy = sinon.spy(treeify, "asTree");
	normalizer.generateDependencyTree.resolves({name: "sample"});
	await tree.handler({});
	t.is(treeify.asTree.called, true, "retrieves dependency tree using treeify");
	treeifySpy.restore();
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
