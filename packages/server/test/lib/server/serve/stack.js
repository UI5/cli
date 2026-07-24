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

async function importBuildRouter(applyMiddleware) {
	return esmock("../../../../lib/serve/stack.js", {
		"../../../../lib/middleware/MiddlewareManager.js": class MiddlewareManager {
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
