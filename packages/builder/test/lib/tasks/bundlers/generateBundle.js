const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.log = {
		warn: sinon.stub(),
		verbose: sinon.stub(),
		error: sinon.stub()
	};

	t.context.taskUtil = {
		getTag: sinon.stub(),
		setTag: sinon.stub(),
		clearTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		}
	};

	t.context.workspace = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves()
	};
	t.context.dependencies = {};
	t.context.combo = {
		byGlob: sinon.stub().resolves([]),
		filter: sinon.stub()
	};

	t.context.ReaderCollectionPrioritizedStub = sinon.stub();
	t.context.ReaderCollectionPrioritizedStub.returns(t.context.combo);
	mock("@ui5/fs", {
		ReaderCollectionPrioritized: t.context.ReaderCollectionPrioritizedStub
	});

	t.context.moduleBundlerStub = sinon.stub().resolves([]);
	mock("../../../../lib/processors/bundlers/moduleBundler", t.context.moduleBundlerStub);

	t.context.generateBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateBundle");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test.serial("generateBundle: No taskUtil, no bundleOptions", async (t) => {
	const {
		generateBundle, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, combo
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	combo.byGlob.resolves(resources);

	moduleBundlerStub.resolves([
		{
			name: "my/app/customBundle.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	// bundleDefinition can be empty here as the moduleBundler is mocked
	const bundleDefinition = {};

	await generateBundle({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			bundleDefinition
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition,
			bundleOptions: undefined,
			moduleNameMapping: {}
		},
		resources
	}]);

	t.is(combo.byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(combo.byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	t.is(combo.filter.callCount, 0,
		"combo.filter should not have been called");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

test.serial("generateBundle: No bundleOptions, with taskUtil", async (t) => {
	const {
		generateBundle, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, combo,
		taskUtil
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];

	const filteredCombo = {
		byGlob: sinon.stub().resolves(resources)
	};
	combo.filter.returns(filteredCombo);

	moduleBundlerStub.resolves([
		{
			name: "my/app/customBundle.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	// bundleDefinition can be empty here as the moduleBundler is mocked
	const bundleDefinition = {};

	await generateBundle({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "Test Application",
			bundleDefinition
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition,
			bundleOptions: undefined,
			moduleNameMapping: {}
		},
		resources
	}]);

	t.is(combo.byGlob.callCount, 0,
		"combo.byGlob should not have been called");

	t.is(combo.filter.callCount, 1,
		"combo.filter should have been called once");
	t.is(combo.filter.getCall(0).args.length, 1,
		"combo.filter should have been called with one argument");
	t.is(typeof combo.filter.getCall(0).args[0], "function",
		"combo.filter should have been called with a function");

	t.is(filteredCombo.byGlob.callCount, 1,
		"filteredCombo.byGlob should have been called once");
	t.deepEqual(filteredCombo.byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"filteredCombo.byGlob should have been called with expected pattern");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

test.serial("generateBundle: bundleOptions: optimize=false, with taskUtil", async (t) => {
	const {
		generateBundle, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, combo,
		taskUtil
	} = t.context;

	const resources = [
		{
			getPath: sinon.stub().returns("/resources/my/app/module-dbg.js")
		},
		{
			getPath: sinon.stub().returns("/resources/my/app/Main.view.xml")
		}
	];

	const filteredCombo = {
		byGlob: sinon.stub().resolves(resources)
	};
	combo.filter.returns(filteredCombo);

	taskUtil.getTag.returns(false)
		.withArgs("/resources/my/app/module-dbg.js", taskUtil.STANDARD_TAGS.IsDebugVariant)
		.returns(true);

	moduleBundlerStub.resolves([
		{
			name: "my/app/customBundle.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	// bundleDefinition can be empty here as the moduleBundler is mocked
	const bundleDefinition = {};
	const bundleOptions = {optimize: false};

	await generateBundle({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "Test Application",
			bundleDefinition,
			bundleOptions
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition,
			bundleOptions,
			moduleNameMapping: {
				"/resources/my/app/module-dbg.js": "my/app/module.js"
			}
		},
		resources
	}]);

	t.is(combo.byGlob.callCount, 0,
		"combo.byGlob should not have been called");

	t.is(combo.filter.callCount, 1,
		"combo.filter should have been called once");
	t.is(combo.filter.getCall(0).args.length, 1,
		"combo.filter should have been called with one argument");
	t.is(typeof combo.filter.getCall(0).args[0], "function",
		"combo.filter should have been called with a function");

	t.is(filteredCombo.byGlob.callCount, 1,
		"filteredCombo.byGlob should have been called once");
	t.deepEqual(filteredCombo.byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"filteredCombo.byGlob should have been called with expected pattern");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

// TODO: Test filter function (optimize true/false)

// TODO: Empty bundle ([undefined]). skipIfEmpty?!
