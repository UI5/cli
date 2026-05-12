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
