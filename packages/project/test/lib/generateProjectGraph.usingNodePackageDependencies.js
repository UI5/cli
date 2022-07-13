const test = require("ava");
const path = require("path");
const sinonGlobal = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");

const applicationAPath = path.join(__dirname, "..", "fixtures", "application.a");
test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		warn: sinon.stub(),
		verbose: sinon.stub(),
		error: sinon.stub(),
		info: sinon.stub(),
		isLevelEnabled: () => true
	};
	sinon.stub(logger, "getLogger").callThrough().withArgs("graph:projectGraphBuilder").returns(t.context.log);
	mock.reRequire("../../lib/graph/projectGraphBuilder");
	t.context.projectGraphFromPackageDeps =
		mock.reRequire("../../lib/generateProjectGraph").usingNodePackageDependencies;
	logger.getLogger.restore(); // Immediately restore global stub for following tests
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Application A", async (t) => {
	const {projectGraphFromPackageDeps} = t.context;
	const projectGraph = await projectGraphFromPackageDeps({cwd: applicationAPath});
	const rootProject = projectGraph.getRoot();
	t.is(rootProject.getName(), "application.a", "Returned correct root project");
});

test("Application A: Traverse project graph breadth first", async (t) => {
	const {projectGraphFromPackageDeps} = t.context;
	const projectGraph = await projectGraphFromPackageDeps({cwd: applicationAPath});
	const callbackStub = t.context.sinon.stub().resolves();
	await projectGraph.traverseBreadthFirst(callbackStub);

	t.is(callbackStub.callCount, 5, "Five projects have been visited");

	const callbackCalls = callbackStub.getCalls().map((call) => call.args[0].project.getName());

	t.deepEqual(callbackCalls, [
		"application.a",
		"library.d",
		"library.a",
		"library.b",
		"library.c"
	], "Traversed graph in correct order");
});

// More integration tests for package.json dependencies in graph/providers/NodePackageDependencies.integration.js
