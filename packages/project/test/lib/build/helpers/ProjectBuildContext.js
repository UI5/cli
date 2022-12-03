import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";

test.beforeEach((t) => {
	t.context.resourceTagCollection = new ResourceTagCollection({
		allowedTags: ["me:MyTag"]
	});
});
test.afterEach.always((t) => {
	sinon.restore();
});

import ProjectBuildContext from "../../../../lib/build/helpers/ProjectBuildContext.js";

test("Missing parameters", (t) => {
	t.throws(() => {
		new ProjectBuildContext({
			project: "project",
			log: "log",
		});
	}, {
		message: `Missing parameter 'buildContext'`
	}, "Correct error message");

	t.throws(() => {
		new ProjectBuildContext({
			buildContext: "buildContext",
			log: "log",
		});
	}, {
		message: `Missing parameter 'project'`
	}, "Correct error message");

	t.throws(() => {
		new ProjectBuildContext({
			buildContext: "buildContext",
			project: "project",
		});
	}, {
		message: `Missing parameter 'log'`
	}, "Correct error message");
});

test("isRootProject: true", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "root project",
		log: "log"
	});

	t.true(projectBuildContext.isRootProject(), "Correctly identified root project");
});

test("isRootProject: false", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "not the root project",
		log: "log"
	});

	t.false(projectBuildContext.isRootProject(), "Correctly identified non-root project");
});

test("getBuildOption", (t) => {
	const getOptionStub = sinon.stub().returns("pony");
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getOption: getOptionStub
		},
		project: "project",
		log: "log"
	});

	t.is(projectBuildContext.getOption("option"), "pony", "Returned value is correct");
	t.is(getOptionStub.getCall(0).args[0], "option", "getOption called with correct argument");
});

test("registerCleanupTask", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project: "project",
		log: "log"
	});
	projectBuildContext.registerCleanupTask("my task 1");
	projectBuildContext.registerCleanupTask("my task 2");

	t.is(projectBuildContext._queues.cleanup[0], "my task 1", "Cleanup task registered");
	t.is(projectBuildContext._queues.cleanup[1], "my task 2", "Cleanup task registered");
});

test("executeCleanupTasks", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project: "project",
		log: "log"
	});
	const task1 = sinon.stub().resolves();
	const task2 = sinon.stub().resolves();
	projectBuildContext.registerCleanupTask(task1);
	projectBuildContext.registerCleanupTask(task2);

	projectBuildContext.executeCleanupTasks();

	t.is(task1.callCount, 1, "Cleanup task 1 got called");
	t.is(task2.callCount, 1, "my task 2", "Cleanup task 2 got called");
});

test.serial("getResourceTagCollection", async (t) => {
	const projectAcceptsTagStub = sinon.stub().returns(false);
	projectAcceptsTagStub.withArgs("project-tag").returns(true);
	const projectContextAcceptsTagStub = sinon.stub().returns(false);
	projectContextAcceptsTagStub.withArgs("project-context-tag").returns(true);

	class DummyResourceTagCollection {
		constructor({allowedTags, allowedNamespaces}) {
			t.deepEqual(allowedTags, [
				"ui5:OmitFromBuildResult",
				"ui5:IsBundle"
			],
			"Correct allowedTags parameter supplied");

			t.deepEqual(allowedNamespaces, [
				"build"
			],
			"Correct allowedNamespaces parameter supplied");
		}
		acceptsTag(tag) {
			// Redirect to stub
			return projectContextAcceptsTagStub(tag);
		}
	}

	const ProjectBuildContext = await esmock("../../../../lib/build/helpers/ProjectBuildContext.js", {
		"@ui5/fs/internal/ResourceTagCollection": DummyResourceTagCollection
	});
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project: "project",
		log: "log"
	});

	const fakeProjectCollection = {
		acceptsTag: projectAcceptsTagStub
	};
	const fakeResource = {
		getProject: () => {
			return {
				getResourceTagCollection: () => fakeProjectCollection
			};
		},
		getPath: () => "/resource/path",
		hasProject: () => true
	};
	const collection1 = projectBuildContext.getResourceTagCollection(fakeResource, "project-tag");
	t.is(collection1, fakeProjectCollection, "Returned tag collection of resource project");

	const collection2 = projectBuildContext.getResourceTagCollection(fakeResource, "project-context-tag");
	t.true(collection2 instanceof DummyResourceTagCollection,
		"Returned tag collection of project build context");

	t.throws(() => {
		projectBuildContext.getResourceTagCollection(fakeResource, "not-accepted-tag");
	}, {
		message: `Could not find collection for resource /resource/path and tag not-accepted-tag`
	});
});

test("getResourceTagCollection: Assigns project to resource if necessary", (t) => {
	const fakeProject = {
		getName: () => "project"
	};
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project: fakeProject,
		log: {
			silly: () => {}
		}
	});

	const setProjectStub = sinon.stub();
	const fakeResource = {
		getProject: () => {
			return {
				getResourceTagCollection: () => {
					return {
						acceptsTag: () => false
					};
				}
			};
		},
		getPath: () => "/resource/path",
		hasProject: () => false,
		setProject: setProjectStub
	};
	projectBuildContext.getResourceTagCollection(fakeResource, "build:MyTag");
	t.is(setProjectStub.callCount, 1, "setProject got called once");
	t.is(setProjectStub.getCall(0).args[0], fakeProject, "setProject got called with correct argument");
});

test("getProject", (t) => {
	const project = "project";
	const getProjectStub = sinon.stub().returns("pony");
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getGraph: () => {
				return {
					getProject: getProjectStub
				};
			}
		},
		project,
		log: "log"
	});

	t.is(projectBuildContext.getProject("pony project"), "pony", "Returned correct value");
	t.is(getProjectStub.callCount, 1, "getProject got called once");
	t.is(getProjectStub.getCall(0).args[0], "pony project", "getProject got called with correct argument");

	t.is(projectBuildContext.getProject(), project);
	t.is(getProjectStub.callCount, 1, "getProject is not called again when requesting current project");
});

test("getProject: No name provided", (t) => {
	const project = "project";
	const getProjectStub = sinon.stub().returns("pony");
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getGraph: () => {
				return {
					getProject: getProjectStub
				};
			}
		},
		project,
		log: "log"
	});

	t.is(projectBuildContext.getProject(), "project", "Returned correct value");
	t.is(getProjectStub.callCount, 0, "getProject has not been called");
});

test("getDependencies", (t) => {
	const project = "project";
	const getDependenciesStub = sinon.stub().returns(["dep a", "dep b"]);
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getGraph: () => {
				return {
					getDependencies: getDependenciesStub
				};
			}
		},
		project,
		log: "log"
	});

	t.deepEqual(projectBuildContext.getDependencies("pony project"), ["dep a", "dep b"], "Returned correct value");
	t.is(getDependenciesStub.callCount, 1, "getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "pony project", "getProject got called with correct arguments");
});

test("getDependencies: No name provided", (t) => {
	const project = {getName: () => "project"};
	const getDependenciesStub = sinon.stub().returns(["dep a", "dep b"]);
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getGraph: () => {
				return {
					getDependencies: getDependenciesStub
				};
			}
		},
		project,
		log: "log"
	});

	t.deepEqual(projectBuildContext.getDependencies(), ["dep a", "dep b"], "Returned correct value");
	t.is(getDependenciesStub.callCount, 1, "getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "project", "getProject got called with correct arguments");
});

test("getTaskUtil", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project: "project",
		log: "log"
	});

	t.truthy(projectBuildContext.getTaskUtil(), "Returned a TaskUtil instance");
	t.is(projectBuildContext.getTaskUtil(), projectBuildContext.getTaskUtil(), "Caches TaskUtil instance");
});

test.serial("getTaskRunner", async (t) => {
	t.plan(2);
	class DummyTaskRunner {
		constructor(params) {
			t.deepEqual(params, {
				graph: "graph",
				project: "project",
				parentLogger: "log",
				taskUtil: "taskUtil",
				taskRepository: "taskRepository",
				buildConfig: "buildConfig"
			}, "TaskRunner created with expected constructor arguments");
		}
	}
	const ProjectBuildContext = await esmock("../../../../lib/build/helpers/ProjectBuildContext.js", {
		"../../../../lib/build/TaskRunner.js": DummyTaskRunner
	});

	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getGraph: () => "graph",
			getTaskRepository: () => "taskRepository",
			getBuildConfig: () => "buildConfig",
		},
		project: "project",
		log: "log"
	});

	projectBuildContext.getTaskUtil = () => "taskUtil";

	const taskRunner = projectBuildContext.getTaskRunner();
	t.is(projectBuildContext.getTaskRunner(), taskRunner, "Returns cached TaskRunner instance");
});


test.serial("createProjectContext", async (t) => {
	t.plan(5);

	const project = {
		getType: sinon.stub().returns("foo")
	};
	const taskRunner = {"task": "runner"};
	class DummyProjectContext {
		constructor({buildContext, project, log}) {
			t.is(buildContext, testBuildContext, "Correct buildContext parameter");
			t.is(project, project, "Correct project parameter");
			t.is(log, "log", "Correct log parameter");
		}
		getTaskUtil() {
			return "taskUtil";
		}
		setTaskRunner(_taskRunner) {
			t.is(_taskRunner, taskRunner);
		}
	}
	const BuildContext = await esmock("../../../../lib/build/helpers/BuildContext.js", {
		"../../../../lib/build/helpers/ProjectBuildContext.js": DummyProjectContext,
		"../../../../lib/build/TaskRunner.js": {
			create: sinon.stub().resolves(taskRunner)
		}
	});
	const testBuildContext = new BuildContext("graph", "taskRepository");

	const projectContext = await testBuildContext.createProjectContext({
		project,
		log: "log"
	});

	t.true(projectContext instanceof DummyProjectContext,
		"Project context is an instance of DummyProjectContext");
	t.is(testBuildContext._projectBuildContexts[0], projectContext,
		"BuildContext stored correct ProjectBuildContext");
});

test("requiresBuild: has no build-manifest", (t) => {
	const project = {getBuildManifest: () => null};
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project,
		log: "log"
	});
	t.true(projectBuildContext.requiresBuild(), "Project without build-manifest requires to be build");
});

test("requiresBuild: has build-manifest", (t) => {
	const project = {getBuildManifest: () => {
		return {
			timestamp: "2022-07-28T12:00:00.000Z"
		};
	}};
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project,
		log: "log"
	});
	t.false(projectBuildContext.requiresBuild(), "Project with build-manifest does not require to be build");
});

test.serial("getBuildMetadata", (t) => {
	const project = {getBuildManifest: () => {
		return {
			timestamp: "2022-07-28T12:00:00.000Z"
		};
	}};
	const getTimeStub = sinon.stub(Date.prototype, "getTime").callThrough().onFirstCall().returns(1659016800000);
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project,
		log: "log"
	});

	t.deepEqual(projectBuildContext.getBuildMetadata(), {
		timestamp: "2022-07-28T12:00:00.000Z",
		age: "7200 seconds"
	}, "Project with build-manifest does not require to be build");
	getTimeStub.restore();
});

test("getBuildMetadata: has no build-manifest", (t) => {
	const project = {getBuildManifest: () => null};
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {},
		project,
		log: "log"
	});
	t.is(projectBuildContext.getBuildMetadata(), null, "Project has no build manifest");
});
