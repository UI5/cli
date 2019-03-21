const {test} = require("ava");
const sinon = require("sinon");
const ui5Fs = require("@ui5/fs");

const mock = require("mock-require");

const generateApiIndex = require("../../../../lib/tasks/jsdoc/generateApiIndex");

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("generateApiIndex", async (t) => {
	const apiIndexGeneratorStub = sinon.stub().resolves(["resource A", "resource B"]);
	const fsInterfaceStub = sinon.stub(ui5Fs, "fsInterface").returns("custom fs");
	mock("../../../../lib/processors/jsdoc/apiIndexGenerator", apiIndexGeneratorStub);

	class ReaderCollectionPrioritizedStubClass {
		constructor(parameters) {
			t.deepEqual(parameters, {
				name: "generateApiIndex - workspace + dependencies: some.project",
				readers: [workspace, dependencies]
			}, "ReaderCollectionPrioritized got called with the correct arguments");
		}
	}
	const readerCollectionPrioritizedStub = ReaderCollectionPrioritizedStubClass;
	const readerCollectionPrioritizedOrig = ui5Fs.ReaderCollectionPrioritized;
	ui5Fs.ReaderCollectionPrioritized = readerCollectionPrioritizedStub;
	const generateApiIndex = mock.reRequire("../../../../lib/tasks/jsdoc/generateApiIndex");
	ui5Fs.ReaderCollectionPrioritized = readerCollectionPrioritizedOrig;

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

	t.deepEqual(fsInterfaceStub.callCount, 1, "fsInterface got called once");
	t.true(fsInterfaceStub.getCall(0).args[0] instanceof ReaderCollectionPrioritizedStubClass,
		"fsInterface got called with an instance of ReaderCollectionPrioritizedStubClass");

	t.deepEqual(apiIndexGeneratorStub.callCount, 1, "apiIndexGenerator processor got called once");
	t.deepEqual(apiIndexGeneratorStub.getCall(0).args[0], {
		versionInfoPath: "/resources/sap-ui-version.json",
		testResourcesRootPath: "/test-resources",
		targetApiIndexPath: "/docs/api/api-index.json",
		targetApiIndexDeprecatedPath: "/docs/api/api-index-deprecated.json",
		targetApiIndexExperimentalPath: "/docs/api/api-index-experimental.json",
		targetApiIndexSincePath: "/docs/api/api-index-since.json",
		fs: "custom fs"
	}, "apiIndexGenerator got called with correct arguments");

	t.deepEqual(writeStub.callCount, 2, "Write got called twice");
	t.deepEqual(writeStub.getCall(0).args[0], "resource A", "Write got called with correct arguments");
	t.deepEqual(writeStub.getCall(1).args[0], "resource B", "Write got called with correct arguments");

	mock.stop("../../../../lib/processors/jsdoc/apiIndexGenerator");

	sinon.restore();
	mock.reRequire("../../../../lib/tasks/jsdoc/generateApiIndex");
});

test("generateApiIndex with missing parameters", async (t) => {
	const error = await t.throws(generateApiIndex());
	t.deepEqual(error.message, "[generateApiIndex]: One or more mandatory options not provided",
		"Correct error message thrown");
});
