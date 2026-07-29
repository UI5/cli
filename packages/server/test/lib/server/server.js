import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {EventEmitter} from "node:events";

function createMockGraph(mockBuildServer) {
	const mockProject = {
		getName: sinon.stub().returns("test.project"),
		getSourceReader: sinon.stub().returns({})
	};
	return {
		getRoot: sinon.stub().returns(mockProject),
		traverseBreadthFirst: sinon.stub().resolves(),
		getProject: sinon.stub().returns(null),
		serve: sinon.stub().resolves(mockBuildServer)
	};
}

function createMockBuildServer() {
	const buildServer = new EventEmitter();
	buildServer.getRootReader = sinon.stub().returns({});
	buildServer.getDependenciesReader = sinon.stub().returns({});
	buildServer.getReader = sinon.stub().returns({});
	buildServer.destroy = sinon.stub().resolves();
	return buildServer;
}

function createMockServer() {
	const mockServer = new EventEmitter();
	mockServer.close = sinon.stub().callsFake((cb) => cb());
	return mockServer;
}

function createMocks(mockServer) {
	const mockApp = {
		use: sinon.stub(),
		listen: sinon.stub().callsFake((options, cb) => {
			process.nextTick(cb);
			return mockServer;
		})
	};

	return {
		"express": sinon.stub().returns(mockApp),
		"portscanner": {
			findAPortNotInUse: sinon.stub().callsFake((port, portMax, host, cb) => {
				cb(null, port);
			})
		},
		"../../../lib/middleware/MiddlewareManager.js": {
			default: class MockMiddlewareManager {
				applyMiddleware() {}
			}
		},
		"@ui5/fs/resourceFactory": {
			createReaderCollection: sinon.stub().returns({})
		},
		"@ui5/fs/ReaderCollectionPrioritized": {
			default: class MockReaderCollectionPrioritized {}
		}
	};
}

test("server.on('error') rejects the serve promise", async (t) => {
	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const testError = new Error("server error");

	const mockApp = {
		use: sinon.stub(),
		listen: sinon.stub().callsFake((options, cb) => {
			// Emit error before the listen callback fires so reject() is called
			process.nextTick(() => {
				mockServer.emit("error", testError);
			});
			return mockServer;
		})
	};

	const mocks = {
		"express": sinon.stub().returns(mockApp),
		"portscanner": {
			findAPortNotInUse: sinon.stub().callsFake((port, portMax, host, cb) => {
				cb(null, port);
			})
		},
		"../../../lib/middleware/MiddlewareManager.js": {
			default: class MockMiddlewareManager {
				applyMiddleware() {}
			}
		},
		"@ui5/fs/resourceFactory": {
			createReaderCollection: sinon.stub().returns({})
		},
		"@ui5/fs/ReaderCollectionPrioritized": {
			default: class MockReaderCollectionPrioritized {}
		}
	};

	const {serve} = await esmock("../../../lib/server.js", mocks);
	const graph = createMockGraph(mockBuildServer);
	const error = await t.throwsAsync(serve(graph, {port: 3000}));
	t.is(error, testError);
});


test("buildServer 'error' event is forwarded to error callback", async (t) => {
	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const testError = new Error("build error");

	const {serve} = await esmock("../../../lib/server.js", mocks);
	const graph = createMockGraph(mockBuildServer);

	const errorReceived = new Promise((resolve) => {
		serve(graph, {port: 3000}, resolve).then(() => {
			mockBuildServer.emit("error", testError);
		});
	});

	const err = await errorReceived;
	t.is(err, testError);
});

test("close() still calls server.close when buildServer.destroy() rejects", async (t) => {
	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);

	mockBuildServer.destroy = sinon.stub().rejects(new Error("destroy failed"));

	const {serve} = await esmock("../../../lib/server.js", mocks);
	const graph = createMockGraph(mockBuildServer);
	const result = await serve(graph, {port: 3000});

	await new Promise((resolve) => {
		result.close(resolve);
	});
	t.true(mockServer.close.calledOnce, "server.close was called despite destroy rejection");
});

test("excludedTasks contains generateVersionInfo when undefined", async (t) => {
	// This test verifies that the excludedTasks option
	// is passed to graph.serve() and that "generateVersionInfo"
	// is always included in the excluded tasks
	// (WITHOUT an additional excluded task specified):

	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const {serve} = await esmock("../../../lib/server.js", mocks);
	const serveStub = sinon.stub().resolves(mockBuildServer);
	const graph = createMockGraph(mockBuildServer);
	graph.serve = serveStub;

	await serve(graph, {
		port: 3000,
		excludedTasks: undefined // Exclude no other tasks (default value)
	});

	t.true(serveStub.calledOnce);
	const callArgs = serveStub.firstCall.args[0];
	// Verify "excludedTasks" is transformed to an array and "generateVersionInfo" is added:
	t.deepEqual(callArgs.excludedTasks, ["generateVersionInfo"]);
});

test("excludedTasks contains generateVersionInfo even when other tasks are excluded", async (t) => {
	// This test verifies that the excludedTasks option
	// is passed to graph.serve() and that "generateVersionInfo"
	// is always included in the excluded tasks
	// (WITH additional excluded tasks specified):

	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const {serve} = await esmock("../../../lib/server.js", mocks);
	const serveStub = sinon.stub().resolves(mockBuildServer);
	const graph = createMockGraph(mockBuildServer);
	graph.serve = serveStub;

	const originalExcludedTasks = ["anotherTask", "anotherTask2"];
	await serve(graph, {
		port: 3000,
		excludedTasks: originalExcludedTasks
	});

	t.true(serveStub.calledOnce);
	const callArgs = serveStub.firstCall.args[0];
	// "generateVersionInfo" is added to the "excludedTasks" array:
	t.deepEqual(callArgs.excludedTasks, ["anotherTask", "anotherTask2", "generateVersionInfo"]);

	// Verify the original array wasn't mutated:
	t.deepEqual(originalExcludedTasks, ["anotherTask", "anotherTask2"],
		"Original excludedTasks array should not be mutated");
});

test("excludedTasks contains generateVersionInfo already", async (t) => {
	// This test verifies that the excludedTasks option
	// is passed to graph.serve() and that "generateVersionInfo"
	// is always contained in the excluded tasks
	// (EVEN WHEN it's already included):

	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const {serve} = await esmock("../../../lib/server.js", mocks);
	const serveStub = sinon.stub().resolves(mockBuildServer);
	const graph = createMockGraph(mockBuildServer);
	graph.serve = serveStub;

	const originalExcludedTasks = ["anotherTask", "generateVersionInfo", "anotherTask2"];
	await serve(graph, {
		port: 3000,
		excludedTasks: originalExcludedTasks
	});

	t.true(serveStub.calledOnce);
	const callArgs = serveStub.firstCall.args[0];
	// "generateVersionInfo" is still contained in the "excludedTasks" array:
	t.deepEqual(callArgs.excludedTasks, ["anotherTask", "generateVersionInfo", "anotherTask2"]);

	// Verify the original array wasn't mutated:
	t.deepEqual(originalExcludedTasks, ["anotherTask", "generateVersionInfo", "anotherTask2"],
		"Original excludedTasks array should not be mutated");
});
