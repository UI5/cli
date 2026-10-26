import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import {createResource} from "@ui5/fs/resourceFactory";
import ProjectResources from "../../../../lib/resources/ProjectResources.js";

test.beforeEach((t) => {
	t.context.resourceTagCollection = new ResourceTagCollection({
		allowedTags: ["me:MyTag"]
	});
});
test.afterEach.always((t) => {
	sinon.restore();
});

import ProjectBuildContext from "../../../../lib/build/helpers/ProjectBuildContext.js";

// Default stub that satisfies the synchronous wiring done by the
// ProjectBuildContext constructor (TaskDefinitions needs getGraph + getTaskRepository).
// Tests that exercise additional buildContext methods spread their own stubs on top.
function createBuildContextStub(overrides = {}) {
	return {
		getGraph: () => ({}),
		getTaskRepository: () => ({}),
		getBuildTime: () => new Date(),
		...overrides
	};
}

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
	const buildContext = createBuildContextStub({
		getRootProject: () => rootProject
	});
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		rootProject
	);

	t.true(projectBuildContext.isRootProject(), "Correctly identified root project");
});

test("isRootProject: false", (t) => {
	const buildContext = createBuildContextStub({
		getRootProject: () => "root project"
	});
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
	const buildContext = createBuildContextStub({
		getOption: getOptionStub
	});
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
	const buildContext = createBuildContextStub();
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
	const buildContext = createBuildContextStub();
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

function createTagProject(name) {
	const resources = new ProjectResources({getName: () => name, createWriter: () => ({})});
	const project = {
		getName: () => name,
		getType: () => "library",
		getProjectResources: () => resources,
		getResourceTagCollection: (resource, tag) => resources.getResourceTagCollection(resource, tag),
	};
	const context = new ProjectBuildContext(createBuildContextStub(), project);
	return {project, resources, taskUtil: context.getTaskUtil()};
}

for (const tag of ["ui5:OmitFromBuildResult", "ui5:IsBundle", "build:CustomTag"]) {
	test(`Build tag ${tag} on a dependency belongs to the executing project`, (t) => {
		const dependency = createTagProject("dependency");
		const first = createTagProject("first");
		const second = createTagProject("second");
		const resource = createResource({path: "/resources/dependency/file.js", project: dependency.project});
		dependency.taskUtil.setTag(resource, tag, "producer");
		t.is(first.taskUtil.getTag(resource, tag), undefined, "The producer's tag is not inherited");
		first.taskUtil.setTag(resource, tag, "first");
		second.taskUtil.setTag(resource, tag, "second");
		t.is(first.taskUtil.getTag(resource, tag), "first");
		t.is(second.taskUtil.getTag(resource, tag), "second");
		t.is(dependency.taskUtil.getTag(resource, tag), "producer");
		t.is(first.resources.getResourceTagOperations().buildTagOperations.get(resource.getPath()).get(tag), "first",
			"The executing project's stage records the tag");
		first.taskUtil.clearTag(resource, tag);
		t.is(first.taskUtil.getTag(resource, tag), undefined);
		t.is(second.taskUtil.getTag(resource, tag), "second", "Clearing a tag is local to the executing project");
		first.resources.useResultStage();
		first.resources.buildFinished();
		t.is(second.taskUtil.getTag(resource, tag), "second", "Finishing another project preserves local tags");
		t.is(resource.getProject(), dependency.project, "Tagging preserves resource ownership");
	});
}

for (const tag of ["ui5:IsDebugVariant", "ui5:HasDebugVariant", "project:CustomTag"]) {
	test(`Project tag ${tag} on a dependency remains shared`, (t) => {
		const dependency = createTagProject("dependency");
		const first = createTagProject("first");
		const second = createTagProject("second");
		const resource = createResource({path: "/resources/dependency/file.js", project: dependency.project});
		first.taskUtil.setTag(resource, tag);
		t.true(second.taskUtil.getTag(resource, tag));
		t.true(dependency.taskUtil.getTag(resource, tag));
		second.taskUtil.clearTag(resource, tag);
		t.is(first.taskUtil.getTag(resource, tag), undefined);
		t.is(first.resources.getResourceTagOperations().projectTagOperations.size, 0);
	});
}

test("getResourceTagCollection: Assigns project to resource if necessary", (t) => {
	const {project, taskUtil} = createTagProject("project");
	const resource = createResource({path: "/resource/path"});
	taskUtil.setTag(resource, "build:MyTag");
	t.is(resource.getProject(), project);
	t.true(taskUtil.getTag(resource, "build:MyTag"));
});

test("getResourceTagCollection: Rejects unsupported tags", (t) => {
	const {taskUtil} = createTagProject("project");
	const resource = createResource({path: "/resource/path"});
	t.throws(() => taskUtil.setTag(resource, "other:Tag"), {
		message: "Could not find collection for resource /resource/path and tag other:Tag"
	});
});

test("getProject", (t) => {
	const project = {
		getName: () => "project",
		getType: () => "type",
	};
	const getProjectStub = sinon.stub().returns("pony");
	const buildContext = createBuildContextStub({
		getGraph: () => {
			return {
				getProject: getProjectStub
			};
		}
	});
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
	const buildContext = createBuildContextStub({
		getGraph: () => {
			return {
				getProject: getProjectStub
			};
		}
	});
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
	const buildContext = createBuildContextStub({
		getGraph: () => {
			return {
				getDependencies: getDependenciesStub
			};
		}
	});
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
	const buildContext = createBuildContextStub({
		getGraph: () => {
			return {
				getDependencies: getDependenciesStub
			};
		}
	});
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
	const buildContext = createBuildContextStub();
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
				buildConfig: "buildConfig",
				taskDefinitions: projectBuildContext._taskDefinitions
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
		project
	);
	// _buildCache is normally set by ProjectBuildContext.create(); inject directly for this unit test
	projectBuildContext._buildCache = buildCache;

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
	const buildContext = createBuildContextStub();
	const buildCache = {
		isFresh: sinon.stub().returns(false)
	};
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);
	projectBuildContext._buildCache = buildCache;
	t.true(projectBuildContext.possiblyRequiresBuild(), "Project without build-manifest requires to be build");
});

test("possiblyRequiresBuild: has build-manifest", (t) => {
	const project = {
		getName: sinon.stub().returns("foo"),
		getType: sinon.stub().returns("bar"),
		getBuildManifest: () => {
			return {
				manifestVersion: "0.1",
				timestamp: "2022-07-28T12:00:00.000Z"
			};
		}
	};
	const buildContext = createBuildContextStub();
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
				manifestVersion: "0.1",
				timestamp: "2022-07-28T12:00:00.000Z"
			};
		}
	};
	const getTimeStub = sinon.stub(Date.prototype, "getTime").callThrough().onFirstCall().returns(1659016800000);
	const buildContext = createBuildContextStub();
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
	const buildContext = createBuildContextStub();
	const projectBuildContext = new ProjectBuildContext(
		buildContext,
		project
	);
	t.is(projectBuildContext.getBuildMetadata(), null, "Project has no build manifest");
});

test("resolveInputValue: env reads process.env", (t) => {
	const buildContext = createBuildContextStub();
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.teardown(() => {
		delete process.env.UI5_PROJECT_BUILD_CONTEXT_TEST;
	});
	delete process.env.UI5_PROJECT_BUILD_CONTEXT_TEST;
	t.is(projectBuildContext.resolveInputValue("env", "UI5_PROJECT_BUILD_CONTEXT_TEST"), undefined,
		"unset variable resolves to undefined");
	process.env.UI5_PROJECT_BUILD_CONTEXT_TEST = "value";
	t.is(projectBuildContext.resolveInputValue("env", "UI5_PROJECT_BUILD_CONTEXT_TEST"), "value");
});

test("resolveInputValue: isRootProject normalizes the boolean", (t) => {
	const rootProject = {getName: () => "root", getType: () => "type"};
	const buildContext = createBuildContextStub({getRootProject: () => rootProject});
	const projectBuildContext = new ProjectBuildContext(buildContext, rootProject);

	t.is(projectBuildContext.resolveInputValue("isRootProject", ""), "true");
});

test("resolveInputValue: getDependencies normalizes the array via the graph", (t) => {
	const getDependencies = sinon.stub().returns(["dep.a", "dep.b"]);
	const buildContext = createBuildContextStub({
		getGraph: () => ({getDependencies, getTaskRepository: () => ({})}),
		getTaskRepository: () => ({}),
	});
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.is(projectBuildContext.resolveInputValue("getDependencies", "project"), `["dep.a","dep.b"]`);
	t.true(getDependencies.calledWith("project"));
});

test("resolveInputValue: project.getVersion reads the dependency version from the graph", (t) => {
	const coreProject = {getName: () => "sap.ui.core", getVersion: () => "2.0.0"};
	const getProject = sinon.stub().callsFake((name) => (name === "sap.ui.core" ? coreProject : undefined));
	const buildContext = createBuildContextStub({
		getGraph: () => ({getProject}),
	});
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.is(projectBuildContext.resolveInputValue("project.getVersion", "sap.ui.core"), "2.0.0");
});

test("resolveInputValue: unresolvable project yields undefined", (t) => {
	const getProject = sinon.stub().returns(undefined);
	const buildContext = createBuildContextStub({
		getGraph: () => ({getProject}),
	});
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.is(projectBuildContext.resolveInputValue("project.getVersion", "gone"), undefined,
		"a project no longer in the graph resolves to undefined");
});

test("resolveInputValue: time re-derives the bucket for the granularity from the build time", (t) => {
	// 25 September 2026, 14:07:03 local. The lookup side must quantize the build run's shared
	// timestamp (via getBuildTime), so assert against that instant's buckets.
	const buildTime = new Date(2026, 8, 25, 14, 7, 3);
	const buildContext = createBuildContextStub({getBuildTime: () => buildTime});
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.is(projectBuildContext.resolveInputValue("time", "year"), "2026");
	t.is(projectBuildContext.resolveInputValue("time", "hour"), "2026-09-25T14");
});

test("resolveInputValue: time with an unknown granularity yields undefined", (t) => {
	const buildContext = createBuildContextStub();
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	// A corrupt cache row must miss the cache, not crash the lookup.
	t.is(projectBuildContext.resolveInputValue("time", "minute"), undefined);
});

test("resolveInputValue: unknown type yields undefined", (t) => {
	const buildContext = createBuildContextStub();
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.is(projectBuildContext.resolveInputValue("unknownType", "x"), undefined);
});

test("getBuildTime delegates to the build context", (t) => {
	const buildTime = new Date(2026, 8, 25, 14, 7, 3);
	const buildContext = createBuildContextStub({getBuildTime: () => buildTime});
	const project = {getName: () => "project", getType: () => "type"};
	const projectBuildContext = new ProjectBuildContext(buildContext, project);

	t.is(projectBuildContext.getBuildTime(), buildTime, "Returns the build context's timestamp");
});
