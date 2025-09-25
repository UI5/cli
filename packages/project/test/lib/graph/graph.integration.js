import test from "ava";
import path from "node:path";
import sinonGlobal from "sinon";
import esmock from "esmock";
import Workspace from "../../../lib/graph/Workspace.js";
import CacheMode from "../../../lib/ui5Framework/maven/CacheMode.js";
const __dirname = import.meta.dirname;

const fixturesPath = path.join(__dirname, "..", "..", "fixtures");
const libraryHPath = path.join(fixturesPath, "library.h");

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.npmProviderConstructorStub = sinon.stub();
	class MockNpmProvider {
		constructor(params) {
			t.context.npmProviderConstructorStub(params);
		}
	}

	t.context.MockNpmProvider = MockNpmProvider;

	t.context.projectGraphBuilderStub = sinon.stub().resolves("graph");
	t.context.enrichProjectGraphStub = sinon.stub();
	t.context.graph = await esmock.p("../../../lib/graph/graph.js", {
		"../../../lib/graph/providers/NodePackageDependencies.js": t.context.MockNpmProvider,
		"../../../lib/graph/projectGraphBuilder.js": t.context.projectGraphBuilderStub,
		"../../../lib/graph/helpers/ui5Framework.js": {
			enrichProjectGraph: t.context.enrichProjectGraphStub
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	esmock.purge(t.context.graph);
});

test.serial("graphFromPackageDependencies with workspace object", async (t) => {
	const {
		npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceConfiguration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "default"
			},
			dependencyManagement: {
				resolutions: [{
					path: "resolution/path"
				}]
			}
		}
	});

	t.is(res, "graph");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.true(projectGraphBuilderStub.getCall(0).args[1] instanceof Workspace,
		"projectGraphBuilder got called with correct workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.is(enrichProjectGraphStub.getCall(0).args[1].versionOverride, "versionOverride",
		"enrichProjectGraph got called with correct versionOverride parameter");
	t.true(enrichProjectGraphStub.getCall(0).args[1].workspace instanceof Workspace,
		"enrichProjectGraph got called with correct workspace parameter");
});

test.serial("graphFromPackageDependencies with workspace object and workspace name", async (t) => {
	const {
		npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "dolphin",
		workspaceConfiguration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "dolphin"
			},
			dependencyManagement: {
				resolutions: [{
					path: "resolution/path"
				}]
			}
		}
	});

	t.is(res, "graph");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.true(projectGraphBuilderStub.getCall(0).args[1] instanceof Workspace,
		"projectGraphBuilder got called with correct workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.is(enrichProjectGraphStub.getCall(0).args[1].versionOverride, "versionOverride",
		"enrichProjectGraph got called with correct versionOverride parameter");
	t.true(enrichProjectGraphStub.getCall(0).args[1].workspace instanceof Workspace,
		"enrichProjectGraph got called with correct workspace parameter");
});

test.serial("graphFromPackageDependencies with workspace object not matching workspaceName", async (t) => {
	const {graphFromPackageDependencies} = t.context.graph;

	await t.throwsAsync(graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "other",
		workspaceConfiguration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "default"
			},
			dependencyManagement: {
				resolutions: [{
					path: "resolution/path"
				}]
			}
		}
	}), {
		message: "The provided workspace name 'other' does not match the provided workspace configuration 'default'"
	}, "Threw with expected error message");
});

test.serial("graphFromPackageDependencies with workspace file", async (t) => {
	const {
		npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: libraryHPath,
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "default",
	});

	t.is(res, "graph");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: libraryHPath,
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath"
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.true(projectGraphBuilderStub.getCall(0).args[1] instanceof Workspace,
		"projectGraphBuilder got called with correct workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.is(enrichProjectGraphStub.getCall(0).args[1].versionOverride, "versionOverride",
		"enrichProjectGraph got called with correct versionOverride parameter");
	t.true(enrichProjectGraphStub.getCall(0).args[1].workspace instanceof Workspace,
		"enrichProjectGraph got called with correct workspace parameter");
});

test.serial("graphFromPackageDependencies with workspace file at custom path", async (t) => {
	const {
		npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "default",
		workspaceConfigPath: path.join(libraryHPath, "ui5-workspace.yaml")
	});

	t.is(res, "graph");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath"
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.true(projectGraphBuilderStub.getCall(0).args[1] instanceof Workspace,
		"projectGraphBuilder got called with correct workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.is(enrichProjectGraphStub.getCall(0).args[1].versionOverride, "versionOverride",
		"enrichProjectGraph got called with correct versionOverride parameter");
	t.true(enrichProjectGraphStub.getCall(0).args[1].workspace instanceof Workspace,
		"enrichProjectGraph got called with correct workspace parameter");
});

test.serial("graphFromPackageDependencies with inactive workspace file at custom path", async (t) => {
	const {
		npmProviderConstructorStub,
		projectGraphBuilderStub, enrichProjectGraphStub, MockNpmProvider
	} = t.context;
	const {graphFromPackageDependencies} = t.context.graph;

	const res = await graphFromPackageDependencies({
		cwd: "cwd",
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath",
		versionOverride: "versionOverride",
		workspaceName: "default",
		workspaceConfigPath: path.join(libraryHPath, "custom-ui5-workspace.yaml"),
		cacheMode: CacheMode.Force
	});

	t.is(res, "graph");

	t.is(npmProviderConstructorStub.callCount, 1, "NPM provider constructor got called once");
	t.deepEqual(npmProviderConstructorStub.getCall(0).args[0], {
		cwd: path.join(__dirname, "..", "..", "..", "cwd"),
		rootConfiguration: "rootConfiguration",
		rootConfigPath: "/rootConfigPath"
	}, "Created NodePackageDependencies provider instance with correct parameters");

	t.is(projectGraphBuilderStub.callCount, 1, "projectGraphBuilder got called once");
	t.true(projectGraphBuilderStub.getCall(0).args[0] instanceof MockNpmProvider,
		"projectGraphBuilder got called with correct provider instance");
	t.is(projectGraphBuilderStub.getCall(0).args[1], null,
		"projectGraphBuilder got called with no workspace instance");

	t.is(enrichProjectGraphStub.callCount, 1, "enrichProjectGraph got called once");
	t.is(enrichProjectGraphStub.getCall(0).args[0], "graph",
		"enrichProjectGraph got called with graph");
	t.deepEqual(enrichProjectGraphStub.getCall(0).args[1], {
		versionOverride: "versionOverride",
		workspace: null,
		cacheMode: "Force"
	}, "enrichProjectGraph got called with correct options");
});
