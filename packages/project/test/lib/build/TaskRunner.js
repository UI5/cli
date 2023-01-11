import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import logger from "@ui5/logger";
logger.setLevel("perf");
const log = logger.getLogger("mygroup");

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
		getMinificationExcludes: emptyarray,
		getSpecVersion: () => {
			return {
				gte: () => false
			};
		},
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
		hasBuildManifest: () => false,
		getWorkspace: () => "workspace",
		isFrameworkProject: () => false
	};
}

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.taskUtil = {
		isRootProject: sinon.stub().returns(true),
		getBuildOption: sinon.stub(),
		getProject: sinon.stub(),
		getDependencies: sinon.stub().returns(["dep.a", "dep.b"]),
		getInterface: sinon.stub(),
	};
	t.context.taskUtil.getInterface.returns(t.context.taskUtil);

	t.context.taskRepository = {
		getTask: sinon.stub().callsFake(async (taskName) => {
			throw new Error(`taskRepository: Unknown Task ${taskName}`);
		}),
		getAllTaskNames: sinon.stub().returns(["replaceVersion"]),
		getRemovedTaskNames: sinon.stub().returns(["removedTask"]),
	};

	t.context.customTaskSpecVersionGteStub = sinon.stub().returns(true);
	t.context.getRequiredDependenciesCallbackStub = sinon.stub().resolves(null);
	t.context.customTask = {
		getName: () => "custom task name",
		getSpecVersion: () => {
			return {
				gte: t.context.customTaskSpecVersionGteStub
			};
		},
		getRequiredDependenciesCallback: t.context.getRequiredDependenciesCallbackStub,
	};

	t.context.graph = {
		getRoot: () => {
			return {
				getName: () => "graph-root"
			};
		},
		getExtension: sinon.stub().returns(t.context.customTask),
		traverseBreadthFirst: sinon.stub(),
		getTransitiveDependencies: sinon.stub().returns(["dep.a", "dep.b", "dep.c"])
	};

	t.context.logger = {
		getLogger: sinon.stub().returns("group logger")
	};

	t.context.resourceFactory = {
		createReaderCollection: sinon.stub()
			.returns("reader collection")
	};

	t.context.TaskRunner = await esmock("../../../lib/build/TaskRunner.js", {
		"@ui5/logger": t.context.logger,
		"@ui5/fs/resourceFactory": t.context.resourceFactory
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Missing parameters", (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	t.throws(() => {
		new TaskRunner({
			graph,
			taskUtil,
			taskRepository,
			log,
			buildConfig
		});
	}, {
		message: "One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing project parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			taskUtil,
			taskRepository,
			log,
			buildConfig
		});
	}, {
		message: "One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing graph parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskRepository,
			log,
			buildConfig
		});
	}, {
		message: "One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing taskUtil parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			log,
			buildConfig
		});
	}, {
		message: "One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing taskRepository parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			taskRepository,
			buildConfig
		});
	}, {
		message: "One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing log parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			taskRepository,
			log
		});
	}, {
		message: "One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing buildConfig parameter");
});

test("_initTasks: Project of type 'application'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = new TaskRunner({
		project: getMockProject("application"), graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
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

test("_initTasks: Project of type 'library'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = new TaskRunner({
		project: getMockProject("library"), graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

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
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("_initTasks: Project of type 'library' (framework project)", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;

	const project = getMockProject("library");
	project.isFrameworkProject = () => true;

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

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

test("_initTasks: Project of type 'theme-library'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = new TaskRunner({
		project: getMockProject("theme-library"), graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.deepEqual(taskRunner._taskExecutionOrder, [
		"replaceCopyright",
		"replaceVersion",
		"buildThemes",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("_initTasks: Project of type 'theme-library' (framework project)", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;

	const project = getMockProject("theme-library");
	project.isFrameworkProject = () => true;

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.deepEqual(taskRunner._taskExecutionOrder, [
		"replaceCopyright",
		"replaceVersion",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("_initTasks: Project of type 'module'", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = new TaskRunner({
		project: getMockProject("module"), graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.deepEqual(taskRunner._taskExecutionOrder, [], "Correct standard tasks");
});

test("_initTasks: Unknown project type", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskRunner = new TaskRunner({
		project: getMockProject("pony"), graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(taskRunner._initTasks());

	t.is(err.message, "Unknown project type pony", "Threw with expected error message");
});

test("_initTasks: Custom tasks", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myOtherTask", beforeTask: "replaceVersion"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
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

test("_initTasks: Custom tasks with no standard tasks", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask", beforeTask: "myTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"myOtherTask",
		"myTask",
	], "ApplicationBuilder is still instantiated with standard tasks");
});

test("_initTasks: Custom tasks with no standard tasks and second task defining no before-/afterTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Custom task definition myOtherTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with both, before- and afterTask reference", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "minify", afterTask: "replaceVersion"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines both ` +
		`"beforeTask" and "afterTask" parameters. Only one must be defined.`,
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with no before-/afterTask reference", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("_initTasks: Custom tasks without name", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: ""}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Missing name for custom task in configuration of project project.b`,
		"Threw with expected error message");
});

test("_initTasks: Custom task with name of standard tasks", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "replaceVersion", afterTask: "minify"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Custom task configuration of project project.b references standard task replaceVersion. " +
		"Only custom tasks must be provided here.",
		"Threw with expected error message");
});

test("_initTasks: Multiple custom tasks with same name", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myTask", afterTask: "myTask"},
		{name: "myTask", afterTask: "minify"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
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

test("_initTasks: Custom tasks with unknown beforeTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "unknownTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with unknown afterTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "unknownTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("_initTasks: Custom tasks is unknown", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	graph.getExtension.returns(undefined);
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Could not find custom task myTask, referenced by project project.b in project " +
		"graph with root node graph-root",
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with removed beforeTask", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "removedTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Standard task removedTask, referenced by custom task myTask in project project.b, ` +
		`has been removed in this version of UI5 Tooling and can't be referenced anymore. ` +
		`Please see the migration guide at https://sap.github.io/ui5-tooling/updates/migrate-v3/`,
		"Threw with expected error message");
});

test("_initTasks: Create dependencies reader for all dependencies", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner, resourceFactory} = t.context;
	const project = getMockProject("application");
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
	t.is(graph.traverseBreadthFirst.callCount, 1, "ProjectGraph#traverseBreadthFirst called once");
	t.is(graph.traverseBreadthFirst.getCall(0).args[0], "project.b",
		"ProjectGraph#traverseBreadthFirst called with correct project name for start");
	const traversalCallback = graph.traverseBreadthFirst.getCall(0).args[1];

	// Call with root project should be ignored
	await traversalCallback({
		project: {
			getName: () => "project.b",
			getReader: () => "project.b reader",
		}
	});
	await traversalCallback({
		project: {
			getName: () => "dep.a",
			getReader: () => "dep.a reader",
		}
	});
	await traversalCallback({
		project: {
			getName: () => "dep.b",
			getReader: () => "dep.b reader",
		}
	});
	await traversalCallback({
		project: {
			getName: () => "transitive.dep.a",
			getReader: () => "transitive.dep.a reader",
		}
	});
	t.is(resourceFactory.createReaderCollection.callCount, 1, "createReaderCollection got called once");
	t.deepEqual(resourceFactory.createReaderCollection.getCall(0).args[0], {
		name: "Dependency reader collection of project project.b",
		readers: [
			"dep.a reader", "dep.b reader", "transitive.dep.a reader"
		]
	}, "createReaderCollection got called with correct arguments");
});

test("Custom task is called correctly", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(false);
	const mockSpecVersion = {
		toString: () => "2.6",
		gte: specVersionGteStub
	};

	const getRequiredDependenciesCallbackStub = sinon.stub().resolves(undefined);
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	t.context.taskUtil.getInterface.returns("taskUtil interface");
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.a", "dep.b"]),
		"Custom tasks requires all dependencies by default");
	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 2, "SpecificationVersion#gte got called twice");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on second call");

	t.is(createDependencyReaderStub.callCount, 1, "_createDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.a", "dep.b"]),
		"_createDependenciesReader got called with correct arguments");

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
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with legacy spec version", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(false);
	const mockSpecVersion = {
		toString: () => "1.0",
		gte: specVersionGteStub
	};
	const getRequiredDependenciesCallbackStub = sinon.stub().resolves(undefined);
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.a", "dep.b"]),
		"Custom tasks requires all dependencies by default");

	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 2, "SpecificationVersion#gte got called twice");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on second call");

	t.is(createDependencyReaderStub.callCount, 1, "_createDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.a", "dep.b"]),
		"_createDependenciesReader got called with correct arguments");

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
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with legacy spec version and requiredDependenciesCallback", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(false);
	const mockSpecVersion = {
		toString: () => "1.0",
		gte: specVersionGteStub
	};
	const requiredDependenciesCallbackStub = sinon.stub().resolves(new Set(["dep.b"]));
	const getRequiredDependenciesCallbackStub = sinon.stub().resolves(requiredDependenciesCallbackStub);
	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.b"]),
		"Custom tasks requires all dependencies by default");

	t.is(requiredDependenciesCallbackStub.callCount, 1, "requiredDependenciesCallback got called once");
	t.deepEqual(requiredDependenciesCallbackStub.getCall(0).args[0], {
		availableDependencies: new Set(["dep.a", "dep.b"])
	}, "requiredDependenciesCallback got called with expected arguments");

	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 2, "SpecificationVersion#gte got called twice");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on second call");

	t.is(createDependencyReaderStub.callCount, 1, "_createDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.b"]),
		"_createDependenciesReader got called with correct arguments");

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
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with specVersion 3.0", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(true);
	const mockSpecVersion = {
		toString: () => "3.0",
		gte: specVersionGteStub
	};

	const requiredDependenciesCallbackStub = sinon.stub().resolves(new Set(["dep.b"]));
	const getRequiredDependenciesCallbackStub = sinon.stub()
		.resolves(requiredDependenciesCallbackStub);

	graph.getExtension.returns({
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.is(requiredDependenciesCallbackStub.callCount, 1, "requiredDependenciesCallback got called once");
	const requiredDependenciesCallbackArgs = requiredDependenciesCallbackStub.getCall(0).args[0];

	t.is(typeof requiredDependenciesCallbackArgs.getProject, "function", "getProject function provided");
	requiredDependenciesCallbackArgs.getProject("some.project");
	t.is(taskUtil.getProject.callCount, 1, "taskUtil.getProject got called once");
	t.is(taskUtil.getProject.getCall(0).args[0], "some.project",
		"taskUtil.getProject got called with expected arguments");
	requiredDependenciesCallbackArgs.getProject = "getProject function";

	t.is(typeof requiredDependenciesCallbackArgs.getDependencies, "function", "getDependencies function provided");
	requiredDependenciesCallbackArgs.getDependencies("some.project");
	t.is(taskUtil.getDependencies.callCount, 2, "taskUtil.getDependencies got called twice");
	t.is(taskUtil.getDependencies.getCall(1).args[0], "some.project",
		"taskUtil.getDependencies got called with expected arguments");
	requiredDependenciesCallbackArgs.getDependencies = "getDependencies function";

	t.deepEqual(requiredDependenciesCallbackArgs, {
		availableDependencies: new Set(["dep.a", "dep.b"]),
		getProject: "getProject function",
		getDependencies: "getDependencies function",
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask",
			configuration: "configuration",
		}
	}, "requiredDependenciesCallback got called with expected arguments");

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.b"]),
		"Custom tasks requires all dependencies by default");
	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 2, "SpecificationVersion#gte got called twice");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on second call");

	t.is(taskUtil.getInterface.callCount, 2, "taskUtil#getInterface got called twice");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument on first call");
	t.is(taskUtil.getInterface.getCall(1).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument on second call");

	t.is(createDependencyReaderStub.callCount, 1, "_createDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.b"]),
		"_createDependenciesReader got called with correct arguments");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		log: "group logger",
		taskUtil,
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask", // specVersion 3.0 feature
			configuration: "configuration",
		},
	}, "Task got called with one argument");
});

test("Custom task with specVersion 3.0 and no requiredDependenciesCallback", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(true);
	const mockSpecVersion = {
		toString: () => "3.0",
		gte: specVersionGteStub
	};

	const getRequiredDependenciesCallbackStub = sinon.stub().resolves(undefined);

	graph.getExtension.returns({
		getName: () => "custom task name",
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(),
		"Custom tasks requires no dependencies by default");
	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 2, "SpecificationVersion#gte got called twice");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on second call");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument on first call");

	t.is(createDependencyReaderStub.callCount, 0, "_createDependenciesReader did not get called");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		log: "group logger",
		taskUtil,
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask", // specVersion 3.0 feature
			configuration: "configuration",
		},
	}, "Task got called with one argument");
});

test("Multiple custom tasks with same name are called correctly", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStubA = sinon.stub();
	const taskStubB = sinon.stub();
	const taskStubC = sinon.stub();
	const taskStubD = sinon.stub();
	const mockSpecVersionA = {
		toString: () => "2.5",
		gte: () => false
	};
	const mockSpecVersionB = {
		toString: () => "2.6",
		gte: () => false
	};
	const mockSpecVersionC = {
		toString: () => "3.0",
		gte: () => true
	};
	const mockSpecVersionD = {
		toString: () => "3.0",
		gte: () => true
	};
	const requiredDependenciesCallbackStubA = sinon.stub().resolves(new Set(["dep.b"]));
	const requiredDependenciesCallbackStubD = sinon.stub().resolves(new Set(["dep.a"]));
	const getRequiredDependenciesCallbackStub = sinon.stub()
		.resolves(null)
		.onCall(0).resolves(requiredDependenciesCallbackStubA)
		.onCall(3).resolves(requiredDependenciesCallbackStubD);

	graph.getExtension.onFirstCall().returns({
		getName: () => "Task Name A",
		getTask: () => taskStubA,
		getSpecVersion: () => mockSpecVersionA,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	graph.getExtension.onSecondCall().returns({
		getName: () => "Task Name B",
		getTask: () => taskStubB,
		getSpecVersion: () => mockSpecVersionB,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	graph.getExtension.onThirdCall().returns({
		getName: () => "Task Name C",
		getTask: () => taskStubC,
		getSpecVersion: () => mockSpecVersionC,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	graph.getExtension.onCall(3).returns({
		getName: () => "Task Name D",
		getTask: () => taskStubD,
		getSpecVersion: () => mockSpecVersionD,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "cat"},
		{name: "myTask", afterTask: "myTask", configuration: "dog"},
		{name: "myTask", afterTask: "myTask", configuration: "bird"},
		{name: "myTask", afterTask: "myTask", configuration: "bird"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	// getRequiredDependenciesCallbackStub is only called for specVersion >= 3.0
	t.is(getRequiredDependenciesCallbackStub.callCount, 4,
		"getRequiredDependenciesCallback stub was called for all tasks");
	t.is(requiredDependenciesCallbackStubA.callCount, 1,
		"requiredDependenciesCallback stub for task A was called once");
	t.is(requiredDependenciesCallbackStubD.callCount, 1,
		"requiredDependenciesCallback stub for Task D stub was called once");

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks A has been added to task map");
	t.truthy(taskRunner._tasks["myTask--2"], "Custom tasks B has been added to task map");
	t.truthy(taskRunner._tasks["myTask--3"], "Custom tasks C has been added to task map");
	t.truthy(taskRunner._tasks["myTask--4"], "Custom tasks D has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.b"]),
		"Custom tasks with legacy specVersion and requiredDependenciesCallback defines " +
		"required dependencies");
	t.deepEqual(taskRunner._tasks["myTask--2"].requiredDependencies, new Set(["dep.a", "dep.b"]),
		"Custom tasks with legacy specVersion require all dependencies by default");
	t.deepEqual(taskRunner._tasks["myTask--3"].requiredDependencies, new Set([]),
		"Custom tasks with specVersion 3.0 but no requiredDependenciesCallback " +
		"require no dependencies by default");
	t.deepEqual(taskRunner._tasks["myTask--4"].requiredDependencies, new Set(["dep.a"]),
		"Custom tasks with specVersion 3.0 and requiredDependenciesCallback defines " +
		"required dependencies");

	// "Last in is the first out"
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"myTask",
		"myTask--4",
		"myTask--3",
		"myTask--2",
	], "Correct order of custom tasks");

	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner.runTasks();

	t.is(taskUtil.getInterface.callCount, 5, "taskUtil#getInterface got called three times");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersionD,
		"taskUtil#getInterface got called with correct argument on first call");
	t.is(taskUtil.getInterface.getCall(1).args[0], mockSpecVersionA,
		"taskUtil#getInterface got called with correct argument on second call");
	t.is(taskUtil.getInterface.getCall(2).args[0], mockSpecVersionD,
		"taskUtil#getInterface got called with correct argument on third call");
	t.is(taskUtil.getInterface.getCall(3).args[0], mockSpecVersionC,
		"taskUtil#getInterface got called with correct argument on fourth call");
	t.is(taskUtil.getInterface.getCall(4).args[0], mockSpecVersionB,
		"taskUtil#getInterface got called with correct argument on fifth call");

	t.is(createDependencyReaderStub.callCount, 3, "_createDependenciesReader got called three times");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.b"]),
		"_createDependenciesReader got called with correct arguments on first call");
	t.deepEqual(createDependencyReaderStub.getCall(1).args[0],
		new Set(["dep.a"]),
		"_createDependenciesReader got called with correct arguments on second call");
	t.deepEqual(createDependencyReaderStub.getCall(2).args[0],
		new Set(["dep.a", "dep.b"]),
		"_createDependenciesReader got called with correct arguments on third call");

	t.is(taskStubA.callCount, 1, "Task A got called once");
	t.is(taskStubA.getCall(0).args.length, 1, "Task A got called with one argument");
	t.deepEqual(taskStubA.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "cat",
		}
	}, "Task A got called with one argument");

	t.is(taskStubB.callCount, 1, "Task B got called once");
	t.is(taskStubB.getCall(0).args.length, 1, "Task B got called with one argument");
	t.deepEqual(taskStubB.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		taskUtil,
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "dog",
		}
	}, "Task B got called with one argument");

	t.is(taskStubC.callCount, 1, "Task C got called once");
	t.is(taskStubC.getCall(0).args.length, 1, "Task C got called with one argument");
	t.deepEqual(taskStubC.getCall(0).args[0], {
		workspace: "workspace",
		log: "group logger",
		taskUtil,
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask--3",
			configuration: "bird",
		}
	}, "Task C got called with one argument");

	t.is(taskStubD.callCount, 1, "Task D got called once");
	t.is(taskStubD.getCall(0).args.length, 1, "Task D got called with one argument");
	t.deepEqual(taskStubD.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: "dependencies",
		log: "group logger",
		taskUtil,
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			taskName: "myTask--4",
			configuration: "bird",
		}
	}, "Task D got called with one argument");
});

test("Custom task: requiredDependenciesCallback returns unknown dependency", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(true);
	const mockSpecVersion = {
		toString: () => "3.0",
		gte: specVersionGteStub
	};

	const requiredDependenciesCallbackStub = sinon.stub().resolves(new Set(["dep.b", "other.dep"]));
	const getRequiredDependenciesCallbackStub = sinon.stub()
		.resolves(requiredDependenciesCallbackStub);

	graph.getExtension.returns({
		getName: () => "custom.task.a",
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await t.throwsAsync(taskRunner._initTasks(), {
		message:
		`'determineRequiredDependencies' callback function of custom task custom.task.a ` +
		`of project project.b must resolve with a subset of the the direct dependencies of the project. ` +
		`other.dep is not a direct dependency of the project.`
	}, "Threw with expected error message");
});


test("Custom task: requiredDependenciesCallback returns Array instead of Set", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const taskStub = sinon.stub();
	const specVersionGteStub = sinon.stub().returns(true);
	const mockSpecVersion = {
		toString: () => "3.0",
		gte: specVersionGteStub
	};

	const requiredDependenciesCallbackStub = sinon.stub().resolves(["dep.b"]);
	const getRequiredDependenciesCallbackStub = sinon.stub()
		.resolves(requiredDependenciesCallbackStub);

	graph.getExtension.returns({
		getName: () => "custom.task.a",
		getTask: () => taskStub,
		getSpecVersion: () => mockSpecVersion,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await t.throwsAsync(taskRunner._initTasks(), {
		message:
		`'determineRequiredDependencies' callback function of custom task custom.task.a ` +
		`of project project.b must resolve with Set.`
	}, "Threw with expected error message");
});

test.serial("_addTask", async (t) => {
	const {sinon, graph, taskUtil, taskRepository, TaskRunner} = t.context;

	const taskStub = sinon.stub();
	taskRepository.getTask.withArgs("standardTask").resolves({
		task: taskStub
	});

	const project = getMockProject("module");
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	taskRunner._addTask("standardTask");

	t.truthy(taskRunner._tasks["standardTask"], "Task has been added to task map");
	t.deepEqual(taskRunner._tasks["standardTask"].requiredDependencies, new Set(),
		"By default, no dependencies required");
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

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

	taskRunner._addTask("standardTask", {
		requiresDependencies: true,
		options: {
			myTaskOption: "cat",
		},
		taskFunction: taskStub
	});

	t.truthy(taskRunner._tasks["standardTask"], "Task has been added to task map");
	t.deepEqual(taskRunner._tasks["standardTask"].requiredDependencies, new Set(["dep.a", "dep.b"]),
		"All dependencies required");
	t.truthy(taskRunner._tasks["standardTask"].task, "Task function got set correctly");
	t.deepEqual(taskRunner._taskExecutionOrder, ["standardTask"], "Task got added to execution order");

	const createDependencyReaderStub = sinon.stub(taskRunner, "_createDependenciesReader").resolves("dependencies");
	await taskRunner._tasks["standardTask"].task({
		workspace: "workspace",
		dependencies: "dependencies",
	});

	t.is(taskRepository.getTask.callCount, 0, "taskRepository#getTask did not get called");
	t.is(createDependencyReaderStub.callCount, 0, "_createDependenciesReader did not get called");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.deepEqual(taskStub.getCall(0).args[0], {
		workspace: "workspace",
		dependencies: taskRunner._allDependenciesReader,
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
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

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
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();

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

test("getRequiredDependencies: Custom Task", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([]),
		"Project with custom task >= specVersion 3.0 and no requiredDependenciesCallback " +
		"requires no dependencies");
});

test("getRequiredDependencies: Default application", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("application");
	project.getBundles = () => [];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([]),
		"Default application project does not require dependencies");
});

test("getRequiredDependencies: Default library", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("library");
	project.getBundles = () => [];
	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set(["dep.a", "dep.b"]),
		"Default library project requires dependencies");
});

test("getRequiredDependencies: Default theme-library", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("theme-library");

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set(["dep.a", "dep.b"]),
		"Default theme-library project requires dependencies");
});

test("getRequiredDependencies: Default module", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner} = t.context;
	const project = getMockProject("module");

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([]),
		"Default module project does not require dependencies");
});

test("_createDependenciesReader", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner, resourceFactory} = t.context;
	const project = getMockProject("module");

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
	graph.traverseBreadthFirst.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.returns("custom reader collection");
	const res = await taskRunner._createDependenciesReader(new Set(["dep.a"]));

	t.is(graph.traverseBreadthFirst.callCount, 1, "ProjectGraph#traverseBreadthFirst got called once");
	t.is(graph.traverseBreadthFirst.getCall(0).args[0], "project.b",
		"ProjectGraph#traverseBreadthFirst called with correct project name for start");

	const traversalCallback = graph.traverseBreadthFirst.getCall(0).args[1];

	// Call with root project should be ignored
	await traversalCallback({
		project: {
			getName: () => "project.b",
			getReader: () => "project.b reader",
		}
	});
	await traversalCallback({
		project: {
			getName: () => "dep.a",
			getReader: () => "dep.a reader",
		}
	});
	await traversalCallback({
		project: {
			getName: () => "dep.b",
			getReader: () => "dep.b reader",
		}
	});
	await traversalCallback({
		project: {
			getName: () => "dep.c",
			getReader: () => "dep.c reader",
		}
	});
	await traversalCallback({
		project: {
			// Will be ignored as it is no (transitive) dependency of the project
			getName: () => "other project",
			getReader: () => "other project reader",
		}
	});
	t.is(resourceFactory.createReaderCollection.callCount, 1, "createReaderCollection got called once");
	t.deepEqual(resourceFactory.createReaderCollection.getCall(0).args[0], {
		name: "Reduced dependency reader collection of project project.b",
		readers: [
			"dep.a reader", "dep.b reader", "dep.c reader"
		]
	}, "createReaderCollection got called with correct arguments");
	t.is(res, "custom reader collection", "Returned expected value");
});

test("_createDependenciesReader: All dependencies required", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner, resourceFactory} = t.context;
	const project = getMockProject("module");

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
	graph.traverseBreadthFirst.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.returns("custom reader collection");
	const res = await taskRunner._createDependenciesReader(new Set(["dep.a", "dep.b"]));
	t.is(graph.traverseBreadthFirst.callCount, 0, "ProjectGraph#traverseBreadthFirst did not get called again");
	t.is(resourceFactory.createReaderCollection.callCount, 0, "createReaderCollection did not get called again");
	t.is(res, "reader collection", "Shared (all-)dependency reader returned");
});

test("_createDependenciesReader: No dependencies required", async (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner, resourceFactory} = t.context;
	const project = getMockProject("module");

	const taskRunner = new TaskRunner({
		project, graph, taskUtil, taskRepository, log, buildConfig
	});
	await taskRunner._initTasks();
	graph.traverseBreadthFirst.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.returns("custom reader collection");
	const res = await taskRunner._createDependenciesReader(new Set());
	t.is(graph.traverseBreadthFirst.callCount, 1, "ProjectGraph#traverseBreadthFirst got called once");
	t.is(resourceFactory.createReaderCollection.callCount, 1, "createReaderCollection got called once");
	t.deepEqual(resourceFactory.createReaderCollection.getCall(0).args[0].readers, [],
		"createReaderCollection got called with no readers");
	t.is(res, "custom reader collection", "Shared (all-)dependency reader returned");
});

