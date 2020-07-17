const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
});

const BuildContext = require("../../../lib/builder/BuildContext");

test("Missing parameters", (t) => {
	const error = t.throws(() => {
		new BuildContext({});
	});

	t.is(error.message, `Missing parameter 'rootProject'`, "Threw with expected error message");
});

test("getRootProject", (t) => {
	const buildContext = new BuildContext({
		rootProject: "pony"
	});

	t.is(buildContext.getRootProject(), "pony", "Returned correct value");
});

test.serial("createProjectContext", (t) => {
	class DummyProjectContext {
		constructor({buildContext, project, resources}) {
			t.is(buildContext, testBuildContext, "Correct buildContext parameter");
			t.is(project, "project", "Correct project parameter");
			t.is(resources, "resources", "Correct resources parameter");
		}
	}
	mock("../../../lib/builder/ProjectBuildContext", DummyProjectContext);

	const BuildContext = mock.reRequire("../../../lib/builder/BuildContext");
	const testBuildContext = new BuildContext({
		rootProject: "pony"
	});

	const projectContext = testBuildContext.createProjectContext({
		project: "project",
		resources: "resources"
	});

	t.true(projectContext instanceof DummyProjectContext,
		"Project context is an instance of DummyProjectContext");
	t.is(testBuildContext.projectBuildContexts[0], projectContext,
		"BuildContext stored correct ProjectBuildContext");
});

test("executeCleanupTasks", async (t) => {
	const buildContext = new BuildContext({
		rootProject: "pony"
	});

	const executeCleanupTasks = sinon.stub().resolves();

	buildContext.projectBuildContexts.push({
		executeCleanupTasks
	});
	buildContext.projectBuildContexts.push({
		executeCleanupTasks
	});

	await buildContext.executeCleanupTasks();

	t.is(executeCleanupTasks.callCount, 2,
		"Project context executeCleanupTasks got called twice");
});
