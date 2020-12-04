const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

const BuildContext = require("../../../lib/buildHelpers/BuildContext");

test("Missing parameters", (t) => {
	const error = t.throws(() => {
		new BuildContext({});
	});

	t.is(error.message, `Missing parameter 'graph'`, "Threw with expected error message");
});

test("getRootProject", (t) => {
	const buildContext = new BuildContext({
		graph: {
			getRoot: () => "pony"
		}
	});

	t.is(buildContext.getRootProject(), "pony", "Returned correct value");
});
test("getProject", (t) => {
	const getProjectStub = sinon.stub().returns("pony");
	const buildContext = new BuildContext({
		graph: {
			getProject: getProjectStub
		}
	});

	t.is(buildContext.getProject("pony project"), "pony", "Returned correct value");
	t.is(getProjectStub.getCall(0).args[0], "pony project", "getProject got called with correct argument");
});

test("getBuildOption", (t) => {
	const buildContext = new BuildContext({
		graph: "graph",
		options: {
			a: true,
			b: "Pony",
			c: 235,
			d: {
				d1: "Bee"
			}
		}
	});

	t.is(buildContext.getOption("a"), true, "Returned 'boolean' value is correct");
	t.is(buildContext.getOption("b"), "Pony", "Returned 'String' value is correct");
	t.is(buildContext.getOption("c"), 235, "Returned 'Number' value is correct");
	t.deepEqual(buildContext.getOption("d"), {d1: "Bee"}, "Returned 'object' value is correct");
});

test.serial("createProjectContext", (t) => {
	class DummyProjectContext {
		constructor({buildContext, project, log}) {
			t.is(buildContext, testBuildContext, "Correct buildContext parameter");
			t.is(project, "project", "Correct project parameter");
			t.is(log, "log", "Correct log parameter");
		}
	}
	mock("../../../lib/buildHelpers/ProjectBuildContext", DummyProjectContext);

	const BuildContext = mock.reRequire("../../../lib/buildHelpers/BuildContext");
	const testBuildContext = new BuildContext({
		graph: "graph"
	});

	const projectContext = testBuildContext.createProjectContext({
		project: "project",
		log: "log"
	});

	t.true(projectContext instanceof DummyProjectContext,
		"Project context is an instance of DummyProjectContext");
	t.is(testBuildContext._projectBuildContexts[0], projectContext,
		"BuildContext stored correct ProjectBuildContext");
});

test("executeCleanupTasks", async (t) => {
	const buildContext = new BuildContext({
		graph: "graph"
	});

	const executeCleanupTasks = sinon.stub().resolves();

	buildContext._projectBuildContexts.push({
		executeCleanupTasks
	});
	buildContext._projectBuildContexts.push({
		executeCleanupTasks
	});

	await buildContext.executeCleanupTasks();

	t.is(executeCleanupTasks.callCount, 2,
		"Project context executeCleanupTasks got called twice");
});
