const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

const ProjectBuildContext = require("../../../lib/builder/ProjectBuildContext");

test("Missing parameters", (t) => {
	const error = t.throws(() => {
		new ProjectBuildContext({});
	});

	t.is(error.message, `One or more mandatory parameters are missing`, "Threw with expected error message");
});

test("isRootProject: true", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "root project",
		resources: "resources"
	});

	t.true(projectBuildContext.isRootProject(), "Correctly identified root project");
});

test("isRootProject: false", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "no root project",
		resources: "resources"
	});

	t.false(projectBuildContext.isRootProject(), "Correctly identified non-root project");
});

test("registerCleanupTask", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "no root project",
		resources: "resources"
	});
	projectBuildContext.registerCleanupTask("my task 1");
	projectBuildContext.registerCleanupTask("my task 2");

	t.is(projectBuildContext.queues.cleanup[0], "my task 1", "Cleanup task registered");
	t.is(projectBuildContext.queues.cleanup[1], "my task 2", "Cleanup task registered");
});

test("executeCleanupTasks", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "no root project",
		resources: "resources"
	});
	const task1 = sinon.stub().resolves();
	const task2 = sinon.stub().resolves();
	projectBuildContext.registerCleanupTask(task1);
	projectBuildContext.registerCleanupTask(task2);

	projectBuildContext.executeCleanupTasks();

	t.is(task1.callCount, 1, "Cleanup task 1 got called");
	t.is(task2.callCount, 1, "my task 2", "Cleanup task 2 got called");
});

test("STANDARD_TAGS constant", (t) => {
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "no root project",
		resources: "resources"
	});

	t.deepEqual(projectBuildContext.STANDARD_TAGS, {
		HideFromBuildResult: "ui5:HideFromBuildResult"
	}, "Exposes correct STANDARD_TAGS constant");
});

test.serial("getResourceTagCollection", (t) => {
	class DummyResourceTagCollection {
		constructor({allowedTags}) {
			t.deepEqual(allowedTags, ["ui5:HideFromBuildResult"],
				"Correct allowedTags parameter supplied");
		}
	}
	mock("@ui5/fs", {
		ResourceTagCollection: DummyResourceTagCollection
	});

	const ProjectBuildContext = mock.reRequire("../../../lib/builder/ProjectBuildContext");
	const projectBuildContext = new ProjectBuildContext({
		buildContext: {
			getRootProject: () => "root project"
		},
		project: "no root project",
		resources: "resources"
	});

	const collection = projectBuildContext.getResourceTagCollection();

	t.true(collection instanceof DummyResourceTagCollection,
		"Returned an instance of mocked DummyResourceTagCollection");
});
