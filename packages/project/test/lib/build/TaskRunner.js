import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import logger from "@ui5/logger";
const parentLogger = logger.getGroupLogger("mygroup");

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
		hasBuildManifest: () => false
	};
}

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.taskUtil = {
		isRootProject: sinon.stub().returns(true),
		getBuildOption: sinon.stub(),
		getInterface: sinon.stub()
	};

	t.context.taskRepository = {
		getTask: sinon.stub().callsFake(async (taskName) => {
			throw new Error(`taskRepository: Unknown Task ${taskName}`);
		}),
		getAllTaskNames: sinon.stub().returns(["replaceVersion"])
	};

	t.context.graph = {
		getRoot: () => {
			return {
				getName: () => "graph-root"
			};
		},
		getExtension: sinon.stub().returns("a custom task")
	};

	t.context.logger = {
		getGroupLogger: sinon.stub().returns("group logger")
	};

	t.context.TaskRunner = await esmock("../../../lib/build/TaskRunner.js", {
		"@ui5/logger": t.context.logger
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Project of type 'application'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = await TaskRunner.create({
		project: getMockProject("application"), graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"minify",
		"generateFlexChangesBundle",
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

test("Project of type 'library'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = await TaskRunner.create({
		project: getMockProject("library"), graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"replaceBuildtime",
		"generateJsdoc",
		"executeJsdocSdkTransformation",
		"minify",
		"generateLibraryManifest",
		"generateComponentPreload",
		"generateLibraryPreload",
		"generateBundle",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("Project of type 'theme-library'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = await TaskRunner.create({
		project: getMockProject("theme-library"), graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.deepEqual(taskRunner._taskExecutionOrder, [
		"replaceCopyright",
		"replaceVersion",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("Project of type 'module'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = await TaskRunner.create({
		project: getMockProject("module"), graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.deepEqual(taskRunner._taskExecutionOrder, [], "Correct standard tasks");
});

test("Unknown project type", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project: getMockProject("pony"), graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});

	t.is(err.message, "Unknown project type pony", "Threw with expected error message");
});

test("Custom tasks", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myOtherTask", beforeTask: "replaceVersion"}
	];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"myOtherTask",
		"replaceVersion",
		"minify",
		"myTask",
		"generateFlexChangesBundle",
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

test("Custom tasks with no standard tasks", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask", beforeTask: "myTask"}
	];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"myOtherTask",
		"myTask",
	], "ApplicationBuilder is still instantiated with standard tasks");
});

test("Custom tasks with no standard tasks and second task defining no before-/afterTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Custom task definition myOtherTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("Custom tasks with both, before- and afterTask reference", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "minify", afterTask: "replaceVersion"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines both ` +
		`"beforeTask" and "afterTask" parameters. Only one must be defined.`,
		"Threw with expected error message");
});

test("Custom tasks with no before-/afterTask reference", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("Custom tasks without name", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: ""}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		`Missing name for custom task in configuration of project project.b`,
		"Threw with expected error message");
});

test("Custom task with name of standard tasks", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "replaceVersion", afterTask: "minify"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Custom task configuration of project project.b references standard task replaceVersion. " +
		"Only custom tasks must be provided here.",
		"Threw with expected error message");
});

test("Multiple custom tasks with same name", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myTask", afterTask: "myTask"},
		{name: "myTask", afterTask: "minify"}
	];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"minify",
		"myTask--3",
		"myTask",
		"myTask--2",
		"generateFlexChangesBundle",
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

test("Custom tasks with unknown beforeTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "unknownTask"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("Custom tasks with unknown afterTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "unknownTask"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("Custom tasks is unknown", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	graph.getExtension.returns(undefined);
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"}
	];
	const err = await t.throwsAsync(async () => {
		await TaskRunner.create({
			project, graph, taskUtil, taskRepository, parentLogger, buildConfig
		});
	});
	t.is(err.message,
		"Could not find custom task myTask, referenced by project project.b in project " +
		"graph with root node graph-root",
		"Threw with expected error message");
});

test("Custom task is called correctly", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
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

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.true(taskRunner._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	await taskRunner._tasks["myTask"].task({
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
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
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

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.true(taskRunner._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	await taskRunner._tasks["myTask"].task({
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

test("Custom task with specVersion 3.0", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => "3.0"
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.true(taskRunner._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	await taskRunner._tasks["myTask"].task({
		workspace: "workspace",
		dependencies: "dependencies"
	}, "log");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		log: "group logger",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask", // specVersion 3.0 feature
			configuration: "configuration",
		}
	}, "Task got called with one argument");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], "3.0",
		"taskUtil#getInterface got called with correct argument");
});

test("Multiple custom tasks with same name are called correctly", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
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
		getSpecVersion: () => "3.0"
	});
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "cat"},
		{name: "myTask", afterTask: "myTask", configuration: "dog"},
		{name: "myTask", afterTask: "myTask", configuration: "bird"}
	];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.truthy(taskRunner._tasks["myTask--2"], "Custom tasks has been added to task map");
	t.truthy(taskRunner._tasks["myTask--3"], "Custom tasks has been added to task map");
	t.true(taskRunner._tasks["myTask"].requiresDependencies, "Custom tasks requires dependencies by default");
	t.true(taskRunner._tasks["myTask--2"].requiresDependencies, "Custom tasks requires dependencies by default");
	t.true(taskRunner._tasks["myTask--3"].requiresDependencies, "Custom tasks requires dependencies by default");

	// "Last in is the first out"
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"myTask",
		"myTask--3",
		"myTask--2",
	], "Correct order of custom tasks");

	await taskRunner.runTasks({
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
		log: "group logger",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask--3",
			configuration: "bird",
		}
	}, "Task 3 got called with one argument");

	t.is(taskUtil.getInterface.callCount, 3, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], "2.5",
		"taskUtil#getInterface got called with correct argument on first call");
	t.is(taskUtil.getInterface.getCall(1).args[0], "3.0",
		"taskUtil#getInterface got called with correct argument on second call");
	t.is(taskUtil.getInterface.getCall(2).args[0], "2.6",
		"taskUtil#getInterface got called with correct argument on third call");
});

test.serial("_addTask", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;

	const taskStub = sinon.stub();
	taskRepository.getTask.withArgs("standardTask").resolves({
		task: taskStub
	});

	const project = getMockProject("module");
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	taskRunner._addTask("standardTask");

	t.truthy(taskRunner._tasks["standardTask"], "Task has been added to task map");
	t.false(taskRunner._tasks["standardTask"].requiresDependencies, "requiresDependencies defaults to false");
	t.truthy(taskRunner._tasks["standardTask"].task, "Task function got set correctly");
	t.deepEqual(taskRunner._taskExecutionOrder, ["standardTask"], "Task got added to execution order");

	await taskRunner._tasks["standardTask"].task({
		workspace: "workspace",
		dependencies: "dependencies",
	});

	t.is(taskRepository.getTask.callCount, 1, "taskRepository#getTask got called once");
	t.is(taskRepository.getTask.getCall(0).args[0], "standardTask",
		"taskRepository#getTask got called with correct argument");
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
});

test.serial("_addTask with options", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const project = getMockProject("module");

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	taskRunner._addTask("standardTask", {
		requiresDependencies: true,
		options: {
			myTaskOption: "cat",
		},
		taskFunction: taskStub
	});

	t.truthy(taskRunner._tasks["standardTask"], "Task has been added to task map");
	t.true(taskRunner._tasks["standardTask"].requiresDependencies, "requiresDependencies set to true");
	t.truthy(taskRunner._tasks["standardTask"].task, "Task function got set correctly");
	t.deepEqual(taskRunner._taskExecutionOrder, ["standardTask"], "Task got added to execution order");

	await taskRunner._tasks["standardTask"].task({
		workspace: "workspace",
		dependencies: "dependencies",
	});

	t.is(taskRepository.getTask.callCount, 0, "taskRepository#getTask did not get called");

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
});

test("_addTask: Duplicate task", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	taskRunner._addTask("standardTask", {
		taskFunction: () => {}
	});

	const err = t.throws(() => {
		taskRunner._addTask("standardTask", {
			taskFunction: () => {}
		});
	});
	t.is(err.message, "Failed to add duplicate task standardTask for project project.b",
		"Threw with expected error message");
});

test("_addTask: Task already added to execution order", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	taskRunner._taskExecutionOrder.push("standardTask");
	const err = t.throws(() => {
		taskRunner._addTask("standardTask", {
			taskFunction: () => {}
		});
	});
	t.is(err.message,
		"Failed to add task standardTask for project project.b. It has already been scheduled for execution",
		"Threw with expected error message");
});

test("requiresDependencies: Custom Task", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.true(taskRunner.requiresDependencies(), "Project with custom task requires dependencies");
});

test("requiresDependencies: Default application", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getBundles = () => [];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.false(taskRunner.requiresDependencies(), "Default application project does not require dependencies");
});

test("requiresDependencies: Default library", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("library");
	project.getBundles = () => [];
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.true(taskRunner.requiresDependencies(), "Default library project requires dependencies");
});

test("requiresDependencies: Default theme-library", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("theme-library");

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.true(taskRunner.requiresDependencies(), "Default theme-library project requires dependencies");
});

test("requiresDependencies: Default module", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.false(taskRunner.requiresDependencies(), "Default module project does not require dependencies");
});

test("requiresBuild: has no build-manifest", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("library");

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.true(taskRunner.requiresBuild(), "Project without build-manifest requires to be build");
});

test("requiresBuild: has build-manifest", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("library");
	project.hasBuildManifest = () => true;

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.false(taskRunner.requiresBuild(), "Project with build-manifest does not require to be build");
});

test.serial("getBuildMetadata", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("library");
	project.hasBuildManifest = () => true;
	project.getBuildManifest = () => {
		return {
			timestamp: "2022-07-28T12:00:00.000Z"
		};
	};
	const getTimeStub = sinon.stub(Date.prototype, "getTime").callThrough().onFirstCall().returns(1659016800000);
	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});

	t.deepEqual(taskRunner.getBuildMetadata(), {
		timestamp: "2022-07-28T12:00:00.000Z",
		age: "7200 seconds"
	}, "Project with build-manifest does not require to be build");
	getTimeStub.restore();
});

test("getBuildMetadata: has no build-manifest", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("library");

	const taskRunner = await TaskRunner.create({
		project, graph, taskUtil, taskRepository, parentLogger, buildConfig
	});
	t.is(taskRunner.getBuildMetadata(), null, "Project has no build manifest");
});
