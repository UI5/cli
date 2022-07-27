const test = require("ava");
const path = require("path");
const sinonGlobal = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.npmProviderConstructorStub = sinon.stub();
	class DummyNpmProvider {
		constructor(params) {
			t.context.npmProviderConstructorStub(params);
		}
	}
	t.context.DummyNpmProvider = DummyNpmProvider;
	mock("../../lib/graph/providers/NodePackageDependencies", DummyNpmProvider);

	t.context.dependencyTreeProviderStub = sinon.stub();
	class DummyDependencyTreeProvider {
		constructor(params) {
			t.context.dependencyTreeProviderStub(params);
		}
	}
	t.context.DummyDependencyTreeProvider = DummyDependencyTreeProvider;
	mock("../../lib/graph/providers/DependencyTree", DummyDependencyTreeProvider);

	t.context.projectGraphBuilderStub = sinon.stub().resolves("graph");
	mock("../../lib/graph/projectGraphBuilder", t.context.projectGraphBuilderStub);

	const ui5Framework = require("../../lib/graph/helpers/ui5Framework");
	t.context.enrichProjectGraphStub = sinon.stub(ui5Framework, "enrichProjectGraph");

	t.context.generateProjectGraph = mock.reRequire("../../lib/generateProjectGraph");
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	mock.stopAll();
});

test.serial("usingNodePackageDependencies", async (t) => {
	const {
		generateProjectGraph, npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, DummyNpmProvider
	} = t.context;

	const res = await generateProjectGraph.usingNodePackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
		versionOverride: "versionOverride"
	});

	t.is(res, "graph");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof DummyNpmProvider,
		"projectGraphBuilder got called with correct provider instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("usingNodePackageDependencies: Do not resolve framework dependencies", async (t) => {
	const {generateProjectGraph, enrichProjectGraphStub} = t.context;

	const res = await generateProjectGraph.usingNodePackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
		versionOverride: "versionOverride",
		resolveFrameworkDependencies: false
	});

	t.is(res, "graph");
	t.is(enrichProjectGraphStub.callCount, 0, "enrichProjectGraph did not get called");
});

test.serial("usingStaticFile", async (t) => {
	const {
		generateProjectGraph, dependencyTreeProviderStub,
		projectGraphBuilderStub, enrichProjectGraphStub, DummyDependencyTreeProvider
	} = t.context;

	const readDependencyConfigFileStub = t.context.sinon.stub(generateProjectGraph, "_readDependencyConfigFile")
		.resolves("dependencyTree");

	const res = await generateProjectGraph.usingStaticFile({
		cwd: "cwd",
		filePath: "file/path",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
		versionOverride: "versionOverride"
	});

	t.is(res, "graph");

	t.is(readDependencyConfigFileStub.callCount, 1, "_readDependencyConfigFile got called once");
	t.is(readDependencyConfigFileStub.getCall(0).args[0], path.join(__dirname, "..", "..", "cwd"),
		"_readDependencyConfigFile got called with correct directory");
	t.is(readDependencyConfigFileStub.getCall(0).args[1], "file/path",
		"_readDependencyConfigFile got called with correct file path");

	t.is(dependencyTreeProviderStub.callCount, 1, "DependencyTree provider constructor got called once");
	t.deepEqual(dependencyTreeProviderStub.getCall(0).args[0], {
		dependencyTree: "dependencyTree",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof DummyDependencyTreeProvider,
		"projectGraphBuilder got called with correct provider instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("usingStaticFile: Do not resolve framework dependencies", async (t) => {
	const {generateProjectGraph, enrichProjectGraphStub} = t.context;

	t.context.sinon.stub(generateProjectGraph, "_readDependencyConfigFile")
		.resolves("dependencyTree");

	const res = await generateProjectGraph.usingStaticFile({
		cwd: "cwd",
		filePath: "filePath",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
		versionOverride: "versionOverride",
		resolveFrameworkDependencies: false
	});

	t.is(res, "graph");
	t.is(enrichProjectGraphStub.callCount, 0, "enrichProjectGraph did not get called");
});

test.serial("usingObject", async (t) => {
	const {
		generateProjectGraph, dependencyTreeProviderStub,
		projectGraphBuilderStub, enrichProjectGraphStub, DummyDependencyTreeProvider
	} = t.context;

	const res = await generateProjectGraph.usingObject({
		dependencyTree: "dependencyTree",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
		versionOverride: "versionOverride"
	});

	t.is(res, "graph");

	t.is(dependencyTreeProviderStub.callCount, 1, "DependencyTree provider constructor got called once");
	t.deepEqual(dependencyTreeProviderStub.getCall(0).args[0], {
		dependencyTree: "dependencyTree",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof DummyDependencyTreeProvider,
		"projectGraphBuilder got called with correct provider instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("usingObject: Do not resolve framework dependencies", async (t) => {
	const {generateProjectGraph, enrichProjectGraphStub} = t.context;
	const res = await generateProjectGraph.usingObject({
		cwd: "cwd",
		filePath: "filePath",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "rootConfigPath",
		versionOverride: "versionOverride",
		resolveFrameworkDependencies: false
	});

	t.is(res, "graph");
	t.is(enrichProjectGraphStub.callCount, 0, "enrichProjectGraph did not get called");
});
