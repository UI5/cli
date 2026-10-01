import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import {setLogLevel} from "@ui5/logger";
setLogLevel("perf");

function noop() {}
function emptyarray() {
	return [];
}

// A task receives its taskUtil wrapped in a MonitoredTaskUtil, which records the inputs the task
// reads. The wrapper exposes getInputRecording() and delegates every other member to the underlying
// taskUtil, so a wrapped member reads back the underlying value.
function assertMonitoredTaskUtil(t, actual, {delegates} = {}) {
	t.is(typeof actual.getInputRecording, "function", "task received a MonitoredTaskUtil");
	t.deepEqual(actual.getInputRecording(), [], "no task inputs recorded");
	if (delegates) {
		for (const [key, value] of Object.entries(delegates)) {
			t.is(actual[key], value, `MonitoredTaskUtil delegates '${key}' to the underlying taskUtil`);
		}
	}
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
				gte: () => false,
				lt: () => true
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
		getWorkspace: () => {
			return {
				getName: () => "workspace"
			};
		},
		isFrameworkProject: () => false,
		sealWorkspace: noop,
		createNewWorkspaceVersion: noop,
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
		getStepBased: async () => false,
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

	t.context.projectBuildLogger = {
		setTasks: sinon.stub(),
		startTask: sinon.stub(),
		endTask: sinon.stub(),
		skipTask: sinon.stub(),
		verbose: sinon.stub(),
		perf: sinon.stub(),
		isLevelEnabled: sinon.stub().returns(true),
	};

	t.context.buildCache = {
		setTasks: sinon.stub(),
		prepareTaskExecutionAndValidateCache: sinon.stub().resolves(false),
		recordTaskResult: sinon.stub().resolves(),
		allTasksCompleted: sinon.stub().resolves([]),
		getStepInvocationData: sinon.stub().returns(undefined),
		getStepReturnValueStore: sinon.stub().returns(undefined),
		getResolveInputValue: sinon.stub().returns(undefined),
		setStepInvocationData: sinon.stub(),
		getStageId: sinon.stub().callsFake((taskName, stepName) =>
			stepName === undefined ? `task/${taskName}` : `task/${taskName}::step/${stepName}`),
	};

	t.context.resourceFactory = {
		createReaderCollection: sinon.stub()
			.returns({getName: () => "reader collection"}),
		createMonitor: sinon.stub().callsFake((resource) => {
			// Return a MonitoredReader-like object with both getName and getResourceRequests
			if (resource && typeof resource.getName === "function") {
				const name = resource.getName();
				return {
					constructor: {name: "MonitoredReader"},
					getName: () => name,
					getResourceRequests: sinon.stub().returns({paths: [], patterns: []})
				};
			}
			return resource;
		})
	};

	t.context.TaskRunner = await esmock("../../../lib/build/TaskRunner.js", {
		"@ui5/logger": t.context.logger,
		"@ui5/fs/resourceFactory": t.context.resourceFactory
	});
	t.context.TaskDefinitions = (await import("../../../lib/build/TaskDefinitions.js")).default;
});

// Builds a TaskRunner with a real TaskDefinitions wired up from the test context.
// All TaskRunner unit tests share the same dependency shape, so this helper avoids
// repeating the wiring at every call site.
function createTaskRunner(t, project, overrides = {}) {
	const {TaskRunner, TaskDefinitions, graph, taskUtil, taskRepository, projectBuildLogger, buildCache} = t.context;
	const taskDefinitions = overrides.taskDefinitions !== undefined ?
		overrides.taskDefinitions :
		new TaskDefinitions(graph, project, taskUtil, taskRepository);
	return new TaskRunner({
		project,
		graph,
		taskUtil,
		taskRepository,
		log: projectBuildLogger,
		buildCache,
		buildConfig,
		taskDefinitions,
		...overrides
	});
}

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Missing parameters", (t) => {
	const {graph, taskUtil, taskRepository, TaskRunner, projectBuildLogger, buildCache} = t.context;
	const taskDefinitions = {}; // contents irrelevant; only its presence is checked by the constructor
	t.throws(() => {
		new TaskRunner({
			graph,
			taskUtil,
			taskRepository,
			log: projectBuildLogger,
			buildCache,
			buildConfig,
			taskDefinitions
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing project parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			taskUtil,
			taskRepository,
			log: projectBuildLogger,
			buildCache,
			buildConfig,
			taskDefinitions
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing graph parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskRepository,
			log: projectBuildLogger,
			buildCache,
			buildConfig,
			taskDefinitions
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing taskUtil parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			log: projectBuildLogger,
			buildCache,
			buildConfig,
			taskDefinitions
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing taskRepository parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			taskRepository,
			buildConfig,
			taskDefinitions
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing log parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			taskRepository,
			log: projectBuildLogger,
			buildCache,
			taskDefinitions
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing buildConfig parameter");
	t.throws(() => {
		new TaskRunner({
			project: getMockProject("application"),
			graph,
			taskUtil,
			taskRepository,
			log: projectBuildLogger,
			buildCache,
			buildConfig
		});
	}, {
		message: "TaskRunner: One or more mandatory parameters not provided"
	}, "Threw with expected error message for missing taskDefinitions parameter");
});

test("_initTasks: Project of type 'application'", async (t) => {
	const taskRunner = createTaskRunner(t, getMockProject("application"));
	await taskRunner._initTasks();
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"minify",
		"enhanceManifest",
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
	const taskRunner = createTaskRunner(t, getMockProject("library"));
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
		"enhanceManifest",
		"generateComponentPreload",
		"generateLibraryPreload",
		"generateBundle",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("_initTasks: Project of type 'library' (framework project)", async (t) => {
	const project = getMockProject("library");
	project.isFrameworkProject = () => true;

	const taskRunner = createTaskRunner(t, project);
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
		"enhanceManifest",
		"generateComponentPreload",
		"generateLibraryPreload",
		"generateBundle",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("_initTasks: Project of type 'theme-library'", async (t) => {
	const taskRunner = createTaskRunner(t, getMockProject("theme-library"));
	await taskRunner._initTasks();

	t.deepEqual(taskRunner._taskExecutionOrder, [
		"replaceCopyright",
		"replaceVersion",
		"buildThemes",
		"generateThemeDesignerResources",
		"generateResourcesJson"
	], "Correct standard tasks");
});

test("_initTasks: Project of type 'theme-library' (framework project)", async (t) => {
	const project = getMockProject("theme-library");
	project.isFrameworkProject = () => true;

	const taskRunner = createTaskRunner(t, project);
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
	const taskRunner = createTaskRunner(t, getMockProject("module"));
	await taskRunner._initTasks();

	t.deepEqual(taskRunner._taskExecutionOrder, [], "Correct standard tasks");
});

test("_initTasks: Unknown project type", async (t) => {
	const taskRunner = createTaskRunner(t, getMockProject("pony"));
	const err = await t.throwsAsync(taskRunner._initTasks());

	t.is(err.message, "Unknown project type pony", "Threw with expected error message");
});

test("_initTasks: Custom tasks", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myOtherTask", beforeTask: "replaceVersion"}
	];
	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"myOtherTask",
		"replaceVersion",
		"minify",
		"myTask",
		"enhanceManifest",
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
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask", beforeTask: "myTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"myOtherTask",
		"myTask",
	], "ApplicationBuilder is still instantiated with standard tasks");
});

test("_initTasks: Custom tasks with no standard tasks and second task defining no before-/afterTask", async (t) => {
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"},
		{name: "myOtherTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Custom task definition myOtherTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with both, before- and afterTask reference", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "minify", afterTask: "replaceVersion"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines both ` +
		`"beforeTask" and "afterTask" parameters. Only one must be defined.`,
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with no before-/afterTask reference", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Custom task definition myTask of project project.b defines neither a ` +
		`"beforeTask" nor an "afterTask" parameter. One must be defined.`,
		"Threw with expected error message");
});

test("_initTasks: Custom tasks without name", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: ""}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Missing name for custom task in configuration of project project.b`,
		"Threw with expected error message");
});

test("_initTasks: Custom task with name of standard tasks", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "replaceVersion", afterTask: "minify"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Custom task configuration of project project.b references standard task replaceVersion. " +
		"Only custom tasks must be provided here.",
		"Threw with expected error message");
});

test("_initTasks: Multiple custom tasks with same name", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"},
		{name: "myTask", afterTask: "myTask"},
		{name: "myTask", afterTask: "minify"}
	];
	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	t.deepEqual(taskRunner._taskExecutionOrder, [
		"escapeNonAsciiCharacters",
		"replaceCopyright",
		"replaceVersion",
		"minify",
		"myTask--3",
		"myTask",
		"myTask--2",
		"enhanceManifest",
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
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "unknownTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with unknown afterTask", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "unknownTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Could not find task unknownTask, referenced by custom task myTask, " +
		"to be scheduled for project project.b",
		"Threw with expected error message");
});

test("_initTasks: Custom tasks is unknown", async (t) => {
	const {graph} = t.context;
	graph.getExtension.returns(undefined);
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "minify"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		"Could not find custom task myTask, referenced by project project.b in project " +
		"graph with root node graph-root",
		"Threw with expected error message");
});

test("_initTasks: Custom tasks with removed beforeTask", async (t) => {
	const project = getMockProject("application");
	project.getCustomTasks = () => [
		{name: "myTask", beforeTask: "removedTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	const err = await t.throwsAsync(async () => {
		await taskRunner._initTasks();
	});
	t.is(err.message,
		`Standard task removedTask, referenced by custom task myTask in project project.b, ` +
		`has been removed in this version of UI5 CLI and can't be referenced anymore. ` +
		`Please see the migration guide at https://ui5.github.io/cli/updates/migrate-v3/`,
		"Threw with expected error message");
});

test("_initTasks: Create dependencies reader for all dependencies", async (t) => {
	const {graph, resourceFactory} = t.context;
	const project = getMockProject("application");
	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	// Dependencies reader is now created lazily via getDependenciesReader
	// Use forceUpdate=true to bypass the cache shortcut and actually trigger graph traversal
	const readerPromise = taskRunner.getDependenciesReader(new Set(["dep.a", "dep.b"]), true);
	// Verify traverseBreadthFirst was called
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
			getName: () => "dep.c",
			getReader: () => "dep.c reader",
		}
	});
	// Now wait for the reader to be created
	await readerPromise;
	t.is(resourceFactory.createReaderCollection.callCount, 1, "createReaderCollection got called once");
	t.deepEqual(resourceFactory.createReaderCollection.getCall(0).args[0], {
		name: "Reduced dependency reader collection of project project.b",
		readers: [
			"dep.a reader", "dep.b reader", "dep.c reader"
		]
	}, "createReaderCollection got called with correct arguments");
});

test("Custom task is called correctly", async (t) => {
	const {sinon, graph, taskUtil} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	t.context.taskUtil.getInterface.returns({isTaskUtilInterface: true});
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.a", "dep.b"]),
		"Custom tasks requires all dependencies by default");
	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 3, "SpecificationVersion#gte got called three times");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "5.0",
		"SpecificationVersion#gte got called with correct arguments on second call (step-based opt-in)");
	t.is(specVersionGteStub.getCall(2).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on third call (task execution)");

	t.is(createDependencyReaderStub.callCount, 1, "getDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.a", "dep.b"]),
		"getDependenciesReader got called with correct arguments");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	const taskArgs = taskStub.getCall(0).args[0];
	t.is(taskArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	assertMonitoredTaskUtil(t, taskArgs.taskUtil, {delegates: {isTaskUtilInterface: true}});
	t.is(taskArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskArgs.options.configuration, "configuration", "configuration is correct");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with legacy spec version", async (t) => {
	const {sinon, graph, taskUtil} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.a", "dep.b"]),
		"Custom tasks requires all dependencies by default");

	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 3, "SpecificationVersion#gte got called three times");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "5.0",
		"SpecificationVersion#gte got called with correct arguments on second call (step-based opt-in)");
	t.is(specVersionGteStub.getCall(2).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on third call (task execution)");

	t.is(createDependencyReaderStub.callCount, 1, "getDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.a", "dep.b"]),
		"getDependenciesReader got called with correct arguments");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	const taskArgs = taskStub.getCall(0).args[0];
	t.is(taskArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskArgs.options.configuration, "configuration", "configuration is correct");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with legacy spec version and requiredDependenciesCallback", async (t) => {
	const {sinon, graph, taskUtil} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	t.context.taskUtil.getInterface.returns(undefined); // simulating no taskUtil for old specVersion
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(["dep.b"]),
		"Custom tasks requires all dependencies by default");

	t.is(requiredDependenciesCallbackStub.callCount, 1, "requiredDependenciesCallback got called once");
	t.deepEqual(requiredDependenciesCallbackStub.getCall(0).args[0], {
		availableDependencies: new Set(["dep.a", "dep.b"]),
		options: {
			projectName: "project.b",
			projectNamespace: "project/b",
			configuration: "configuration",
			taskName: "myTask"
		}
	}, "requiredDependenciesCallback got called with expected arguments");

	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 3, "SpecificationVersion#gte got called three times");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "5.0",
		"SpecificationVersion#gte got called with correct arguments on second call (step-based opt-in)");
	t.is(specVersionGteStub.getCall(2).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on third call (task execution)");

	t.is(createDependencyReaderStub.callCount, 1, "getDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.b"]),
		"getDependenciesReader got called with correct arguments");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	const taskArgs = taskStub.getCall(0).args[0];
	t.is(taskArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskArgs.options.configuration, "configuration", "configuration is correct");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument");
});

test("Custom task with specVersion 3.0", async (t) => {
	const {sinon, graph, taskUtil} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
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
	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 3, "SpecificationVersion#gte got called three times");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "5.0",
		"SpecificationVersion#gte got called with correct arguments on second call (step-based opt-in)");
	t.is(specVersionGteStub.getCall(2).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on third call (task execution)");

	t.is(taskUtil.getInterface.callCount, 2, "taskUtil#getInterface got called twice");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument on first call");
	t.is(taskUtil.getInterface.getCall(1).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument on second call");

	t.is(createDependencyReaderStub.callCount, 1, "getDependenciesReader got called once");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.b"]),
		"getDependenciesReader got called with correct arguments");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	const taskArgs = taskStub.getCall(0).args[0];
	t.is(taskArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskArgs.log, "group logger", "log is correct");
	assertMonitoredTaskUtil(t, taskArgs.taskUtil);
	t.is(taskArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskArgs.options.taskName, "myTask", "taskName is correct");
	t.is(taskArgs.options.configuration, "configuration", "configuration is correct");
});

test("Custom task with specVersion 3.0 and no requiredDependenciesCallback", async (t) => {
	const {sinon, graph, taskUtil} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();

	t.truthy(taskRunner._tasks["myTask"], "Custom tasks has been added to task map");
	t.deepEqual(taskRunner._tasks["myTask"].requiredDependencies, new Set(),
		"Custom tasks requires no dependencies by default");
	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	await taskRunner._tasks["myTask"].task();

	t.is(specVersionGteStub.callCount, 3, "SpecificationVersion#gte got called three times");
	t.is(specVersionGteStub.getCall(0).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on first call");
	t.is(specVersionGteStub.getCall(1).args[0], "5.0",
		"SpecificationVersion#gte got called with correct arguments on second call (step-based opt-in)");
	t.is(specVersionGteStub.getCall(2).args[0], "3.0",
		"SpecificationVersion#gte got called with correct arguments on third call (task execution)");

	t.is(taskUtil.getInterface.callCount, 1, "taskUtil#getInterface got called once");
	t.is(taskUtil.getInterface.getCall(0).args[0], mockSpecVersion,
		"taskUtil#getInterface got called with correct argument on first call");

	t.is(createDependencyReaderStub.callCount, 0, "getDependenciesReader did not get called");

	t.is(taskStub.callCount, 1, "Task got called once");
	t.is(taskStub.getCall(0).args.length, 1, "Task got called with one argument");
	const taskArgs = taskStub.getCall(0).args[0];
	t.is(taskArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskArgs.log, "group logger", "log is correct");
	assertMonitoredTaskUtil(t, taskArgs.taskUtil);
	t.is(taskArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskArgs.options.taskName, "myTask", "taskName is correct");
	t.is(taskArgs.options.configuration, "configuration", "configuration is correct");
});

test("Multiple custom tasks with same name are called correctly", async (t) => {
	const {sinon, graph, taskUtil, projectBuildLogger} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	graph.getExtension.onSecondCall().returns({
		getName: () => "Task Name B",
		getTask: () => taskStubB,
		getSpecVersion: () => mockSpecVersionB,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	graph.getExtension.onThirdCall().returns({
		getName: () => "Task Name C",
		getTask: () => taskStubC,
		getSpecVersion: () => mockSpecVersionC,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	graph.getExtension.onCall(3).returns({
		getName: () => "Task Name D",
		getTask: () => taskStubD,
		getSpecVersion: () => mockSpecVersionD,
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "cat"},
		{name: "myTask", afterTask: "myTask", configuration: "dog"},
		{name: "myTask", afterTask: "myTask", configuration: "bird"},
		{name: "myTask", afterTask: "myTask", configuration: "bird"}
	];
	const taskRunner = createTaskRunner(t, project);
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

	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	await taskRunner.runTasks();

	t.is(projectBuildLogger.setTasks.callCount, 1, "ProjectBuildLogger#setTask got called once");
	t.deepEqual(projectBuildLogger.setTasks.firstCall.firstArg, [
		"myTask",
		"myTask--4",
		"myTask--3",
		"myTask--2",
	], "ProjectBuildLogger#setTask got called with expected argument");

	t.is(projectBuildLogger.startTask.callCount, 4, "ProjectBuildLogger#startTask got called four times");
	t.deepEqual(projectBuildLogger.startTask.getCalls().map((call) => call.firstArg), [
		"myTask",
		"myTask--4",
		"myTask--3",
		"myTask--2",
	], "ProjectBuildLogger#startTask got called with expected arguments");
	t.is(projectBuildLogger.endTask.callCount, 4, "ProjectBuildLogger#endTask got called four times");
	t.deepEqual(projectBuildLogger.endTask.getCalls().map((call) => call.firstArg), [
		"myTask",
		"myTask--4",
		"myTask--3",
		"myTask--2",
	], "ProjectBuildLogger#endTask got called with expected arguments");

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

	t.is(createDependencyReaderStub.callCount, 4, "getDependenciesReader got called four times");
	t.deepEqual(createDependencyReaderStub.getCall(0).args[0],
		new Set(["dep.a", "dep.b"]),
		"getDependenciesReader got called with correct arguments on first call (runTasks init)");
	t.deepEqual(createDependencyReaderStub.getCall(1).args[0],
		new Set(["dep.b"]),
		"getDependenciesReader got called with correct arguments on second call (Task A)");
	t.deepEqual(createDependencyReaderStub.getCall(2).args[0],
		new Set(["dep.a"]),
		"getDependenciesReader got called with correct arguments on third call (Task D)");
	t.deepEqual(createDependencyReaderStub.getCall(3).args[0],
		new Set(["dep.a", "dep.b"]),
		"getDependenciesReader got called with correct arguments on fourth call (Task B)");

	t.is(taskStubA.callCount, 1, "Task A got called once");
	t.is(taskStubA.getCall(0).args.length, 1, "Task A got called with one argument");
	const taskAArgs = taskStubA.getCall(0).args[0];
	t.is(taskAArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskAArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskAArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskAArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskAArgs.options.configuration, "cat", "configuration is correct");

	t.is(taskStubB.callCount, 1, "Task B got called once");
	t.is(taskStubB.getCall(0).args.length, 1, "Task B got called with one argument");
	const taskBArgs = taskStubB.getCall(0).args[0];
	t.is(taskBArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskBArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskBArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskBArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskBArgs.options.configuration, "dog", "configuration is correct");

	t.is(taskStubC.callCount, 1, "Task C got called once");
	t.is(taskStubC.getCall(0).args.length, 1, "Task C got called with one argument");
	const taskCArgs = taskStubC.getCall(0).args[0];
	t.is(taskCArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskCArgs.log, "group logger", "log is correct");
	assertMonitoredTaskUtil(t, taskCArgs.taskUtil);
	t.is(taskCArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskCArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskCArgs.options.taskName, "myTask--3", "taskName is correct");
	t.is(taskCArgs.options.configuration, "bird", "configuration is correct");

	t.is(taskStubD.callCount, 1, "Task D got called once");
	t.is(taskStubD.getCall(0).args.length, 1, "Task D got called with one argument");
	const taskDArgs = taskStubD.getCall(0).args[0];
	t.is(taskDArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskDArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskDArgs.log, "group logger", "log is correct");
	assertMonitoredTaskUtil(t, taskDArgs.taskUtil);
	t.is(taskDArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskDArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskDArgs.options.taskName, "myTask--4", "taskName is correct");
	t.is(taskDArgs.options.configuration, "bird", "configuration is correct");
});

test("Custom task: requiredDependenciesCallback returns unknown dependency", async (t) => {
	const {sinon, graph} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
	await t.throwsAsync(taskRunner._initTasks(), {
		message:
		`'determineRequiredDependencies' callback function of custom task custom.task.a ` +
		`of project project.b must resolve with a subset of the the direct dependencies of the project. ` +
		`other.dep is not a direct dependency of the project.`
	}, "Threw with expected error message");
});


test("Custom task: requiredDependenciesCallback returns Array instead of Set", async (t) => {
	const {sinon, graph} = t.context;
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
		getRequiredDependenciesCallback: getRequiredDependenciesCallbackStub,
		getStepBased: async () => false,
	});

	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask", configuration: "configuration"}
	];

	const taskRunner = createTaskRunner(t, project);
	await t.throwsAsync(taskRunner._initTasks(), {
		message:
		`'determineRequiredDependencies' callback function of custom task custom.task.a ` +
		`of project project.b must resolve with Set.`
	}, "Threw with expected error message");
});

test("Custom task attached to a disabled task", async (t) => {
	const {taskRepository, projectBuildLogger, sinon, customTask} = t.context;

	const project = getMockProject("application");
	const customTaskFnStub = sinon.stub();
	project.getBundles = emptyarray;
	project.getCustomTasks = () => [
		{name: "myTask", afterTask: "generateBundle", configuration: "dog"}
	];

	// Standard tasks are step-based factories; the stub returns an empty step list so the step runner is
	// a no-op and this test only exercises task ordering and the custom task's execution.
	taskRepository.getTask = sinon.stub().returns({task: sinon.stub().returns([])});
	customTask.getTask = () => customTaskFnStub;

	const taskRunner = createTaskRunner(t, project);

	await taskRunner.runTasks();

	const setTasksArgs = projectBuildLogger.setTasks.firstCall.args[0];
	t.true(setTasksArgs.includes("myTask"), "Custom task 'myTask' is queried");
	t.is(customTaskFnStub.calledOnce, true, "Custom task 'myTask' is executed");
	t.false(setTasksArgs.includes("generateBundle"),
		"generateBundle standard task is excluded from the execution list");

	t.deepEqual(
		setTasksArgs,
		[
			"escapeNonAsciiCharacters",
			"replaceCopyright",
			"replaceVersion",
			"minify",
			"enhanceManifest",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"myTask",
			"generateVersionInfo",
		],
		"Correct tasks execution");
});

test.serial("_addTask", async (t) => {
	const {sinon, taskRepository} = t.context;

	const taskStub = sinon.stub();
	taskRepository.getTask.withArgs("standardTask").resolves({
		task: taskStub
	});

	const project = getMockProject("module");
	const taskRunner = createTaskRunner(t, project);
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
	const taskCallArgs = taskStub.getCall(0).args[0];
	t.is(taskCallArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskCallArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskCallArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	assertMonitoredTaskUtil(t, taskCallArgs.taskUtil);
});

test.serial("_addTask with options", async (t) => {
	const {sinon, taskRepository} = t.context;
	const taskStub = sinon.stub();
	const project = getMockProject("module");

	const taskRunner = createTaskRunner(t, project);
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

	// Warm the cache (normally done by runTasks)
	await taskRunner.getDependenciesReader(new Set(["dep.a", "dep.b"]), true);
	const createDependencyReaderStub = sinon.stub(taskRunner, "getDependenciesReader")
		.resolves({getName: () => "dependencies"});
	// Call the task wrapper without parameters (it creates workspace/dependencies internally)
	await taskRunner._tasks["standardTask"].task();

	t.is(taskRepository.getTask.callCount, 0, "taskRepository#getTask did not get called");
	t.is(createDependencyReaderStub.callCount, 0, "getDependenciesReader did not get called (using cached reader)");

	t.is(taskStub.callCount, 1, "Task got called once");
	const taskCallArgs = taskStub.getCall(0).args[0];
	t.is(taskCallArgs.workspace.constructor.name, "MonitoredReader", "workspace is MonitoredReader");
	t.is(taskCallArgs.dependencies.constructor.name, "MonitoredReader", "dependencies is MonitoredReader");
	t.is(taskCallArgs.options.projectName, "project.b", "projectName is correct");
	t.is(taskCallArgs.options.projectNamespace, "project/b", "projectNamespace is correct");
	t.is(taskCallArgs.options.myTaskOption, "cat", "myTaskOption is correct");
	assertMonitoredTaskUtil(t, taskCallArgs.taskUtil);
});

// A fake AbstractReader-like project reader. Answers byPath/byGlob for the pass-through path and
// exposes the _byPath/_byGlob hooks a real MonitoredReader delegates to once the reader is wrapped.
function fakeProjectReader(name) {
	return {
		getName: () => name,
		byPath: async (virPath) => ({getPath: () => virPath}),
		byGlob: async () => [],
		_byPath: async (virPath) => ({getPath: () => virPath}),
		_byGlob: async () => [],
	};
}

test.serial("Folds taskUtil project-reader reads into the recorded resource requests", async (t) => {
	const {sinon, taskUtil, buildCache} = t.context;
	const project = getMockProject("module");

	// getProject() (no arg) / "project.b" is the project being built; "dep.a" is a dependency.
	taskUtil.getProject.callsFake((name) => {
		if (name === undefined || name === "project.b") {
			return {getName: () => "project.b", getReader: () => fakeProjectReader("project.b reader")};
		}
		if (name === "dep.a") {
			return {getName: () => "dep.a", getReader: () => fakeProjectReader("dep.a reader")};
		}
		return undefined;
	});

	const taskStub = sinon.stub().callsFake(async (params) => {
		await params.taskUtil.getProject().getReader().byPath("/resources/project/b/own.js");
		await params.taskUtil.getProject("dep.a").getReader().byGlob("/resources/dep/a/**");
	});

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	taskRunner._addTask("standardTask", {requiresDependencies: true, taskFunction: taskStub});

	// Warm the cached dependencies reader (normally done by runTasks)
	await taskRunner.getDependenciesReader(new Set(["dep.a", "dep.b"]), true);
	await taskRunner._tasks["standardTask"].task();

	t.is(taskStub.callCount, 1, "task executed");
	const [, projectResourceRequests, dependencyResourceRequests] = buildCache.recordTaskResult.getCall(0).args;
	t.deepEqual(projectResourceRequests, {
		paths: ["/resources/project/b/own.js"],
		patterns: [],
	}, "reads of the project being built are folded into the project resource requests");
	t.deepEqual(dependencyResourceRequests, {
		paths: [],
		patterns: ["/resources/dep/a/**"],
	}, "reads of a dependency's reader are folded into the dependency resource requests");
});

test("_addTask: Duplicate task", async (t) => {
	const project = getMockProject("module");
	const taskRunner = createTaskRunner(t, project);
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
	const project = getMockProject("module");
	const taskRunner = createTaskRunner(t, project);
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
	const project = getMockProject("module");
	project.getCustomTasks = () => [
		{name: "myTask"}
	];
	const taskRunner = createTaskRunner(t, project);
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([]),
		"Project with custom task >= specVersion 3.0 and no requiredDependenciesCallback " +
		"requires no dependencies");
});

test("getRequiredDependencies: Default application", async (t) => {
	// This test includes a mock project of type "application".
	// By default, builds of this project type always contain the "generateVersionInfo" task,
	// which requires dependencies to be built.

	const project = getMockProject("application");
	project.getBundles = () => [];
	const taskRunner = createTaskRunner(t, project);
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([
		"dep.a",
		"dep.b",
	]), "Default application project DOES require dependencies");
});

test("getRequiredDependencies: Default component", async (t) => {
	const project = getMockProject("component");
	project.getBundles = () => [];
	const taskRunner = createTaskRunner(t, project);
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([]),
		"Default component project does not require dependencies");
});

test("getRequiredDependencies: Default library", async (t) => {
	const project = getMockProject("library");
	project.getBundles = () => [];
	const taskRunner = createTaskRunner(t, project);
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set(["dep.a", "dep.b"]),
		"Default library project requires dependencies");
});

test("getRequiredDependencies: Default theme-library", async (t) => {
	const project = getMockProject("theme-library");

	const taskRunner = createTaskRunner(t, project);
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set(["dep.a", "dep.b"]),
		"Default theme-library project requires dependencies");
});

test("getRequiredDependencies: Default module", async (t) => {
	const project = getMockProject("module");

	const taskRunner = createTaskRunner(t, project);
	t.deepEqual(await taskRunner.getRequiredDependencies(), new Set([]),
		"Default module project does not require dependencies");
});

test("getDependenciesReader", async (t) => {
	const {graph, resourceFactory} = t.context;
	const project = getMockProject("module");

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	graph.traverseBreadthFirst.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.returns({getName: () => "custom reader collection"});
	const res = await taskRunner.getDependenciesReader(new Set(["dep.a"]));

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
	t.is(res.getName(), "custom reader collection", "Returned expected value");
});

test("getDependenciesReader: All dependencies required", async (t) => {
	const {graph, resourceFactory} = t.context;
	const project = getMockProject("module");

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	// Initialize the cache by calling getDependenciesReader with a subset first to avoid the shortcut
	// Then call with forceUpdate to populate the cache
	const cachedReader = await taskRunner.getDependenciesReader(new Set(["dep.a", "dep.b"]), true);
	graph.traverseBreadthFirst.reset(); // Ignore the call in init
	resourceFactory.createReaderCollection.reset(); // Ignore the call in init
	resourceFactory.createReaderCollection.returns({getName: () => "custom reader collection"});
	const res = await taskRunner.getDependenciesReader(new Set(["dep.a", "dep.b"]));
	t.is(graph.traverseBreadthFirst.callCount, 0, "ProjectGraph#traverseBreadthFirst did not get called again");
	t.is(resourceFactory.createReaderCollection.callCount, 0, "createReaderCollection did not get called again");
	t.is(res, cachedReader, "Shared (all-)dependency reader returned");
});

test("getDependenciesReader: No dependencies required", async (t) => {
	const {graph, resourceFactory} = t.context;
	const project = getMockProject("module");

	const taskRunner = createTaskRunner(t, project);
	await taskRunner._initTasks();
	graph.traverseBreadthFirst.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.reset(); // Ignore the call in initTask
	resourceFactory.createReaderCollection.returns({getName: () => "custom reader collection"});
	const res = await taskRunner.getDependenciesReader(new Set());
	t.is(graph.traverseBreadthFirst.callCount, 1, "ProjectGraph#traverseBreadthFirst got called once");
	t.is(resourceFactory.createReaderCollection.callCount, 1, "createReaderCollection got called once");
	t.deepEqual(resourceFactory.createReaderCollection.getCall(0).args[0].readers, [],
		"createReaderCollection got called with no readers");
	t.is(res.getName(), "custom reader collection", "Shared (all-)dependency reader returned");
});


// Integration: a step-based standard task built on the real MonitoredTaskUtil + StepRunner. A per-step
// non-resource input change (an env var one step reads) must re-run only that step, and a step served from
// cache must replay its recorded tag operations into the project tag collection.
test("Step-based task: a per-step input change re-runs only that step; a restored step replays its tags",
	async (t) => {
		const {sinon, projectBuildLogger} = t.context;

		// A mutable environment the step reads per key; the resolver re-derives the current value on the
		// delta build the same way the real ProjectBuildContext does.
		const env = {a: "1", b: "1"};
		const resolveInputValue = (type, name) => (type === "env" ? env[name] : undefined);

		// The taskUtil the per-step MonitoredTaskUtil wraps: getEnv is a tracked input, setTag passes
		// through to reach the tag collection when a step actually runs.
		const setTag = sinon.stub();
		const taskUtil = {
			isRootProject: sinon.stub().returns(true),
			getDependencies: sinon.stub().returns([]),
			getInterface: sinon.stub(),
			getEnv: (name) => env[name],
			setTag,
		};
		taskUtil.getInterface.returns(taskUtil);

		const ran = [];
		// A step factory: one map step keyed by "a"/"b" whose each reads an env var and tags its output.
		const build = () => [{
			name: "stepGroup",
			keys: async () => ["a", "b"],
			each: async (key, {taskUtil}) => {
				ran.push(key);
				taskUtil.getEnv(key);
				taskUtil.setTag({getPath: () => `/out/${key}`}, "ui5:IsBundle", true);
			},
		}];
		const taskDefinitions = {
			getTaskDefinitions: async () => ({
				standardTasks: new Map([
					["stepTask",
						{requiresDependencies: false, stepBased: true, options: {}, taskFunction: build}],
				]),
				customTasks: new Map(),
			}),
		};

		let capturedInvocationData;
		let deltaMode = false;
		const buildCache = {
			setTasks: sinon.stub(),
			recordTaskResult: sinon.stub().resolves(),
			allTasksCompleted: sinon.stub().resolves([]),
			getStageId: (taskName, stepName) =>
				stepName === undefined ? `task/${taskName}` : `task/${taskName}::step/${stepName}`,
			prepareTaskExecutionAndValidateCache: sinon.stub().callsFake(async () =>
				(deltaMode ? {changedProjectResourcePaths: [], changedDependencyResourcePaths: []} : false)),
			getStepInvocationData: sinon.stub().callsFake(() => capturedInvocationData),
			getStepReturnValueStore: sinon.stub().returns(undefined),
			getResolveInputValue: sinon.stub().returns(resolveInputValue),
			setStepInvocationData: sinon.stub().callsFake((name, data) => {
				capturedInvocationData = data;
			}),
		};

		const replayTagOperations = sinon.stub();
		const project = getMockProject("module");
		project.getProjectResources = () => ({replayTagOperations});

		const taskRunner = createTaskRunner(t, project, {taskUtil, buildCache, taskDefinitions});
		await taskRunner._initTasks();

		// Build 1 (full): both steps run and record their env input and tag operation.
		await taskRunner._tasks["stepTask"].task(projectBuildLogger);
		t.deepEqual(ran, ["a", "b"], "The full build ran every step");
		t.is(replayTagOperations.callCount, 0, "A full build restores no step, so nothing is replayed");

		// Build 2 (delta): only env var "a" changed, so step "a" re-runs and step "b" is restored.
		ran.length = 0;
		setTag.resetHistory();
		deltaMode = true;
		env.a = "2";
		await taskRunner._tasks["stepTask"].task(projectBuildLogger);

		t.deepEqual(ran, ["a"], "Only the step whose env input changed re-ran on the delta build");
		t.is(setTag.callCount, 1, "Only the re-run step set its tag live");
		t.is(setTag.getCall(0).args[0].getPath(), "/out/a", "The re-run step's live setTag targeted its own output");
		t.is(replayTagOperations.callCount, 1, "The restored step replayed its tag operations");
		t.deepEqual(replayTagOperations.getCall(0).args[0],
			[{op: "set", path: "/out/b", tag: "ui5:IsBundle", value: true}],
			"The restored step's recorded tag operation was replayed, so its tag survives");
	});

// Builds a custom task extension stub whose spec version is driven by the given gte(version) result and
// whose step-based opt-in is the given flag.
function createCustomTaskExtension(sinon, {taskFunction, gte, stepBased = false}) {
	return {
		getName: () => "myCustom",
		getSpecVersion: () => ({gte}),
		getTask: async () => taskFunction,
		getRequiredDependenciesCallback: sinon.stub().resolves(undefined),
		getStepBased: async () => stepBased,
	};
}

test("Step-based task: a full stage-cache hit re-runs a read-free consumer when its producer's return " +
	"changed", async (t) => {
	const {sinon, projectBuildLogger} = t.context;

	// A mutable env the producer reads; the resolver re-derives its current value on the delta build.
	const env = {x: "1"};
	const resolveInputValue = (type, name) => (type === "env" ? env[name] : undefined);
	const taskUtil = {
		isRootProject: sinon.stub().returns(true),
		getDependencies: sinon.stub().returns([]),
		getInterface: sinon.stub(),
		getEnv: (name) => env[name],
	};
	taskUtil.getInterface.returns(taskUtil);

	const ran = [];
	// A scalar producer 'scan' reads env x and returns it; a read-free scalar consumer 'use' consumes the
	// producer return via needs and writes nothing observable to a reader. 'use' has a constant stage
	// signature, so its verdict is a full hit even when 'scan' re-ran with a changed return.
	const build = () => [
		{name: "scan", run: async ({taskUtil}) => ({v: taskUtil.getEnv("x")})},
		{name: "use", needs: ["scan"], run: async ({needs}) => {
			ran.push(`use:${needs.scan.v}`);
		}},
	];
	const taskDefinitions = {
		getTaskDefinitions: async () => ({
			standardTasks: new Map([
				["stepTask", {requiresDependencies: false, stepBased: true, options: {}, taskFunction: build}],
			]),
			customTasks: new Map(),
		}),
	};

	// Per-stage invocation data, keyed by stage id so 'scan' and 'use' carry their own data forward.
	const invocationByStage = new Map();
	const getStageId = (taskName, stepName) =>
		stepName === undefined ? `task/${taskName}` : `task/${taskName}::step/${stepName}`;
	// Build-2 verdicts per step: 'scan' is a delta (so its recorded env input re-selects it), 'use' is a
	// full stage-cache hit.
	let verdicts = {};
	const buildCache = {
		setTasks: sinon.stub(),
		recordTaskResult: sinon.stub().resolves(),
		allTasksCompleted: sinon.stub().resolves([]),
		getStageId,
		prepareTaskExecutionAndValidateCache: sinon.stub().callsFake(async (taskName, stepName) =>
			(stepName in verdicts ? verdicts[stepName] : false)),
		getStepInvocationData: sinon.stub().callsFake((stageId) => invocationByStage.get(stageId)),
		getStepReturnValueStore: sinon.stub().returns(undefined),
		getResolveInputValue: sinon.stub().returns(resolveInputValue),
		setStepInvocationData: sinon.stub().callsFake((stageId, data) => {
			invocationByStage.set(stageId, data);
		}),
		reopenStageForRerun: sinon.stub(),
	};

	const project = getMockProject("module");
	project.getProjectResources = () => ({replayTagOperations: sinon.stub()});

	const taskRunner = createTaskRunner(t, project, {taskUtil, buildCache, taskDefinitions});
	await taskRunner._initTasks();

	// Build 1 (full): both steps run; scan returns {v:"1"}, use records scan's return signature.
	await taskRunner._tasks["stepTask"].task(projectBuildLogger);
	t.deepEqual(ran, ["use:1"], "The full build ran the consumer with the producer's initial return");

	// Build 2: env x changed, so scan re-runs via delta and its return advances to {v:"2"}. use is a full
	// stage-cache hit, but its consumed needs return changed, so it must re-run.
	ran.length = 0;
	env.x = "2";
	verdicts = {
		scan: {changedProjectResourcePaths: [], changedDependencyResourcePaths: []},
		use: true,
	};
	await taskRunner._tasks["stepTask"].task(projectBuildLogger);

	t.deepEqual(ran, ["use:2"],
		"The read-free consumer re-ran despite a full stage-cache hit, with the producer's fresh return");
	t.is(buildCache.reopenStageForRerun.callCount, 1, "The consumer's stage was reopened for the re-run");
	t.deepEqual(buildCache.reopenStageForRerun.getCall(0).args, ["stepTask", "use"],
		"reopenStageForRerun targeted the consumer step's stage");
});

// runTasks calls a step-based task's factory to discover its step names, and the factory is called again to
// execute. A factory may branch on options.projectNamespace (generateThemeDesignerResources emits its
// libraryTheming step only for a namespace), so both calls have to see a complete options object. Otherwise
// discovery misses a stage that the step runner then asks for, and the build fails on the missing stage.
test("Step-based task: step discovery sees the same options as execution", async (t) => {
	const {sinon, taskUtil} = t.context;

	const factoryOptions = [];
	// Mirrors the generateThemeDesignerResources shape: a step that only exists for a namespace.
	const build = (options) => {
		factoryOptions.push({...options});
		const steps = [{name: "scan", run: async () => undefined}];
		if (options.projectNamespace) {
			steps.push({name: "namespaced", run: async () => undefined});
		}
		return steps;
	};
	const taskDefinitions = {
		getTaskDefinitions: async () => ({
			standardTasks: new Map([
				["stepTask",
					{requiresDependencies: false, stepBased: true, options: {}, taskFunction: build}],
			]),
			customTasks: new Map(),
		}),
	};

	// Only stages that setTasks created can be prepared, as in ProjectResources#useStage.
	const createdStages = new Set();
	const buildCache = {
		...t.context.buildCache,
		setTasks: sinon.stub().callsFake((tasks) => {
			for (const {taskName, stepNames} of tasks) {
				for (const stepName of stepNames ?? [undefined]) {
					createdStages.add(buildCache.getStageId(taskName, stepName));
				}
			}
		}),
		prepareTaskExecutionAndValidateCache: sinon.stub().callsFake(async (taskName, stepName) => {
			const stageId = buildCache.getStageId(taskName, stepName);
			if (!createdStages.has(stageId)) {
				throw new Error(`Stage '${stageId}' does not exist`);
			}
			return false;
		}),
	};

	const project = getMockProject("module");
	project.getProjectResources = () => ({replayTagOperations: sinon.stub()});

	const taskRunner = createTaskRunner(t, project, {taskUtil, buildCache, taskDefinitions});
	sinon.stub(taskRunner, "getDependenciesReader").resolves({getName: () => "dependencies"});

	await t.notThrowsAsync(taskRunner.runTasks(),
		"The step the factory emits for a namespace has a stage, so preparing it succeeds");

	t.is(factoryOptions.length, 2, "The factory was called for discovery and for execution");
	t.deepEqual(factoryOptions[0], factoryOptions[1],
		"Both calls received the same options, so they cannot return different steps");
	t.is(factoryOptions[0].projectNamespace, "project/b",
		"Step discovery already saw the project namespace");
	t.deepEqual(buildCache.setTasks.firstCall.firstArg,
		[{taskName: "stepTask", stepNames: ["scan", "namespaced"]}],
		"A stage was created for every step the factory emits");
});

// A step factory is required to be pure over its options. Nothing tracks an environment or clock read in a
// factory body, so an impure factory can return a different step set at execution time than at discovery.
// The stages come from the discovered set, so the mismatch has to be reported where it originates.
test("Step-based task: an impure factory returning different steps is rejected", async (t) => {
	const {sinon, projectBuildLogger, taskUtil} = t.context;

	let extraStep = false;
	const build = () => {
		const steps = [{name: "scan", run: async () => undefined}];
		if (extraStep) {
			steps.push({name: "sneaked", run: async () => undefined});
		}
		return steps;
	};
	const taskDefinitions = {
		getTaskDefinitions: async () => ({
			standardTasks: new Map([
				["stepTask",
					{requiresDependencies: false, stepBased: true, options: {}, taskFunction: build}],
			]),
			customTasks: new Map(),
		}),
	};

	const project = getMockProject("module");
	project.getProjectResources = () => ({replayTagOperations: sinon.stub()});

	const taskRunner = createTaskRunner(t, project, {taskUtil, taskDefinitions});
	sinon.stub(taskRunner, "getDependenciesReader").resolves({getName: () => "dependencies"});
	await taskRunner._initTasks();

	// Discovery observes ["scan"], the execution call then adds a step whose stage was never created.
	const discovery = taskRunner.runTasks;
	const origTask = taskRunner._tasks["stepTask"].task;
	taskRunner._tasks["stepTask"].task = async (log) => {
		extraStep = true;
		return origTask(log);
	};

	await t.throwsAsync(discovery.call(taskRunner), {
		message: "Step factory of task stepTask for project project.b returned different steps than " +
			"during step discovery: expected [scan] but got [scan, sneaked]. A step factory must be pure " +
			"over its options, since its steps are promoted to pipeline stages before the build runs",
	}, "The divergence is reported against the factory, naming both step lists");

	t.is(projectBuildLogger.skipTask.callCount, 0, "No step was driven after the mismatch");
});

// Integration: the custom-task path drives the same real MonitoredTaskUtil + StepRunner as the standard-task
// path, gated at Specification Version 5.0 via the static stepBased export. A per-step input change (an env
// var one step reads) re-runs only that step, a restored step replays its tags, and the runner's outcome is
// folded into recordTaskResult (step-based flag set, invocation data persisted).
test("Step-based custom task: bound at Specification Version 5.0, folds the runner outcome",
	async (t) => {
		const {sinon, projectBuildLogger} = t.context;

		const env = {a: "1", b: "1"};
		const resolveInputValue = (type, name) => (type === "env" ? env[name] : undefined);

		const setTag = sinon.stub();
		const taskUtil = {
			isRootProject: sinon.stub().returns(true),
			getDependencies: sinon.stub().returns([]),
			getInterface: sinon.stub(),
			getEnv: (name) => env[name],
			setTag,
		};
		taskUtil.getInterface.returns(taskUtil);

		const ran = [];
		const build = () => [{
			name: "stepGroup",
			keys: async () => ["a", "b"],
			each: async (key, {taskUtil}) => {
				ran.push(key);
				taskUtil.getEnv(key);
				taskUtil.setTag({getPath: () => `/out/${key}`}, "ui5:IsBundle", true);
			},
		}];

		const taskDefinitions = {
			getTaskDefinitions: async () => ({
				standardTasks: new Map(),
				customTasks: new Map([
					["myCustom", {
						taskDef: {name: "myCustom"},
						task: createCustomTaskExtension(sinon, {taskFunction: build, gte: () => true, stepBased: true}),
					}],
				]),
			}),
		};

		let capturedInvocationData;
		let deltaMode = false;
		const buildCache = {
			setTasks: sinon.stub(),
			recordTaskResult: sinon.stub().resolves(),
			allTasksCompleted: sinon.stub().resolves([]),
			getStageId: (taskName, stepName) =>
				stepName === undefined ? `task/${taskName}` : `task/${taskName}::step/${stepName}`,
			prepareTaskExecutionAndValidateCache: sinon.stub().callsFake(async () =>
				(deltaMode ? {changedProjectResourcePaths: [], changedDependencyResourcePaths: []} : false)),
			getStepInvocationData: sinon.stub().callsFake(() => capturedInvocationData),
			getStepReturnValueStore: sinon.stub().returns(undefined),
			getResolveInputValue: sinon.stub().returns(resolveInputValue),
			setStepInvocationData: sinon.stub().callsFake((name, data) => {
				capturedInvocationData = data;
			}),
		};

		const replayTagOperations = sinon.stub();
		const project = getMockProject("module");
		project.getProjectResources = () => ({replayTagOperations});

		const taskRunner = createTaskRunner(t, project, {taskUtil, buildCache, taskDefinitions});
		await taskRunner._initTasks();

		// Build 1 (full): both steps run; the runner's outcome is folded into recordTaskResult.
		await taskRunner._tasks["myCustom"].task(projectBuildLogger);
		t.deepEqual(ran, ["a", "b"], "The full build ran every step");
		t.is(buildCache.setStepInvocationData.callCount, 1, "The invocation data was persisted");
		t.is(buildCache.recordTaskResult.getCall(0).args[6], true,
			"recordTaskResult was told the task ran the step runner");

		// Build 2 (delta): only env var "a" changed, so step "a" re-runs and step "b" is restored.
		ran.length = 0;
		setTag.resetHistory();
		deltaMode = true;
		env.a = "2";
		await taskRunner._tasks["myCustom"].task(projectBuildLogger);

		t.deepEqual(ran, ["a"], "Only the step whose env input changed re-ran on the delta build");
		t.is(setTag.callCount, 1, "Only the re-run step set its tag live");
		t.is(setTag.getCall(0).args[0].getPath(), "/out/a", "The re-run step's live setTag targeted its own output");
		t.is(replayTagOperations.callCount, 1, "The restored step replayed its tag operations");
		t.deepEqual(replayTagOperations.getCall(0).args[0],
			[{op: "set", path: "/out/b", tag: "ui5:IsBundle", value: true}],
			"The restored step's recorded tag operation was replayed, so its tag survives");
	});

// The gating decision: the step-based opt-in is honored only from Specification Version 5.0. A 4.0 custom
// task declaring stepBased still runs as a legacy body, so the step runner is never driven and the runner
// outcome is not folded into recordTaskResult.
test("Step-based custom task: the step-based export is ignored below Specification Version 5.0", async (t) => {
	const {sinon, projectBuildLogger} = t.context;

	let ran = false;
	const taskFunction = async () => {
		ran = true;
	};

	const taskDefinitions = {
		getTaskDefinitions: async () => ({
			standardTasks: new Map(),
			customTasks: new Map([
				["myCustom", {
					taskDef: {name: "myCustom"},
					// 4.0: gte("3.0") is true (an interface is provided), gte("5.0") is false, so the
					// stepBased export is not honored and the task runs as a legacy body.
					task: createCustomTaskExtension(sinon, {taskFunction, gte: (v) => v === "3.0", stepBased: true}),
				}],
			]),
		}),
	};

	const project = getMockProject("module");
	const taskRunner = createTaskRunner(t, project, {taskDefinitions});
	await taskRunner._initTasks();
	await taskRunner._tasks["myCustom"].task(projectBuildLogger);

	t.true(ran, "The legacy task body ran");
	t.falsy(t.context.buildCache.recordTaskResult.getCall(0).args[6],
		"The step-based export is ignored below 5.0, so the task did not run the step runner");
});

// Builds the fixture both step-based paths share for the reporting-order tests: a two-step task whose
// bodies append to `order`, next to a projectBuildLogger whose start/end/skip reports append to the same
// log. `fullyCached` makes every stage a cache hit, so the task must be reported skipped.
function createStepReportingFixture(t, {stepBased, fullyCached = false}) {
	const {sinon, projectBuildLogger} = t.context;
	const order = [];
	for (const method of ["startTask", "endTask", "skipTask"]) {
		projectBuildLogger[method].callsFake((taskName) => order.push(`${method}:${taskName}`));
	}

	const taskName = stepBased === "custom" ? "myCustom" : "stepTask";
	const build = () => ["s1", "s2"].map((name) => ({
		name,
		run: async () => {
			order.push(`run:${name}`);
		},
	}));

	const standardTasks = stepBased === "custom" ? new Map() : new Map([
		["stepTask", {requiresDependencies: false, stepBased: true, options: {}, taskFunction: build}],
	]);
	const customTasks = stepBased === "custom" ? new Map([
		["myCustom", {
			taskDef: {name: "myCustom"},
			task: createCustomTaskExtension(sinon, {taskFunction: build, gte: () => true, stepBased: true}),
		}],
	]) : new Map();
	const taskDefinitions = {getTaskDefinitions: async () => ({standardTasks, customTasks})};

	const buildCache = {
		...t.context.buildCache,
		getStageId: (taskName, stepName) =>
			stepName === undefined ? `task/${taskName}` : `task/${taskName}::step/${stepName}`,
		prepareTaskExecutionAndValidateCache: sinon.stub().resolves(fullyCached),
		getStepInvocationData: sinon.stub().returns(undefined),
		getStepReturnValueStore: sinon.stub().returns(undefined),
		getResolveInputValue: sinon.stub().returns(() => undefined),
		setStepInvocationData: sinon.stub(),
	};

	const project = getMockProject("module");
	project.getProjectResources = () => ({replayTagOperations: sinon.stub()});
	return {order, taskName, taskRunner: createTaskRunner(t, project, {buildCache, taskDefinitions})};
}

// The reporting contract a project-build-status consumer depends on: task-start announces work that is
// about to happen. A step-based task only learns its skip verdict while driving its stages, so it reports
// from the first stage that stops being a cache hit, before that stage runs anything.
for (const path of ["standard", "custom"]) {
	test(`Step-based ${path} task: reports itself started before its first step runs`, async (t) => {
		const {order, taskName, taskRunner} = createStepReportingFixture(t, {stepBased: path});
		await taskRunner._initTasks();

		await taskRunner._tasks[taskName].task(t.context.projectBuildLogger);

		t.deepEqual(order, [`startTask:${taskName}`, "run:s1", "run:s2", `endTask:${taskName}`],
			"The task was announced once, before any step ran, and closed after the last step");
	});

	test(`Step-based ${path} task: a fully cached task is reported skipped, not started`, async (t) => {
		const {order, taskName, taskRunner} =
			createStepReportingFixture(t, {stepBased: path, fullyCached: true});
		await taskRunner._initTasks();

		await taskRunner._tasks[taskName].task(t.context.projectBuildLogger);

		t.deepEqual(order, [`skipTask:${taskName}`], "A task whose every stage was cached only reports a skip");
	});
}
