const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.workspace = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves()
	};
	t.context.dependencies = {};
	t.context.comboByGlob = sinon.stub().resolves([]);

	t.context.ReaderCollectionPrioritizedStub = sinon.stub();
	t.context.ReaderCollectionPrioritizedStub.returns({
		byGlob: t.context.comboByGlob
	});
	mock("@ui5/fs", {
		ReaderCollectionPrioritized: t.context.ReaderCollectionPrioritizedStub
	});

	t.context.moduleBundlerStub = sinon.stub().resolves([{"fake": "resource"}]);
	mock("../../../../lib/processors/bundlers/moduleBundler", t.context.moduleBundlerStub);

	t.context.generateComponentPreload = mock.reRequire("../../../../lib/tasks/bundlers/generateComponentPreload");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test.serial("generateComponentPreload", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	comboByGlob.resolves(resources);

	await generateComponentPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"]
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".fragment.xml",
					".view.xml",
					".properties",
					".json",
				],
				name: "my/app/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app/",
							"!my/app/test/",
							"!my/app/*.html"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);

	t.is(comboByGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(comboByGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library}"],
		"combo.byGlob should have been called with expected pattern");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 1,
		"workspace.write should have been called once");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0]],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0],
		"workspace.write should have been called with exact resource returned by moduleBundler");
});
