import test from "ava";
import {fileURLToPath} from "node:url";
import path from "node:path";
import sinonGlobal from "sinon";
import esmock from "esmock";
import CacheMode from "../../../lib/ui5Framework/maven/CacheMode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "..", "fixtures");

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.npmProviderConstructorStub = sinon.stub();
	class MockNpmProvider {
		constructor(params) {
			t.context.npmProviderConstructorStub(params);
		}
	}
	t.context.createWorkspaceStub = sinon.stub().returns("workspace");

	t.context.MockNpmProvider = MockNpmProvider;

	t.context.dependencyTreeProviderStub = sinon.stub();
	class DummyDependencyTreeProvider {
		constructor(params) {
			t.context.dependencyTreeProviderStub(params);
		}
	}
	t.context.DummyDependencyTreeProvider = DummyDependencyTreeProvider;

	t.context.projectGraphBuilderStub = sinon.stub().resolves("graph");
	t.context.enrichProjectGraphStub = sinon.stub();
	t.context.graph = await esmock.p("../../../lib/graph/graph.js", {
		"../../../lib/graph/providers/NodePackageDependencies.js": t.context.MockNpmProvider,
		"../../../lib/graph/providers/DependencyTree.js": t.context.DummyDependencyTreeProvider,
		"../../../lib/graph/helpers/createWorkspace.js": t.context.createWorkspaceStub,
		"../../../lib/graph/projectGraphBuilder.js": t.context.projectGraphBuilderStub,
		"../../../lib/graph/helpers/ui5Framework.js": {
			"enrichProjectGraph": t.context.enrichProjectGraphStub
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	esmock.purge(t.context.graph);
});

test.serial("graphFromPackageDependencies", async (t) => {
	const {
		createWorkspaceStub, npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		cacheMode: CacheMode.Off
	});

	t.is(res, "graph");

	t.is(createWorkspaceStub.callCount, 0, "createWorkspace did not get called");
	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath"
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.is(projectGraphBuilderStub.getCall(0).args[1], undefined,
		"projectGraphBuilder got called with an empty workspace");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride",
		workspace: undefined,
		cacheMode: "Off"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("graphFromPackageDependencies with workspace name", async (t) => {
	const {
		createWorkspaceStub, npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "dolphin",
		cacheMode: CacheMode.Off
	});

	t.is(res, "graph");

	t.is(createWorkspaceStub.callCount, 1, "createWorkspace got called once");
	t.deepEqual(createWorkspaceStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		name: "dolphin",
		configPath: "ui5-workspace.yaml",
		configObject: undefined,
	}, "createWorkspace called with correct parameters");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.is(projectGraphBuilderStub.getCall(0).args[1], "workspace",
		"projectGraphBuilder got called with correct workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride",
		workspace: "workspace",
		cacheMode: "Off"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("graphFromPackageDependencies with workspace object", async (t) => {
	const {
		createWorkspaceStub
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceConfiguration: "workspaceConfiguration"
	});

	t.is(res, "graph");

	t.is(createWorkspaceStub.callCount, 1, "createWorkspace got called once");
	t.deepEqual(createWorkspaceStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		configPath: "ui5-workspace.yaml",
		name: undefined,
		configObject: "workspaceConfiguration"
	}, "createWorkspace called with correct parameters");
});

test.serial("graphFromPackageDependencies with workspace object and workspace name", async (t) => {
	const {
		createWorkspaceStub
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "dolphin",
		workspaceConfiguration: "workspaceConfiguration"
	});

	t.is(res, "graph");

	t.is(createWorkspaceStub.callCount, 1, "createWorkspace got called once");
	t.deepEqual(createWorkspaceStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		name: "dolphin",
		configPath: "ui5-workspace.yaml",
		configObject: "workspaceConfiguration"
	}, "createWorkspace called with correct parameters");
});

test.serial("graphFromPackageDependencies with workspace path and workspace name", async (t) => {
	const {
		createWorkspaceStub
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "dolphin",
		workspaceConfigPath: "workspaceConfigurationPath"
	});

	t.is(res, "graph");

	t.is(createWorkspaceStub.callCount, 1, "createWorkspace got called once");
	t.deepEqual(createWorkspaceStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		name: "dolphin",
		configPath: "workspaceConfigurationPath",
		configObject: undefined
	}, "createWorkspace called with correct parameters");
});

test.serial("graphFromPackageDependencies with empty workspace", async (t) => {
	const {
		createWorkspaceStub, npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	// Simulate no workspace config found
	createWorkspaceStub.resolves(null);

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "dolphin",
		cacheMode: CacheMode.Off
	});

	t.is(res, "graph");

	t.is(createWorkspaceStub.callCount, 1, "createWorkspace got called once");
	t.deepEqual(createWorkspaceStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		name: "dolphin",
		configPath: "ui5-workspace.yaml",
		configObject: undefined,
	}, "createWorkspace called with correct parameters");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.is(projectGraphBuilderStub.getCall(0).args[1], null,
		"projectGraphBuilder got called with correct workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride",
		workspace: null,
		cacheMode: "Off"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("graphFromPackageDependencies: Do not resolve framework dependencies", async (t) => {
	const {enrichProjectGraphStub} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		resolveFrameworkDependencies: false
	});

	t.is(res, "graph");
	t.is(enrichProjectGraphStub.callCount, 0, "enrichProjectGraph did not get called");
});

test.serial("graphFromStaticFile", async (t) => {
	const {
		dependencyTreeProviderStub,
		projectGraphBuilderStub, enrichProjectGraphStub, DummyDependencyTreeProvider
	} = t.context;
	const {graphFromStaticFile} = t.context.graph;

	const readDependencyConfigFileStub = t.context.sinon.stub(graphFromStaticFile._utils, "readDependencyConfigFile")
		.resolves("dependencyTree");

	const res = await graphFromStaticFile({
		cwd: "cwd",
		filePath: "file/path",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		cacheMode: CacheMode.Off
	});

	t.is(res, "graph");

	t.is(readDependencyConfigFileStub.callCount, 1, "_readDependencyConfigFile got called once");
	t.is(readDependencyConfigFileStub.getCall(0).args[0], path.join(__dirname, "..", "..", "..", "cwd"),
		"_readDependencyConfigFile got called with correct directory");
	t.is(readDependencyConfigFileStub.getCall(0).args[1], "file/path",
		"_readDependencyConfigFile got called with correct file path");

	t.is(dependencyTreeProviderStub.callCount, 1, "DependencyTree provider constructor got called once");
	t.deepEqual(dependencyTreeProviderStub.getCall(0).args[0], {
		dependencyTree: "dependencyTree",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof DummyDependencyTreeProvider,
		"projectGraphBuilder got called with correct provider instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride",
		cacheMode: "Off"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("graphFromStaticFile: Do not resolve framework dependencies", async (t) => {
	const {enrichProjectGraphStub} = t.context;
	const {graphFromStaticFile} = t.context.graph;

	t.context.sinon.stub(graphFromStaticFile._utils, "readDependencyConfigFile")
		.resolves("dependencyTree");

	const res = await graphFromStaticFile({
		cwd: "cwd",
		filePath: "filePath",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		resolveFrameworkDependencies: false
	});

	t.is(res, "graph");
	t.is(enrichProjectGraphStub.callCount, 0, "enrichProjectGraph did not get called");
});

test.serial("usingObject", async (t) => {
	const {
		dependencyTreeProviderStub,
		projectGraphBuilderStub, enrichProjectGraphStub, DummyDependencyTreeProvider
	} = t.context;
	const {graphFromObject} = t.context.graph;

	const res = await graphFromObject({
		dependencyTree: "dependencyTree",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		cacheMode: "Off"
	});

	t.is(res, "graph");

	t.is(dependencyTreeProviderStub.callCount, 1, "DependencyTree provider constructor got called once");
	t.deepEqual(dependencyTreeProviderStub.getCall(0).args[0], {
		dependencyTree: "dependencyTree",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof DummyDependencyTreeProvider,
		"projectGraphBuilder got called with correct provider instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride",
		cacheMode: "Off"
	}, "enrichProjectGraph got called with correct options");
});

test.serial("usingObject: Do not resolve framework dependencies", async (t) => {
	const {enrichProjectGraphStub} = t.context;
	const {graphFromObject} = t.context.graph;
	const res = await graphFromObject({
		cwd: "cwd",
		filePath: "filePath",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		resolveFrameworkDependencies: false
	});

	t.is(res, "graph");
	t.is(enrichProjectGraphStub.callCount, 0, "enrichProjectGraph did not get called");
});

test.serial("utils: readDependencyConfigFile", async (t) => {
	const {graphFromStaticFile} = t.context.graph;
	const res = await graphFromStaticFile._utils.readDependencyConfigFile(
		path.join(fixturesPath, "application.h"), "projectDependencies.yaml");

	t.deepEqual(res, {
		id: "static-application.a",
		path: path.join(fixturesPath, "application.a"),
		version: "0.0.1",
		dependencies: [{
			id: "static-library.e",
			path: path.join(fixturesPath, "library.e"),
			version: "0.0.1",
		}],
	}, "Returned correct file content");
});

