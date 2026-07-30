import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

// Unit: the shared router core owns the BuildServer once graph.serve() has started it. A failure
// while assembling the middleware must destroy that BuildServer before rethrowing, since the
// caller never receives a buildServer or close() handle to release its watcher and cache.

function createGraph(buildServer) {
	const rootProject = {
		getName: () => "root.project",
		getSourceReader: () => ({}),
	};
	return {
		getRoot: () => rootProject,
		getProject: () => undefined,
		traverseBreadthFirst: async () => {},
		serve: sinon.stub().resolves(buildServer),
	};
}

function createBuildServer() {
	return {
		getRootReader: () => ({}),
		getDependenciesReader: () => ({}),
		getReader: () => ({}),
		getServeError: () => undefined,
		on: sinon.stub(),
		destroy: sinon.stub().resolves(),
	};
}

async function importBuildRouter(applyMiddleware, captured) {
	return esmock("../../../../lib/serve/stack.js", {
		"../../../../lib/middleware/MiddlewareManager.js": class MiddlewareManager {
			constructor(params) {
				if (captured) {
					captured.options = params?.options;
				}
			}
			applyMiddleware(...args) {
				return applyMiddleware(...args);
			}
		},
	});
}

test("buildRouter() destroys the BuildServer when middleware assembly fails", async (t) => {
	const buildServer = createBuildServer();
	const graph = createGraph(buildServer);
	const assemblyError = new Error("applyMiddleware failed");
	const applyMiddleware = sinon.stub().rejects(assemblyError);

	const {buildRouter} = await importBuildRouter(applyMiddleware);

	const err = await t.throwsAsync(buildRouter(graph, {}));
	t.is(err, assemblyError, "the original assembly error is rethrown");
	t.true(buildServer.destroy.calledOnce,
		"the BuildServer is destroyed so its watcher and cache handle are released");
});

test("buildRouter() returns the router and BuildServer on success", async (t) => {
	const buildServer = createBuildServer();
	const graph = createGraph(buildServer);
	const applyMiddleware = sinon.stub().resolves();

	const {buildRouter} = await importBuildRouter(applyMiddleware);

	const result = await buildRouter(graph, {});
	t.is(result.buildServer, buildServer, "the BuildServer is returned to the caller");
	t.is(typeof result.router, "function", "an express router is returned");
	t.true(buildServer.destroy.notCalled, "the BuildServer is not destroyed on success");
});

test("buildRouter() threads getServeError and getDegradedError as separate options", async (t) => {
	const buildServer = createBuildServer();
	const buildServerError = new Error("build error");
	buildServer.getServeError = () => buildServerError;
	const graph = createGraph(buildServer);
	const applyMiddleware = sinon.stub().resolves();
	const captured = {};

	const degradedError = new Error("invalid ui5.yaml");
	const getDegradedError = () => degradedError;

	const {buildRouter} = await importBuildRouter(applyMiddleware, captured);
	await buildRouter(graph, {}, undefined, getDegradedError);

	t.is(captured.options.getServeError(), buildServerError,
		"getServeError reports only the BuildServer's own per-project error");
	t.is(captured.options.getDegradedError(), degradedError,
		"getDegradedError carries the supervisor-level error separately");
});

test("buildRouter() getDegradedError is undefined for the embedding path (no supervisor)", async (t) => {
	const buildServer = createBuildServer();
	const buildServerError = new Error("build error");
	buildServer.getServeError = () => buildServerError;
	const graph = createGraph(buildServer);
	const applyMiddleware = sinon.stub().resolves();
	const captured = {};

	const {buildRouter} = await importBuildRouter(applyMiddleware, captured);
	await buildRouter(graph, {}, undefined);

	t.is(captured.options.getServeError(), buildServerError,
		"the plain BuildServer error is still available");
	t.is(captured.options.getDegradedError, undefined,
		"no degraded accessor is threaded when none was supplied");
});

test("buildRouter() adds generateVersionInfo to excludedTasks when undefined", async (t) => {
	// The versionInfo middleware generates the version info, so the build must skip
	// the generateVersionInfo task. Verify it lands in the excludedTasks passed to
	// graph.serve() even when the caller excludes nothing.
	const buildServer = createBuildServer();
	const graph = createGraph(buildServer);
	const applyMiddleware = sinon.stub().resolves();

	const {buildRouter} = await importBuildRouter(applyMiddleware);
	await buildRouter(graph, {excludedTasks: undefined});

	t.true(graph.serve.calledOnce);
	const callArgs = graph.serve.firstCall.args[0];
	t.deepEqual(callArgs.excludedTasks, ["generateVersionInfo"]);
});

test("buildRouter() appends generateVersionInfo to existing excludedTasks", async (t) => {
	const buildServer = createBuildServer();
	const graph = createGraph(buildServer);
	const applyMiddleware = sinon.stub().resolves();

	const {buildRouter} = await importBuildRouter(applyMiddleware);
	const originalExcludedTasks = ["anotherTask", "anotherTask2"];
	await buildRouter(graph, {excludedTasks: originalExcludedTasks});

	t.true(graph.serve.calledOnce);
	const callArgs = graph.serve.firstCall.args[0];
	t.deepEqual(callArgs.excludedTasks, ["anotherTask", "anotherTask2", "generateVersionInfo"]);
	t.deepEqual(originalExcludedTasks, ["anotherTask", "anotherTask2"],
		"the caller's excludedTasks array is not mutated");
});

test("buildRouter() keeps generateVersionInfo when already excluded", async (t) => {
	const buildServer = createBuildServer();
	const graph = createGraph(buildServer);
	const applyMiddleware = sinon.stub().resolves();

	const {buildRouter} = await importBuildRouter(applyMiddleware);
	const originalExcludedTasks = ["anotherTask", "generateVersionInfo", "anotherTask2"];
	await buildRouter(graph, {excludedTasks: originalExcludedTasks});

	t.true(graph.serve.calledOnce);
	const callArgs = graph.serve.firstCall.args[0];
	t.deepEqual(callArgs.excludedTasks, ["anotherTask", "generateVersionInfo", "anotherTask2"]);
	t.deepEqual(originalExcludedTasks, ["anotherTask", "generateVersionInfo", "anotherTask2"],
		"the caller's excludedTasks array is not mutated");
});
