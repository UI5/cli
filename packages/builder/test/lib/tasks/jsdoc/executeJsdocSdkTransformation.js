import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		info: sinon.stub()
	};

	t.context.ReaderCollectionPrioritizedStubClass = sinon.stub();
	t.context.fsInterfaceStub = sinon.stub().returns("custom fs");

	t.context.sdkTransformerStub = sinon.stub().resolves(["resource A", "resource B"]);

	t.context.executeJsdocSdkTransformation =
		await esmock("../../../../lib/tasks/jsdoc/executeJsdocSdkTransformation.js", {
			"@ui5/fs/ReaderCollectionPrioritized": t.context.ReaderCollectionPrioritizedStubClass,
			"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
			"@ui5/logger": {
				getLogger: sinon.stub().returns(t.context.log)
			},
			"../../../../lib/processors/jsdoc/sdkTransformer.js": t.context.sdkTransformerStub
		});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("executeJsdocSdkTransformation", async (t) => {
	const {
		sinon, executeJsdocSdkTransformation, ReaderCollectionPrioritizedStubClass,
		fsInterfaceStub, sdkTransformerStub
	} = t.context;

	const writeStub = sinon.stub().resolves();
	const byGlobWorkspaceStub = sinon.stub()
		.onFirstCall().resolves([{
			getPath: () => "workspace/api.json"
		}])
		.onSecondCall().resolves([{
			getPath: () => "workspace/.library"
		}]);
	const workspace = {
		write: writeStub,
		byGlob: byGlobWorkspaceStub
	};
	const byGlobDependenciesStub = sinon.stub().resolves()
		.resolves([{
			getPath: () => "depA/api.json"
		}, {
			getPath: () => "depB/api.json"
		}]);
	const dependencies = {
		byGlob: byGlobDependenciesStub
	};
	await executeJsdocSdkTransformation({
		workspace,
		dependencies,
		options: {
			projectName: "some.project",
			dotLibraryPattern: "some .library pattern"
		}
	});
	t.is(byGlobWorkspaceStub.callCount, 2, "workspace.byGlob got called twice");
	t.is(byGlobWorkspaceStub.getCall(0).args[0], "/test-resources/**/designtime/api.json",
		"first workspace.byGlob call with correct arguments");
	t.is(byGlobWorkspaceStub.getCall(1).args[0], "some .library pattern",
		"second workspace.byGlob call with correct arguments");

	t.is(byGlobDependenciesStub.callCount, 1, "dependencies.byGlob got called once");
	t.is(byGlobDependenciesStub.getCall(0).args[0], "/test-resources/**/designtime/api.json",
		"dependencies.byGlob got called with correct arguments");


	t.is(ReaderCollectionPrioritizedStubClass.callCount, 1);
	t.true(ReaderCollectionPrioritizedStubClass.calledWithNew());
	t.deepEqual(ReaderCollectionPrioritizedStubClass.getCall(0).args, [{
		name: "executeJsdocSdkTransformation - custom workspace + dependencies FS: some.project",
		readers: [workspace, dependencies]
	}], "ReaderCollectionPrioritized got called with the correct arguments");

	t.is(fsInterfaceStub.callCount, 1, "fsInterface got called once");
	t.true(fsInterfaceStub.getCall(0).args[0] instanceof ReaderCollectionPrioritizedStubClass,
		"fsInterface got called with an instance of ReaderCollectionPrioritizedStubClass");

	t.is(sdkTransformerStub.callCount, 1, "sdkTransformer processor got called once");
	t.deepEqual(sdkTransformerStub.getCall(0).args[0], {
		apiJsonPath: "workspace/api.json",
		dotLibraryPath: "workspace/.library",
		dependencyApiJsonPaths: [
			"depA/api.json",
			"depB/api.json"
		],
		targetApiJsonPath: "workspace/apiref/api.json",
		fs: "custom fs"
	}, "sdkTransformer got called with correct arguments");

	t.is(writeStub.callCount, 2, "Write got called twice");
	t.is(writeStub.getCall(0).args[0], "resource A", "Write got called with correct arguments");
	t.is(writeStub.getCall(1).args[0], "resource B", "Write got called with correct arguments");
});

test("executeJsdocSdkTransformation with missing parameters", async (t) => {
	const {executeJsdocSdkTransformation} = t.context;
	await t.throwsAsync(executeJsdocSdkTransformation(), {
		instanceOf: TypeError
	}, "TypeError thrown");
});

test.serial("executeJsdocSdkTransformation with missing project api.json (skips processing)", async (t) => {
	const {sinon, executeJsdocSdkTransformation, log} = t.context;

	const byGlobWorkspaceStub = sinon.stub()
		.onFirstCall().resolves([])
		.onSecondCall().resolves([{
			getPath: () => "workspace/.library"
		}]);
	const workspace = {
		byGlob: byGlobWorkspaceStub
	};
	const byGlobDependenciesStub = sinon.stub().resolves()
		.resolves([{
			getPath: () => "depA/api.json"
		}, {
			getPath: () => "depB/api.json"
		}]);
	const dependencies = {
		byGlob: byGlobDependenciesStub
	};

	await executeJsdocSdkTransformation({
		workspace,
		dependencies,
		options: {
			projectName: "some.project",
			dotLibraryPattern: "some .library pattern"
		}
	});

	t.is(log.info.callCount, 1, "One message has been logged");
	t.is(log.info.getCall(0).args[0],
		"Failed to locate api.json resource for project some.project. Skipping SDK Transformation...",
		"Correct message has been logged");
});

test("executeJsdocSdkTransformation too many project api.json resources", async (t) => {
	const {sinon, executeJsdocSdkTransformation} = t.context;
	const byGlobWorkspaceStub = sinon.stub()
		.onFirstCall().resolves([{
			getPath: () => "workspace/a/api.json"
		}, {
			getPath: () => "workspace/b/api.json"
		}])
		.onSecondCall().resolves([{
			getPath: () => "workspace/a/.library"
		}]);
	const workspace = {
		byGlob: byGlobWorkspaceStub
	};
	const byGlobDependenciesStub = sinon.stub().resolves()
		.resolves([{
			getPath: () => "depA/api.json"
		}, {
			getPath: () => "depB/api.json"
		}]);
	const dependencies = {
		byGlob: byGlobDependenciesStub
	};

	const error = await t.throwsAsync(executeJsdocSdkTransformation({
		workspace,
		dependencies,
		options: {
			projectName: "some.project",
			dotLibraryPattern: "some .library pattern"
		}
	}));
	t.is(error.message,
		"[executeJsdocSdkTransformation]: Found more than one api.json resources for project some.project.",
		"Correct error message thrown");
});

test("executeJsdocSdkTransformation missing project .library", async (t) => {
	const {sinon, executeJsdocSdkTransformation} = t.context;
	const byGlobWorkspaceStub = sinon.stub()
		.onFirstCall().resolves([{
			getPath: () => "workspace/api.json"
		}])
		.onSecondCall().resolves([]);
	const workspace = {
		byGlob: byGlobWorkspaceStub
	};
	const byGlobDependenciesStub = sinon.stub().resolves()
		.resolves([{
			getPath: () => "depA/api.json"
		}, {
			getPath: () => "depB/api.json"
		}]);
	const dependencies = {
		byGlob: byGlobDependenciesStub
	};

	const error = await t.throwsAsync(executeJsdocSdkTransformation({
		workspace,
		dependencies,
		options: {
			projectName: "some.project",
			dotLibraryPattern: "some .library pattern"
		}
	}));
	t.is(error.message,
		"[executeJsdocSdkTransformation]: Failed to locate .library resource for project some.project.",
		"Correct error message thrown");
});

test("executeJsdocSdkTransformation too many project .library resources", async (t) => {
	const {sinon, executeJsdocSdkTransformation} = t.context;
	const byGlobWorkspaceStub = sinon.stub()
		.onFirstCall().resolves([{
			getPath: () => "workspace/a/api.json"
		}])
		.onSecondCall().resolves([{
			getPath: () => "workspace/a/.library"
		}, {
			getPath: () => "workspace/b/.library"
		}]);
	const workspace = {
		byGlob: byGlobWorkspaceStub
	};
	const byGlobDependenciesStub = sinon.stub().resolves()
		.resolves([{
			getPath: () => "depA/api.json"
		}, {
			getPath: () => "depB/api.json"
		}]);
	const dependencies = {
		byGlob: byGlobDependenciesStub
	};

	const error = await t.throwsAsync(executeJsdocSdkTransformation({
		workspace,
		dependencies,
		options: {
			projectName: "some.project",
			dotLibraryPattern: "some .library pattern"
		}
	}));
	t.is(error.message,
		"[executeJsdocSdkTransformation]: Found more than one .library resources for project some.project.",
		"Correct error message thrown");
});
