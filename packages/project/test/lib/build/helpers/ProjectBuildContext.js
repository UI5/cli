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
		new ProjectBuildContext(
			undefined,
			{
				getName: () => "project",
				getType: () => "type",
			}
		);
	}, {
		message: `Missing parameter 'buildContext'`
	}, "Correct error message");

	t.throws(() => {
		new ProjectBuildContext(
			"buildContext",
			undefined
		);
	}, {
		message: `Missing parameter 'project'`
	}, "Correct error message");
});

test("isRootProject: true", (t) => {
	const rootProject = {
		getName: () => "root project",
		getType: () => "type",
	};
	const buildContext = {
		getRootProject: () => rootProject
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		rootProject
	);

	t.true(projectBuildContext.isRootProject(), "Correctly identified root project");
});

test("isRootProject: false", (t) => {
	const buildContext = {
		getRootProject: () => "root project"
	};
	const project = {
		getName: () => "not the root project",
		getType: () => "type",
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.false(projectBuildContext.isRootProject(), "Correctly identified non-root project");
});

test("getBuildOption", (t) => {
	const getOptionStub = sinon.stub().returns("pony");
	const buildContext = {
		getOption: getOptionStub
	};
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.is(projectBuildContext.getOption("option"), "pony", "Returned value is correct");
	t.is(getOptionStub.getCall(0).args[0], "option", "getOption called with correct argument");
});

test("registerCleanupTask", (t) => {
	const buildContext = {};
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);
	projectBuildContext.registerCleanupTask("my task 1");
	projectBuildContext.registerCleanupTask("my task 2");

	t.is(projectBuildContext._queues.cleanup[0], "my task 1", "Cleanup task registered");
	t.is(projectBuildContext._queues.cleanup[1], "my task 2", "Cleanup task registered");
});

test("executeCleanupTasks", (t) => {
	const buildContext = {};
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);
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
	const buildContext = {};
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

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
		getName: () => "project",
		getType: () => "type",
	};
	const buildContext = {};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		fakeProject
	);

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
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const getProjectStub = sinon.stub().returns("pony");
	const buildContext = {
		getGraph: () => {
			return {
				getProject: getProjectStub
			};
		}
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.is(projectBuildContext.getProject("pony project"), "pony", "Returned correct value");
	t.is(getProjectStub.callCount, 1, "ProjectGraph#getProject got called once");
	t.is(getProjectStub.getCall(0).args[0], "pony project", "ProjectGraph#getProject got called with correct argument");

	t.is(projectBuildContext.getProject(), project);
	t.is(getProjectStub.callCount, 1, "ProjectGraph#getProject is not called when requesting current project");
});

test("getProject: No name provided", (t) => {
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const getProjectStub = sinon.stub().returns("pony");
	const buildContext = {
		getGraph: () => {
			return {
				getProject: getProjectStub
			};
		}
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.is(projectBuildContext.getProject(), project, "Returned correct value");
	t.is(getProjectStub.callCount, 0, "ProjectGraph#getProject has not been called");
});

test("getDependencies", (t) => {
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const getDependenciesStub = sinon.stub().returns(["dep a", "dep b"]);
	const buildContext = {
		getGraph: () => {
			return {
				getDependencies: getDependenciesStub
			};
		}
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.deepEqual(projectBuildContext.getDependencies("pony project"), ["dep a", "dep b"], "Returned correct value");
	t.is(getDependenciesStub.callCount, 1, "ProjectGraph#getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "pony project",
		"ProjectGraph#getDependencies got called with correct arguments");
});

test("getDependencies: No name provided", (t) => {
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const getDependenciesStub = sinon.stub().returns(["dep a", "dep b"]);
	const buildContext = {
		getGraph: () => {
			return {
				getDependencies: getDependenciesStub
			};
		}
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.deepEqual(projectBuildContext.getDependencies(), ["dep a", "dep b"], "Returned correct value");
	t.is(getDependenciesStub.callCount, 1, "ProjectGraph#getDependencies got called once");
	t.is(getDependenciesStub.getCall(0).args[0], "project",
		"ProjectGraph#getDependencies got called with correct arguments");
});

test("getTaskUtil", (t) => {
	const buildContext = {};
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.truthy(projectBuildContext.getTaskUtil(), "Returned a TaskUtil instance");
	t.is(projectBuildContext.getTaskUtil(), projectBuildContext.getTaskUtil(), "Caches TaskUtil instance");
});

test.serial("getTaskRunner", async (t) => {
	t.plan(4);
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const {default: ProjectBuildLogger} = await import("@ui5/logger/internal/loggers/ProjectBuild");
	class TaskRunnerMock {
		constructor(params) {
			t.true(params.log instanceof ProjectBuildLogger, "TaskRunner receives an instance of ProjectBuildLogger");
			params.log = "log"; // replace log instance with string for deep comparison
			t.is(params.buildCache, buildCache,
				"TaskRunner receives the ProjectBuildCache instance");
			params.buildCache = "buildCache"; // replace buildCache instance with string for deep comparison
			t.deepEqual(params, {
				graph: "graph",
				project: project,
				log: "log",
				buildCache: "buildCache",
				taskUtil: "taskUtil",
				taskRepository: "taskRepository",
				buildConfig: "buildConfig"
			}, "TaskRunner created with expected constructor arguments");
		}
	}
	const ProjectBuildContext = await esmock("../../../../lib/build/helpers/ProjectBuildContext.js", {
		"../../../../lib/build/TaskRunner.js": TaskRunnerMock
	});

	const buildContext = {
		getGraph: () => "graph",
		getTaskRepository: () => "taskRepository",
		getBuildConfig: () => "buildConfig",
	};
	const buildCache = {};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project,
		undefined,
		buildCache,
	);

	projectBuildContext.getTaskUtil = () => "taskUtil";

	const taskRunner = projectBuildContext.getTaskRunner();
	t.is(projectBuildContext.getTaskRunner(), taskRunner, "Returns cached TaskRunner instance");
});

test("possiblyRequiresBuild: has no build-manifest", (t) => {
	const project = {
		getName: sinon.stub().returns("foo"),
		getType: sinon.stub().returns("bar"),
		getBuildManifest: () => null
	};
	const buildContext = {};
	const buildCache = {
		isFresh: sinon.stub().returns(false)
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project,
		undefined,
		buildCache
	);
	t.true(projectBuildContext.possiblyRequiresBuild(), "Project without build-manifest requires to be build");
});

test("possiblyRequiresBuild: has build-manifest", (t) => {
	const project = {
		getName: sinon.stub().returns("foo"),
		getType: sinon.stub().returns("bar"),
		getBuildManifest: () => {
			return {
				buildManifest: {
					manifestVersion: "0.1"
				},
				timestamp: "2022-07-28T12:00:00.000Z"
			};
		}
	};
	const buildContext = {};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);
	t.false(projectBuildContext.possiblyRequiresBuild(), "Project with build-manifest does not require to be build");
});

test.serial("getBuildMetadata", (t) => {
	const project = {
		getName: sinon.stub().returns("foo"),
		getType: sinon.stub().returns("bar"),
		getBuildManifest: () => {
			return {
				buildManifest: {
					manifestVersion: "0.1"
				},
				timestamp: "2022-07-28T12:00:00.000Z"
			};
		}
	};
	const getTimeStub = sinon.stub(Date.prototype, "getTime").callThrough().onFirstCall().returns(1659016800000);
	const buildContext = {};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);

	t.deepEqual(projectBuildContext.getBuildMetadata(), {
		timestamp: "2022-07-28T12:00:00.000Z",
		age: "7200 seconds"
	}, "Project with build-manifest does not require to be build");
	getTimeStub.restore();
});

test("getBuildMetadata: has no build-manifest", (t) => {
	const project = {
		getName: sinon.stub().returns("foo"),
		getType: sinon.stub().returns("bar"),
		getBuildManifest: () => null
	};
	const buildContext = {};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);
	t.is(projectBuildContext.getBuildMetadata(), null, "Project has no build manifest");
});
