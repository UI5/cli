import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.ReaderCollectionPrioritizedStubClass = sinon.stub();
	t.context.fsInterfaceStub = sinon.stub().returns("custom fs");

	t.context.apiIndexGeneratorStub = sinon.stub().resolves(["resource A", "resource B"]);

	t.context.generateApiIndex = await esmock("../../../../lib/tasks/jsdoc/generateApiIndex.js", {
		"@ui5/fs/ReaderCollectionPrioritized": t.context.ReaderCollectionPrioritizedStubClass,
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"../../../../lib/processors/jsdoc/apiIndexGenerator": t.context.apiIndexGeneratorStub
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("generateApiIndex", async (t) => {
	const {
		sinon, generateApiIndex, apiIndexGeneratorStub,
		ReaderCollectionPrioritizedStubClass, fsInterfaceStub
	} = t.context;

	const writeStub = sinon.stub().resolves();
	const workspace = {
		write: writeStub
	};
	const dependencies = {};
	await generateApiIndex({
		workspace,
		dependencies,
		options: {
			projectName: "some.project"
		}
	});

	t.is(ReaderCollectionPrioritizedStubClass.callCount, 1);
	t.true(ReaderCollectionPrioritizedStubClass.calledWithNew());
	t.deepEqual(ReaderCollectionPrioritizedStubClass.getCall(0).args, [{
		name: "generateApiIndex - workspace + dependencies: some.project",
		readers: [workspace, dependencies]
	}], "ReaderCollectionPrioritized got called with the correct arguments");

	t.is(fsInterfaceStub.callCount, 1, "fsInterface got called once");
	t.true(fsInterfaceStub.getCall(0).args[0] instanceof ReaderCollectionPrioritizedStubClass,
		"fsInterface got called with an instance of ReaderCollectionPrioritizedStubClass");

	t.is(apiIndexGeneratorStub.callCount, 1, "apiIndexGenerator processor got called once");
	t.deepEqual(apiIndexGeneratorStub.getCall(0).args[0], {
		versionInfoPath: "/resources/sap-ui-version.json",
		testResourcesRootPath: "/test-resources",
		targetApiIndexPath: "/docs/api/api-index.json",
		targetApiIndexDeprecatedPath: "/docs/api/api-index-deprecated.json",
		targetApiIndexExperimentalPath: "/docs/api/api-index-experimental.json",
		targetApiIndexSincePath: "/docs/api/api-index-since.json",
		fs: "custom fs"
	}, "apiIndexGenerator got called with correct arguments");

	t.is(writeStub.callCount, 2, "Write got called twice");
	t.is(writeStub.getCall(0).args[0], "resource A", "Write got called with correct arguments");
	t.is(writeStub.getCall(1).args[0], "resource B", "Write got called with correct arguments");
});

test("generateApiIndex with missing parameters", async (t) => {
	const {generateApiIndex} = t.context;
	await t.throwsAsync(generateApiIndex(), {
		instanceOf: TypeError
	}, "TypeError thrown");
});
