import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import crypto from "node:crypto";

function noop() {}
function emptyarray() {
	return [];
}

// Returns a project mock that satisfies the inputs of the standard build
// definitions (application, library, theme-library, ...). The build definitions
// access many project properties; we only stub what's needed for them to load
// without throwing.
function getMockProject(type) {
	return {
		getName: () => "project.b",
		getNamespace: () => "project/b",
		getType: () => type,
		getPropertiesFileSourceEncoding: noop,
		getCopyright: noop,
		getVersion: noop,
		getMinificationExcludes: emptyarray,
		getJsdocExcludes: emptyarray,
		getSpecVersion: () => {
			return {
				gte: () => false,
				lt: () => false
			};
		},
		getComponentPreloadPaths: emptyarray,
		getComponentPreloadNamespaces: emptyarray,
		getComponentPreloadExcludes: emptyarray,
		getLibraryPreloadExcludes: emptyarray,
		getBundles: emptyarray,
		getCachebusterSignatureType: noop,
		getCustomTasks: emptyarray,
		isFrameworkProject: () => false,
	};
}

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	// taskUtil exposes both an internal API (used by build definitions when wiring
	// standard task options) and the read-only interface (used in build signatures).
	t.context.taskUtil = {
		isRootProject: sinon.stub().returns(true),
		getBuildOption: sinon.stub(),
		getReadOnlyInterface: sinon.stub().returns("read-only interface"),
	};

	t.context.taskRepository = {
		getTask: sinon.stub().callsFake(async (taskName) => {
			throw new Error(`taskRepository: Unknown Task ${taskName}`);
		}),
		getAllTaskNames: sinon.stub().returns(["replaceVersion", "minify"]),
	};

	t.context.customTaskSpecVersionGteStub = sinon.stub().returns(false);
	t.context.customTaskSpecVersion = {
		gte: t.context.customTaskSpecVersionGteStub
	};
	t.context.getDetermineBuildSignatureCallbackStub = sinon.stub().resolves(undefined);
	t.context.customTask = {
		getName: () => "custom task name",
		getSpecVersion: () => t.context.customTaskSpecVersion,
		getDetermineBuildSignatureCallback: t.context.getDetermineBuildSignatureCallbackStub,
	};

	t.context.graph = {
		getRoot: () => {
			return {
				getName: () => "graph-root"
			};
		},
		getExtension: sinon.stub().returns(t.context.customTask),
	};

	t.context.TaskDefinitions = (await import("../../../lib/build/TaskDefinitions.js")).default;
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("_initTasks: Project of type 'application'", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("application");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {standardTasks, customTasks} = await taskDefinitions.getTaskDefinitions();
	t.true(standardTasks instanceof Map, "standardTasks is a Map");
	t.true(standardTasks.size > 0, "standardTasks is populated for application project");
	t.true(customTasks instanceof Map, "customTasks is a Map");
	t.is(customTasks.size, 0, "No custom tasks defined");
});

test("_initTasks: Project of type 'library'", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("library");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {standardTasks} = await taskDefinitions.getTaskDefinitions();
	t.true(standardTasks instanceof Map, "standardTasks is a Map");
	t.true(standardTasks.size > 0, "standardTasks is populated for library project");
});

test("_initTasks: Project of type 'component'", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("component");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {standardTasks} = await taskDefinitions.getTaskDefinitions();
	t.true(standardTasks instanceof Map, "standardTasks is a Map");
});

test("_initTasks: Project of type 'theme-library'", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("theme-library");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {standardTasks} = await taskDefinitions.getTaskDefinitions();
	t.true(standardTasks instanceof Map, "standardTasks is a Map");
	t.true(standardTasks.size > 0, "standardTasks is populated for theme-library project");
});

test("_initTasks: Project of type 'module'", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {standardTasks} = await taskDefinitions.getTaskDefinitions();
	t.true(standardTasks instanceof Map, "standardTasks is a Map");
	t.is(standardTasks.size, 0, "module project defines no standard tasks");
});

test("_initTasks: Unknown project type", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("pony");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message, "Unknown project type pony", "Threw with expected error message");
});

test("_initTasks: Memoizes initialization across concurrent and subsequent calls", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	const getTypeSpy = t.context.sinon.spy(project, "getType");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);

	// Multiple concurrent calls and follow-up calls should never trigger more than
	// a single initialization run.
	await Promise.all([
		taskDefinitions._initTasks(),
		taskDefinitions._initTasks()
	]);
	await taskDefinitions._initTasks();

	t.is(getTypeSpy.callCount, 1, "Project type was only resolved once");
});

test("_initTasks: Calls build definition with expected arguments", async (t) => {
	const {graph, taskRepository} = t.context;
	const sinon = t.context.sinon;
	const taskUtil = {dummy: true};
	const standardTasks = new Map([["someTask", {options: {foo: "bar"}}]]);
	const definitionStub = sinon.stub().returns(standardTasks);

	const TaskDefinitions = await esmock.p("../../../lib/build/TaskDefinitions.js", {}, {
		"../../../lib/build/definitions/module.js": {
			default: definitionStub
		}
	});

	const project = getMockProject("module");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();

	t.is(definitionStub.callCount, 1, "Build definition got called once");
	const args = definitionStub.getCall(0).args[0];
	t.is(args.project, project, "Build definition called with project");
	t.is(args.taskUtil, taskUtil, "Build definition called with taskUtil");
	t.is(args.getTask, taskRepository.getTask,
		"Build definition called with taskRepository.getTask reference");

	const {standardTasks: returnedStandardTasks} = await taskDefinitions.getTaskDefinitions();
	t.is(returnedStandardTasks, standardTasks, "Standard tasks from definition exposed");
});

test("_getCustomTasks: No custom tasks defined", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.is(customTasks.size, 0, "No custom tasks");
});

test("_getCustomTasks: getCustomTasks returns null", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => null;
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.is(customTasks.size, 0, "Returns empty Map when getCustomTasks returns null");
});

test("_getCustomTasks: Custom tasks are added in configured order", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask", afterTask: "myTask"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();

	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.deepEqual(Array.from(customTasks.keys()), ["myTask", "myOtherTask"],
		"Custom tasks are stored in configured order");
	t.is(customTasks.get("myTask").task, customTask, "Resolved task extension stored on entry");
	t.deepEqual(customTasks.get("myTask").taskDef, {name: "myTask"},
		"Original taskDef stored on entry");
});

test("_addCustomTask: Custom task without name", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: ""}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message,
		"Missing name for custom task in configuration of project project.b",
		"Threw with expected error message");
});

test("_addCustomTask: Custom task defines both beforeTask and afterTask", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "minify", afterTask: "replaceVersion"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message,
		`Custom task definition myTask of project project.b defines both ` +
		`"beforeTask" and "afterTask" parameters. Only one must be defined.`,
		"Threw with expected error message");
});

test("_addCustomTask: Custom task without before-/afterTask in project with standard tasks", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message,
		`Custom task definition myTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("_addCustomTask: Multiple custom tasks; second one without before-/afterTask", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message,
		`Custom task definition myOtherTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("_addCustomTask: First custom task in module project requires no before-/afterTask", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.deepEqual(Array.from(customTasks.keys()), ["myTask"],
		"First custom task in a project without standard tasks is accepted");
});

test("_addCustomTask: Custom task uses name of standard task", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "replaceVersion", afterTask: "minify"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message,
		"Custom task configuration of project project.b references standard task replaceVersion. " +
		"Only custom tasks must be provided here.",
		"Threw with expected error message");
});

test("_addCustomTask: Custom task is unknown in project graph", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	graph.getExtension.returns(undefined);
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const err = await t.throwsAsync(taskDefinitions._initTasks());
	t.is(err.message,
		"Could not find custom task myTask, referenced by project project.b in project graph " +
		"with root node graph-root",
		"Threw with expected error message");
});

test("_addCustomTask: Custom task with beforeTask is accepted", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "minify"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.deepEqual(Array.from(customTasks.keys()), ["myTask"],
		"Custom task referencing beforeTask is accepted");
});

test("_addCustomTask: Multiple custom tasks with same name get suffix", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myTask", afterTask: "myTask"},
		{name: "myTask", afterTask: "myTask"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.deepEqual(Array.from(customTasks.keys()), ["myTask", "myTask--2", "myTask--3"],
		"Suffix is appended to subsequent occurrences of the same task name");
});

test("_addCustomTask: Suffix collides with existing standard task name", async (t) => {
	const {graph, taskUtil} = t.context;
	const sinon = t.context.sinon;
	const taskRepository = {
		getTask: sinon.stub(),
		getAllTaskNames: sinon.stub().returns([]),
	};
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "myTask--2"},
		{name: "myTask", afterTask: "myTask"}
	];
	// Inject a build definition where the suffixed name "myTask--2" is already used by a
	// (synthetic) standard task. The suffix loop must skip it and pick "myTask--3".
	const standardTasks = new Map([["myTask--2", {}]]);
	const definitionStub = sinon.stub().returns(standardTasks);
	const MockedTaskDefinitions = await esmock.p("../../../lib/build/TaskDefinitions.js", {}, {
		"../../../lib/build/definitions/module.js": {
			default: definitionStub
		}
	});

	const taskDefinitions = new MockedTaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions._initTasks();
	const {customTasks} = await taskDefinitions.getTaskDefinitions();
	t.deepEqual(Array.from(customTasks.keys()), ["myTask", "myTask--3"],
		"Suffix counter skips collisions with names already used by standard tasks");
});

test("getTaskDefinitions: Returns standard and custom tasks", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const result = await taskDefinitions.getTaskDefinitions();

	t.true(result.standardTasks instanceof Map, "standardTasks is a Map");
	t.true(result.customTasks instanceof Map, "customTasks is a Map");
	t.is(result.customTasks.get("myTask").task, customTask,
		"Custom task entry resolved from project graph");
});

test("getTaskDefinitions: Lazily triggers initialization", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	const getTypeSpy = t.context.sinon.spy(project, "getType");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const result = await taskDefinitions.getTaskDefinitions();
	t.true(result.standardTasks instanceof Map, "Initialization triggered by getTaskDefinitions");
	t.is(getTypeSpy.callCount, 1, "_initTasks ran exactly once");
});

test("getBuildSignatures: Standard tasks without determineBuildSignature use options as fallback", async (t) => {
	const {graph, taskUtil, taskRepository} = t.context;
	const sinon = t.context.sinon;
	const standardTasks = new Map([
		["taskA", {options: {foo: "bar"}}],
		["taskB", {options: {hello: "world"}}],
	]);
	// The factory for each task returns a descriptor with no determineBuildSignature, so the
	// signature loop falls back to JSON.stringify(taskDef.options).
	taskRepository.getTask.withArgs("taskA").resolves({task: (opts) => ({task: async () => {}})});
	taskRepository.getTask.withArgs("taskB").resolves({task: (opts) => ({task: async () => {}})});
	const definitionStub = sinon.stub().returns(standardTasks);
	const MockedTaskDefinitions = await esmock.p("../../../lib/build/TaskDefinitions.js", {}, {
		"../../../lib/build/definitions/module.js": {
			default: definitionStub
		}
	});

	const project = getMockProject("module");
	const taskDefinitions = new MockedTaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	const expectedKey = [
		JSON.stringify({foo: "bar", projectName: "project.b", projectNamespace: "project/b"}),
		JSON.stringify({hello: "world", projectName: "project.b", projectNamespace: "project/b"}),
	].join("|");
	const expectedHash = crypto.createHash("sha256").update(expectedKey).digest("hex");
	t.is(sig, expectedHash, "Returns sha256 hash of joined task options");
});

test("getBuildSignatures: Standard task determineBuildSignature is awaited and used", async (t) => {
	const {graph, taskUtil, taskRepository} = t.context;
	const sinon = t.context.sinon;
	const determineBuildSignatureStub = sinon.stub().resolves("custom-sig");
	// The factory returns a descriptor carrying the determineBuildSignature callback.
	taskRepository.getTask.withArgs("taskA").resolves({
		task: (opts) => ({task: async () => {}, determineBuildSignature: determineBuildSignatureStub})
	});
	const standardTasks = new Map([
		["taskA", {options: {}}],
	]);
	const definitionStub = sinon.stub().returns(standardTasks);
	const MockedTaskDefinitions = await esmock.p("../../../lib/build/TaskDefinitions.js", {}, {
		"../../../lib/build/definitions/module.js": {
			default: definitionStub
		}
	});

	const project = getMockProject("module");
	const taskDefinitions = new MockedTaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	t.is(determineBuildSignatureStub.callCount, 1, "determineBuildSignature got called once");
	const expectedHash = crypto.createHash("sha256").update("custom-sig").digest("hex");
	t.is(sig, expectedHash, "Returns sha256 hash of returned signature");
});

test("getBuildSignatures: Standard task determineBuildSignature returning falsy is skipped", async (t) => {
	const {graph, taskUtil, taskRepository} = t.context;
	const sinon = t.context.sinon;
	// taskA has a determineBuildSignature that returns undefined; taskB has no callback and falls
	// back to its options JSON.
	taskRepository.getTask.withArgs("taskA").resolves({
		task: (opts) => ({task: async () => {}, determineBuildSignature: sinon.stub().resolves(undefined)})
	});
	taskRepository.getTask.withArgs("taskB").resolves({task: (opts) => ({task: async () => {}})});
	const standardTasks = new Map([
		["taskA", {options: {}}],
		["taskB", {options: {a: 1}}],
	]);
	const definitionStub = sinon.stub().returns(standardTasks);
	const MockedTaskDefinitions = await esmock.p("../../../lib/build/TaskDefinitions.js", {}, {
		"../../../lib/build/definitions/module.js": {
			default: definitionStub
		}
	});

	const project = getMockProject("module");
	const taskDefinitions = new MockedTaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	const expectedHash = crypto.createHash("sha256").update(
		JSON.stringify({a: 1, projectName: "project.b", projectNamespace: "project/b"})
	).digest("hex");
	t.is(sig, expectedHash, "Falsy signature returned by callback is skipped");
});

test("getBuildSignatures: Custom task without determineBuildSignature falls back to configuration", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: {hello: "world"}}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	const expectedHash = crypto.createHash("sha256").update(
		JSON.stringify({hello: "world"})
	).digest("hex");
	t.is(sig, expectedHash, "Falls back to JSON-stringified configuration");
});

test("getBuildSignatures: Custom task determineBuildSignature gets invoked correctly", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask, customTaskSpecVersion,
		customTaskSpecVersionGteStub, sinon} = t.context;
	// Make the task specVersion report >= 5.0 so the new code takes the descriptor path.
	customTaskSpecVersionGteStub.withArgs("5.0").returns(true);
	const determineBuildSignatureCallback = sinon.stub().resolves("my-custom-sig");
	customTask.getDetermineBuildSignatureCallback = sinon.stub().resolves(determineBuildSignatureCallback);

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: {hello: "world"}}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	t.is(determineBuildSignatureCallback.callCount, 1,
		"determineBuildSignature callback got called once");
	const args = determineBuildSignatureCallback.getCall(0).args[0];
	t.truthy(args.log, "log instance provided");
	t.is(args.taskUtil, "read-only interface", "taskUtil read-only interface forwarded");
	t.is(taskUtil.getReadOnlyInterface.callCount, 1,
		"taskUtil#getReadOnlyInterface got called once");
	t.is(taskUtil.getReadOnlyInterface.getCall(0).args[0], customTaskSpecVersion,
		"taskUtil#getReadOnlyInterface called with the task's specVersion");
	t.deepEqual(args.options, {
		projectName: "project.b",
		projectNamespace: "project/b",
		configuration: {hello: "world"},
		taskName: "myTask"
	}, "options forwarded to determineBuildSignature callback");

	const expectedHash = crypto.createHash("sha256").update("my-custom-sig").digest("hex");
	t.is(sig, expectedHash, "Returns sha256 hash of returned signature");
});

test("getBuildSignatures: Custom task determineBuildSignature returning falsy is skipped", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask, customTaskSpecVersionGteStub,
		sinon} = t.context;
	// Make the task specVersion report >= 5.0 so the new code takes the descriptor path.
	customTaskSpecVersionGteStub.withArgs("5.0").returns(true);
	const determineBuildSignatureCallback = sinon.stub().resolves(null);
	customTask.getDetermineBuildSignatureCallback = sinon.stub().resolves(determineBuildSignatureCallback);

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: {hello: "world"}}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	// No standard tasks (module) and falsy custom signature => empty key string
	const expectedHash = crypto.createHash("sha256").update("").digest("hex");
	t.is(sig, expectedHash, "Falsy signature is omitted from hash input");
});

test("getBuildSignatures: Custom task with specVersion < 5.0 falls back to configuration", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask, sinon} = t.context;
	// gte("5.0") returns false: below 5.0, the descriptor path is skipped and the signature falls
	// back to JSON.stringify(taskDef.configuration) regardless of any callback.
	const determineBuildSignatureCallback = sinon.stub().resolves("custom-sig");
	customTask.getDetermineBuildSignatureCallback = sinon.stub().resolves(determineBuildSignatureCallback);

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);

	const sig = await taskDefinitions.getBuildSignatures();
	const expectedHash = crypto.createHash("sha256").update(
		JSON.stringify("configuration")
	).digest("hex");
	t.is(sig, expectedHash, "Below specVersion 5.0, signature falls back to configuration JSON");
	t.is(determineBuildSignatureCallback.callCount, 0,
		"determineBuildSignature callback is not invoked below specVersion 5.0");
});

test("getBuildSignatures: Combines standard and custom task signatures", async (t) => {
	const {graph, taskUtil, taskRepository, customTask, customTaskSpecVersionGteStub, sinon} = t.context;
	// taskA: no determineBuildSignature → falls back to options JSON.
	// taskB: descriptor carries determineBuildSignature returning "std-sig".
	const stdSigStub = sinon.stub().resolves("std-sig");
	taskRepository.getTask.withArgs("taskA").resolves({task: (opts) => ({task: async () => {}})});
	taskRepository.getTask.withArgs("taskB").resolves({
		task: (opts) => ({task: async () => {}, determineBuildSignature: stdSigStub})
	});
	const standardTasks = new Map([
		["taskA", {options: {a: 1}}],
		["taskB", {options: {}}],
	]);
	const definitionStub = sinon.stub().returns(standardTasks);
	const MockedTaskDefinitions = await esmock.p("../../../lib/build/TaskDefinitions.js", {}, {
		"../../../lib/build/definitions/module.js": {
			default: definitionStub
		}
	});

	// Make the custom task specVersion >= 5.0 so its determineBuildSignature is honored.
	customTaskSpecVersionGteStub.withArgs("5.0").returns(true);
	const determineBuildSignatureCallback = sinon.stub().resolves("custom-sig");
	customTask.getDetermineBuildSignatureCallback = sinon.stub().resolves(determineBuildSignatureCallback);

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "taskA"}
	];
	const taskDefinitions = new MockedTaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	const expectedKey = [
		JSON.stringify({a: 1, projectName: "project.b", projectNamespace: "project/b"}),
		"std-sig",
		"custom-sig"
	].join("|");
	const expectedHash = crypto.createHash("sha256").update(expectedKey).digest("hex");
	t.is(sig, expectedHash, "Combined hash includes both standard and custom signatures");
});

test("getBuildSignatures: Triggers task initialization", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module");
	const getTypeSpy = t.context.sinon.spy(project, "getType");
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	await taskDefinitions.getBuildSignatures();
	t.is(getTypeSpy.callCount, 1, "_initTasks was triggered");
});

test("getBuildSignatures: Empty project hashes the empty string", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository} = t.context;
	const project = getMockProject("module"); // module has no standard tasks and no custom tasks
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);
	const sig = await taskDefinitions.getBuildSignatures();

	const expectedHash = crypto.createHash("sha256").update("").digest("hex");
	t.is(sig, expectedHash, "Returns sha256 hash of empty key string");
});

test("getCustomTaskCacheExemptions: a custom task below Specification Version 5.0 is exempt", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask} = t.context;
	// Default spec-version stub reports gte("5.0") === false, i.e. a pre-5.0 custom task.
	customTask.getSpecVersion = () => ({
		gte: () => false,
		toString: () => "4.0",
	});
	const project = getMockProject("module");
	project.getCustomTasks = () => [{name: "legacyTask"}];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);

	const exemptions = await taskDefinitions.getCustomTaskCacheExemptions();
	t.deepEqual([...exemptions.keys()], ["legacyTask"], "The pre-5.0 custom task is exempt");
	t.deepEqual(exemptions.get("legacyTask"),
		{reason: "specVersion", extensionName: "custom task name", specVersion: "4.0"},
		"Exemption records the version reason and the extension's details");
});

test("getCustomTaskCacheExemptions: a 5.0 task opts out via cache:false", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask} = t.context;
	customTask.getSpecVersion = () => ({
		gte: () => true,
		toString: () => "5.0",
	});
	customTask.getDescriptor = t.context.sinon.stub().resolves({task: () => {}, cache: false});
	const project = getMockProject("module");
	project.getCustomTasks = () => [{name: "optOutTask", configuration: {foo: "bar"}}];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);

	const exemptions = await taskDefinitions.getCustomTaskCacheExemptions();
	t.deepEqual(exemptions.get("optOutTask"),
		{reason: "optOut", extensionName: "custom task name", specVersion: "5.0"},
		"Exemption records the opt-out reason");
	t.deepEqual(customTask.getDescriptor.getCall(0).args[1], {
		projectName: "project.b",
		projectNamespace: "project/b",
		configuration: {foo: "bar"},
		taskName: "optOutTask",
	}, "The descriptor is resolved with the task's completed options");
});

test("getCustomTaskCacheExemptions: a cacheable 5.0 task is not listed", async (t) => {
	const {TaskDefinitions, graph, taskUtil, taskRepository, customTask} = t.context;
	customTask.getSpecVersion = () => ({
		gte: () => true,
		toString: () => "5.0",
	});
	// No cache flag means cacheable.
	customTask.getDescriptor = t.context.sinon.stub().resolves({task: () => {}});
	const project = getMockProject("module");
	project.getCustomTasks = () => [{name: "cacheableTask"}];
	const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);

	const exemptions = await taskDefinitions.getCustomTaskCacheExemptions();
	t.is(exemptions.size, 0, "A cacheable custom task is not exempt");
});

for (const {name, excludedTasks, includedTasks, expected} of [
	{name: "excluded task", excludedTasks: ["legacyTask"], includedTasks: [], expected: []},
	{name: "all tasks excluded", excludedTasks: ["*"], includedTasks: [], expected: []},
	{
		name: "task included after wildcard exclusion",
		excludedTasks: ["*"], includedTasks: ["legacyTask"], expected: ["legacyTask", "legacyTask--2"]
	},
	{
		name: "all tasks included after exclusion",
		excludedTasks: ["legacyTask"], includedTasks: ["*"], expected: ["legacyTask", "legacyTask--2"]
	}
]) {
	test(`getCustomTaskCacheExemptions: ${name}`, async (t) => {
		const {TaskDefinitions, graph, taskUtil, taskRepository, customTask} = t.context;
		customTask.getSpecVersion = () => ({gte: () => false, toString: () => "4.0"});
		const project = getMockProject("module");
		project.getCustomTasks = () => [
			{name: "legacyTask"},
			{name: "legacyTask", afterTask: "legacyTask"}
		];
		const taskDefinitions = new TaskDefinitions(graph, project, taskUtil, taskRepository);

		const exemptions = await taskDefinitions.getCustomTaskCacheExemptions({excludedTasks, includedTasks});
		t.deepEqual([...exemptions.keys()], expected);
	});
}
