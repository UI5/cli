import test from "ava";
import {fileURLToPath} from "node:url";
import path from "node:path";
import sinonGlobal from "sinon";
import esmock from "esmock";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "..", "..", "fixtures");
const libraryHPath = path.join(fixturesPath, "library.h");

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.workspaceConstructorStub = sinon.stub();
	class MockWorkspace {
		constructor(params) {
			t.context.workspaceConstructorStub(params);
		}
	}
	t.context.MockWorkspace = MockWorkspace;

	t.context.createWorkspace = await esmock.p("../../../../lib/graph/helpers/createWorkspace", {
		"../../../../lib/graph/Workspace.js": t.context.MockWorkspace
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("createWorkspace: Missing parameter 'configObject' or 'configPath'", async (t) => {
	const {createWorkspace} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		cwd: "cwd",
	}));
	t.is(err.message, "createWorkspace: Missing parameter 'cwd', 'configObject' or 'configPath'",
		"Threw with expected error message");
});

test("createWorkspace: Missing parameter 'cwd'", async (t) => {
	const {createWorkspace} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		configPath: path.join(libraryHPath, "invalid-ui5-workspace.yaml")
	}));
	t.is(err.message, "createWorkspace: Missing parameter 'cwd', 'configObject' or 'configPath'",
		"Threw with expected error message");
});

test("createWorkspace: Missing parameter 'name' if 'configPath' is set", async (t) => {
	const {createWorkspace} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		cwd: "cwd",
		configPath: path.join(libraryHPath, "invalid-ui5-workspace.yaml")
	}));
	t.is(err.message, "createWorkspace: Parameter 'configPath' implies parameter 'name', but it's empty",
		"Threw with expected error message");
});

test("createWorkspace: Using object", async (t) => {
	const {
		workspaceConstructorStub,
		MockWorkspace,
		createWorkspace
	} = t.context;

	const res = await createWorkspace({
		cwd: "cwd",
		configObject: {
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

	t.true(res instanceof MockWorkspace, "Returned instance of Workspace");

	t.is(workspaceConstructorStub.callCount, 1, "Workspace constructor got called once");
	t.deepEqual(workspaceConstructorStub.getCall(0).args[0], {
		cwd: "cwd",
		configuration: {
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
	}, "Created Workspace instance with correct parameters");
});

test("createWorkspace: Using invalid object", async (t) => {
	const {createWorkspace} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		cwd: "cwd",
		configObject: {
			dependencyManagement: {
				resolutions: [{
					path: "resolution/path"
				}]
			}
		}
	}));
	t.is(err.message, "Invalid workspace configuration: Missing or empty property 'metadata.name'",
		"Threw with validation error");
});

test("createWorkspace: Using file", async (t) => {
	const {createWorkspace, MockWorkspace, workspaceConstructorStub} = t.context;

	const res = await createWorkspace({
		cwd: "cwd",
		name: "default",
		configPath: path.join(libraryHPath, "ui5-workspace.yaml")
	});

	t.true(res instanceof MockWorkspace, "Returned instance of Workspace");

	t.is(workspaceConstructorStub.callCount, 1, "Workspace constructor got called once");
	t.deepEqual(workspaceConstructorStub.getCall(0).args[0], {
		cwd: libraryHPath,
		configuration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "default"
			},
			dependencyManagement: {
				resolutions: [{
					path: "../library.d"
				}]
			}
		}
	}, "Created Workspace instance with correct parameters");
});

test("createWorkspace: Using invalid file", async (t) => {
	const {createWorkspace} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		cwd: "cwd",
		name: "default",
		configPath: path.join(libraryHPath, "invalid-ui5-workspace.yaml")
	}));

	t.true(err.message.includes("Invalid workspace configuration"), "Threw with validation error");
});

test("createWorkspace: Using missing file", async (t) => {
	const {createWorkspace, workspaceConstructorStub} = t.context;

	const res = await createWorkspace({
		cwd: path.join(fixturesPath, "library.d"),
		name: "default",
		configPath: "ui5-workspace.yaml"
	});

	t.is(res, null, "Returned no workspace");

	t.is(workspaceConstructorStub.callCount, 0, "Workspace constructor did not get called");
});

test("createWorkspace: Using missing file and non-default name", async (t) => {
	const {createWorkspace, workspaceConstructorStub} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		cwd: path.join(fixturesPath, "library.d"),
		name: "special",
		configPath: "ui5-workspace.yaml"
	}));

	const filePath = path.join(fixturesPath, "library.d", "ui5-workspace.yaml");
	t.true(err.message.startsWith(
		`Failed to load workspace configuration from path ${filePath}: `), "Threw with expected error message");

	t.is(workspaceConstructorStub.callCount, 0, "Workspace constructor did not get called");
});

test("createWorkspace: Using non-default file and non-default name", async (t) => {
	const {createWorkspace, workspaceConstructorStub, MockWorkspace} = t.context;

	const res = await createWorkspace({
		cwd: path.join(fixturesPath, "library.h"),
		name: "library-d",
		configPath: "custom-ui5-workspace.yaml"
	});

	t.true(res instanceof MockWorkspace, "Returned instance of Workspace");

	t.is(workspaceConstructorStub.callCount, 1, "Workspace constructor got called once");
	t.deepEqual(workspaceConstructorStub.getCall(0).args[0], {
		cwd: libraryHPath,
		configuration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "library-d"
			},
			dependencyManagement: {
				resolutions: [{
					path: "../library.d"
				}]
			}
		}
	}, "Created Workspace instance with correct parameters");
});

test("createWorkspace: Using non-default file and non-default name which is not in file", async (t) => {
	const {createWorkspace, workspaceConstructorStub} = t.context;

	const err = await t.throwsAsync(createWorkspace({
		cwd: path.join(fixturesPath, "library.h"),
		name: "special",
		configPath: "custom-ui5-workspace.yaml"
	}));

	t.is(err.message, `Could not find a workspace named 'special' in custom-ui5-workspace.yaml`,
		"Threw with expected error message");

	t.is(workspaceConstructorStub.callCount, 0, "Workspace constructor did not get called");
});

test("readWorkspaceConfigFile", async (t) => {
	const {createWorkspace} = t.context;
	const res = await createWorkspace._readWorkspaceConfigFile(
		path.join(libraryHPath, "ui5-workspace.yaml"), false);
	t.deepEqual(res,
		[{
			specVersion: "workspace/1.0",
			metadata: {
				name: "default",
			},
			dependencyManagement: {
				resolutions: [{
					path: "../library.d",
				}]
			},
		}, {
			specVersion: "workspace/1.0",
			metadata: {
				name: "all-libraries",
			},
			dependencyManagement: {
				resolutions: [{
					path: "../library.d",
				}, {
					path: "../library.e",
				}, {
					path: "../library.f",
				}],
			},
		}], "Read workspace configuration file correctly");
});

test("readWorkspaceConfigFile: Throws for missing file", async (t) => {
	const {createWorkspace} = t.context;
	const filePath = path.join(fixturesPath, "library.d", "other-ui5-workspace.yaml");
	const err =
		await t.throwsAsync(createWorkspace._readWorkspaceConfigFile(filePath));
	t.true(err.message.startsWith(
		`Failed to load workspace configuration from path ${filePath}: `), "Threw with expected error message");
});

test("readWorkspaceConfigFile: Validation errors", async (t) => {
	const {createWorkspace} = t.context;
	const filePath = path.join(libraryHPath, "invalid-ui5-workspace.yaml");
	const err =
		await t.throwsAsync(createWorkspace._readWorkspaceConfigFile(filePath, true));
	t.true(err.message.includes("Invalid workspace configuration"), "Threw with validation error");
});

test("readWorkspaceConfigFile: Not a YAML", async (t) => {
	const {createWorkspace} = t.context;
	const filePath = path.join(libraryHPath, "corrupt-ui5-workspace.yaml");
	const err =
		await t.throwsAsync(createWorkspace._readWorkspaceConfigFile(filePath, true));
	t.true(err.message.includes(`Failed to parse workspace configuration at ${filePath}`),
		"Threw with parsing error");
});

test("readWorkspaceConfigFile: Empty file", async (t) => {
	const {createWorkspace} = t.context;
	const filePath = path.join(libraryHPath, "empty-ui5-workspace.yaml");
	const res = await createWorkspace._readWorkspaceConfigFile(filePath, true);
	t.deepEqual(res, [], "No workspace configuration returned");
});
