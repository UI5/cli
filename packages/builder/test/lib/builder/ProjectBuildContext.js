const test = require("ava");
const sinon = require("sinon");

test.afterEach.always((t) => {
	sinon.restore();
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
