const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const parentLogger = require("@ui5/logger").getGroupLogger("mygroup");

const TaskRunner = require("../../../lib/build/TaskRunner");

function noop() {}
function emptyarray() {
	return [];
}

const buildConfig = {
	selfContained: false,
	jsdoc: false,
	includedTasks: [],
	excludedTasks: []
};

function getMockProject(type) {
	return {
		getName: () => "project.b",
		getNamespace: () => "project/b",
		getType: () => type,
		getPropertiesFileSourceEncoding: noop,
		getCopyright: noop,
		getVersion: noop,
		getSpecVersion: () => "0.1",
		getMinificationExcludes: emptyarray,
		getComponentPreloadPaths: () => [
			"project/b/**/Component.js"
		],
		getComponentPreloadNamespaces: emptyarray,
		getComponentPreloadExcludes: emptyarray,
		getLibraryPreloadExcludes: emptyarray,
		getBundles: () => [{
			bundleDefinition: {
				name: "project/b/sectionsA/customBundle.js",
				defaultFileTypes: [".js"],
				sections: [{
					mode: "preload",
					filters: [
						"project/b/sectionsA/",
						"!project/b/sectionsA/section2**",
					]
				}],
				sort: true
			},
			bundleOptions: {
				optimize: true,
				usePredefinedCalls: true
			}
		}],
		getCachebusterSignatureType: noop,
		getCustomTasks: () => [],
	};
}

test.beforeEach((t) => {
	t.context.taskUtil = {
		isRootProject: sinon.stub().returns(true),
		getBuildOption: sinon.stub(),
		getInterface: sinon.stub()
	};

	t.context.graph = {
		getRoot: () => {
			return {
				getName: () => "graph-root"
			};
		},
		getExtension: sinon.stub().returns("a custom task")
	};
});

test("Project of type 'application'", (t) => {
	const {graph, taskUtil} = t.context;
	const builder = new TaskRunner({
		project: getMockProject("application"), graph, taskUtil, parentLogger, buildConfig
	});
	t.deepEqual(builder._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"minify",
		"generateFlexChangesBundle",
		"generateManifestBundle",
		"generateComponentPreload",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateCachebusterInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("Project of type 'library'", (t) => {
	const {graph, taskUtil} = t.context;
	const builder = new TaskRunner({
		project: getMockProject("library"), graph, taskUtil, parentLogger, buildConfig
	});

	t.deepEqual(builder._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"replaceBuildtime",
		"generateJsdoc",
		"executeJsdocSdkTransformation",
		"minify",
		"generateLibraryManifest",
		"generateManifestBundle",
		"generateComponentPreload",
		"generateLibraryPreload",
		"generateBundle",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("Project of type 'theme-library'", (t) => {
	const {graph, taskUtil} = t.context;
	const builder = new TaskRunner({
		project: getMockProject("theme-library"), graph, taskUtil, parentLogger, buildConfig
	});

	t.deepEqual(builder._taskExecutionOrder, [
		"replaceCopyright",
		"replaceVersion",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("Project of type 'module'", (t) => {
	const {graph, taskUtil} = t.context;
	const builder = new TaskRunner({
		project: getMockProject("module"), graph, taskUtil, parentLogger, buildConfig
	});

	t.deepEqual(builder._taskExecutionOrder, [], "Correct standard tasks");
});

test("Custom tasks", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myOtherTask", beforeTask: "replaceVersion"}
	];
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});
	t.deepEqual(builder._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"myOtherTask",
		"replaceVersion",
		"minify",
		"myTask",
		"generateFlexChangesBundle",
		"generateManifestBundle",
		"generateComponentPreload",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateCachebusterInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "Custom tasks are inserted correctly");
});

test("Custom tasks with no standard tasks", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask", beforeTask: "myTask"}
	];
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});
	t.deepEqual(builder._taskExecutionOrder, [
		"myOtherTask",
		"myTask",
	], "ApplicationBuilder is still instantiated with standard tasks");
});

test("Custom tasks with no standard tasks and second task defining no before-/afterTask", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Custom task definition myOtherTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("Custom tasks with both, before- and afterTask reference", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "minify", afterTask: "replaceVersion"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines both ` +
		`"beforeTask" and "afterTask" parameters. Only one must be defined.`,
		"Threw with expected error message");
});

test("Custom tasks with no before-/afterTask reference", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("Custom tasks without name", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: ""}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Missing name for custom task in configuration of project project.b`,
		"Threw with expected error message");
});

test("Custom task with name of standard tasks", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "replaceVersion", afterTask: "minify"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Custom task configuration of project project.b references standard task replaceVersion. " +
		"Only custom tasks must be provided here.",
		"Threw with expected error message");
});

test("Multiple custom tasks with same name", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myTask", afterTask: "myTask"},
		{name: "myTask", afterTask: "minify"}
	];
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});
	t.deepEqual(builder._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"minify",
		"myTask--3",
		"myTask",
		"myTask--2",
		"generateFlexChangesBundle",
		"generateManifestBundle",
		"generateComponentPreload",
		"generateStandaloneAppBundle",
		"transformBootstrapHtml",
		"generateBundle",
		"generateVersionInfo",
		"generateCachebusterInfo",
		"generateApiIndex",
		"generateResourcesJson"
	], "Custom tasks are inserted correctly");
});

test("Custom tasks with unknown beforeTask", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "unknownTask"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("Custom tasks with unknown afterTask", (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "unknownTask"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("Custom tasks is unknown", (t) => {
	const {graph, taskUtil} = t.context;
	graph.getExtension.returns(undefined);
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"}
	];
	const err = t.throws(() => {
		new TaskRunner({
			project, graph, taskUtil, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Could not find custom task myTask, referenced by project project.b in project " +
		"graph with root node graph-root",
		"Threw with expected error message");
});

test("Custom task is called correctly", async (t) => {
	const {graph, taskUtil} = t.context;
	const taskStub = sinon.stub();
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => "2.6"
	});
	t.context.taskUtil.getInterface.returns("taskUtil interface");
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	t.truthy(builder._tasks["myTask"], "Custom tasks has been added to task map");
	t.true(builder._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	await builder._tasks["myTask"].task({
		workspace: "workspace",
		dependencies: "dependencies"
	});

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "configuration",
		},
		taskUtil: "taskUtil interface"
	}, "Task got called with one argument");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], "2.6",
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with legacy spec version", async (t) => {
	const {graph, taskUtil} = t.context;
	const taskStub = sinon.stub();
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => "1.0"
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	t.truthy(builder._tasks["myTask"], "Custom tasks has been added to task map");
	t.true(builder._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	await builder._tasks["myTask"].task({
		workspace: "workspace",
		dependencies: "dependencies"
	});

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "configuration",
		}
	}, "Task got called with one argument");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], "1.0",
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with specVersion 2.7", async (t) => {
	const {graph, taskUtil} = t.context;
	const taskStub = sinon.stub();
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => "2.7"
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	t.truthy(builder._tasks["myTask"], "Custom tasks has been added to task map");
	t.true(builder._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	await builder._tasks["myTask"].task({
		workspace: "workspace",
		dependencies: "dependencies"
	}, "log");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		taskName: "myTask", // specVersion 2.7 feature
		log: "log", // specVersion 2.7 feature
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "configuration",
		}
	}, "Task got called with one argument");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], "2.7",
		"taskUtil#getInterface got called with correct argument");
});

test("Multiple custom tasks with same name are called correctly", async (t) => {
	const {graph, taskUtil} = t.context;
	const taskStub1 = sinon.stub();
	const taskStub2 = sinon.stub();
	const taskStub3 = sinon.stub();
	graph.getExtension.onFirstCall().returns({
		getTask: () => taskStub1,
		getSpecVersion: () => "2.5"
	});
	graph.getExtension.onSecondCall().returns({
		getTask: () => taskStub2,
		getSpecVersion: () => "2.6"
	});
	graph.getExtension.onThirdCall().returns({
		getTask: () => taskStub3,
		getSpecVersion: () => "2.7"
	});
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "cat"},
		{name: "myTask", afterTask: "myTask", configuration: "dog"},
		{name: "myTask", afterTask: "myTask", configuration: "bird"}
	];
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	t.truthy(builder._tasks["myTask"], "Custom tasks has been added to task map");
	t.truthy(builder._tasks["myTask--2"], "Custom tasks has been added to task map");
	t.truthy(builder._tasks["myTask--3"], "Custom tasks has been added to task map");
	t.true(builder._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	t.true(builder._tasks["myTask--2"].requiresDependencies, "Custom tasks requires dependencies by default");
	t.true(builder._tasks["myTask--3"].requiresDependencies, "Custom tasks requires dependencies by default");

	// "Last in is the first out"
	t.deepEqual(builder._taskExecutionOrder, [
		"myTask",
		"myTask--3",
		"myTask--2",
	], "Correct order of custom tasks");

	await builder.runTasks({
		workspace: "workspace",
		dependencies: "dependencies"
	});

	t.is(taskStub1.callCount, 1, "Task 1 got called once");
	t.is(taskStub1.getCall(0).args.length, 1, "Task 1 got called with one argument");
	t.deepEqual(taskStub1.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "cat",
		}
	}, "Task 1 got called with one argument");

	t.is(taskStub2.callCount, 1, "Task 2 got called once");
	t.is(taskStub2.getCall(0).args.length, 1, "Task 2 got called with one argument");
	t.deepEqual(taskStub2.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "dog",
		}
	}, "Task 2 got called with one argument");

	t.is(taskStub3.callCount, 1, "Task 3 got called once");
	t.is(taskStub3.getCall(0).args.length, 1, "Task 3 got called with one argument");
	t.deepEqual(taskStub3.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		log: builder._taskLog,
		taskName: "myTask--3",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "bird",
		}
	}, "Task 3 got called with one argument");

	t.is(taskUtil.getInterface.callCount, 3, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], "2.5",
		"taskUtil#getInterface got called with correct argument");
	t.is(taskUtil.getInterface.getCall(1).args[0], "2.7",
		"taskUtil#getInterface got called with correct argument");
	t.is(taskUtil.getInterface.getCall(2).args[0], "2.6",
		"taskUtil#getInterface got called with correct argument");
});

test.serial("_addTask", async (t) => {
	const taskStub = sinon.stub();
	const getTaskStub = sinon.stub(require("@ui5/builder").tasks.taskRepository, "getTask").returns({
		task: taskStub
	});
	const TaskRunner = mock.reRequire("../../../lib/build/TaskRunner");

	const {graph, taskUtil} = t.context;
	const project = getMockProject("module");
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	builder._addTask("standardTask");

	t.truthy(builder._tasks["standardTask"], "Task has been added to task map");
	t.false(builder._tasks["standardTask"].requiresDependencies, "requiresDependencies defaults to false");
	t.truthy(builder._tasks["standardTask"].task, "Task function got set correctly");
	t.deepEqual(builder._taskExecutionOrder, ["standardTask"], "Task got added to execution order");

	await builder._tasks["standardTask"].task({
		workspace: "workspace",
		dependencies: "dependencies",
	});

	t.is(getTaskStub.callCount, 1, "taskRepository#getTask got called once");
	t.is(getTaskStub.getCall(0).args[0], "standardTask", "taskRepository#getTask got called with correct argument");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		// No dependencies
		options: {
			projectName: "project.b",
			projectNamespace: "project/b"
		},
		taskUtil
	}, "Task got called with correct arguments");

	getTaskStub.restore();
	mock.stopAll();
});

test.serial("_addTask with options", async (t) => {
	const taskStub = sinon.stub();
	const getTaskStub = sinon.stub(require("@ui5/builder").tasks.taskRepository, "getTask").returns({});
	const TaskRunner = mock.reRequire("../../../lib/build/TaskRunner");

	const {graph, taskUtil} = t.context;
	const project = getMockProject("module");
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	builder._addTask("standardTask", {
		requiresDependencies: true,
		options: {
			myTaskOption: "cat",
		},
		taskFunction: taskStub
	});

	t.truthy(builder._tasks["standardTask"], "Task has been added to task map");
	t.true(builder._tasks["standardTask"].requiresDependencies, "requiresDependencies set to true");
	t.truthy(builder._tasks["standardTask"].task, "Task function got set correctly");
	t.deepEqual(builder._taskExecutionOrder, ["standardTask"], "Task got added to execution order");

	await builder._tasks["standardTask"].task({
		workspace: "workspace",
		dependencies: "dependencies",
	});

	t.is(getTaskStub.callCount, 0, "taskRepository#getTask did not get called");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			myTaskOption: "cat"
		},
		taskUtil
	}, "Task got called with correct arguments");

	getTaskStub.restore();
	mock.stopAll();
});

test("_addTask: Duplicate task", async (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("module");
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	builder._addTask("standardTask", {
		taskFunction: () => {}
	});

	const err = t.throws(() => {
		builder._addTask("standardTask", {
			taskFunction: () => {}
		});
	});
	t.is(err.message, "Failed to add duplicate task standardTask for project project.b",
		"Threw with expected error message");
});

test("_addTask: Task already added to execution order", async (t) => {
	const {graph, taskUtil} = t.context;
	const project = getMockProject("module");
	const builder = new TaskRunner({
		project, graph, taskUtil, parentLogger, buildConfig
	});

	builder._taskExecutionOrder.push("standardTask");
	const err = t.throws(() => {
		builder._addTask("standardTask", {
			taskFunction: () => {}
		});
	});
	t.is(err.message,
		"Failed to add task standardTask for project project.b. It has already been scheduled for execution",
		"Threw with expected error message");
});
