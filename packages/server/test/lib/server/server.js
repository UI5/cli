import test from "ava";
import path from "node:path";
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
		},
		"lockfile": {
			lock: sinon.stub().callsFake((_path, _opts, cb) => cb(null)),
			unlock: sinon.stub().callsFake((_path, cb) => cb(null)),
			unlockSync: sinon.stub()
		},
		"node:fs/promises": {
			mkdir: sinon.stub().resolves()
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
		},
		"lockfile": {
			lock: sinon.stub().callsFake((_path, _opts, cb) => cb(null)),
			unlock: sinon.stub().callsFake((_path, cb) => cb(null)),
			unlockSync: sinon.stub()
		},
		"node:fs/promises": {
			mkdir: sinon.stub().resolves()
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

// ─── Server lock lifecycle ────────────────────────────────────────────────────

test("serve() acquires server-{port}.lock after _listen resolves", async (t) => {
	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const lockStub = mocks["lockfile"].lock;

	const {serve} = await esmock("../../../lib/server.js", mocks);
	const graph = createMockGraph(mockBuildServer);

	const ui5DataDir = path.join("test", "tmp", "lock-test-acquire");
	const result = await serve(graph, {port: 3001, ui5DataDir});

	t.true(lockStub.calledOnce, "lockfile.lock called once");
	const lockPath = lockStub.firstCall.args[0];
	t.true(lockPath.endsWith(`server-3001.lock`), `lock path ends with server-3001.lock, got: ${lockPath}`);

	result.close(() => {});
});

test("close() releases the server lock", async (t) => {
	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const unlockSyncStub = mocks["lockfile"].unlockSync;

	const {serve} = await esmock("../../../lib/server.js", mocks);
	const graph = createMockGraph(mockBuildServer);

	const ui5DataDir = path.join("test", "tmp", "lock-test-release");
	const result = await serve(graph, {port: 3002, ui5DataDir});

	await new Promise((resolve) => result.close(resolve));

	t.true(unlockSyncStub.calledOnce, "lockfile.unlockSync called once on close");
});

test("close() releases the lock only once (idempotent)", async (t) => {
	const mockServer = createMockServer();
	const mockBuildServer = createMockBuildServer();
	const mocks = createMocks(mockServer);
	const unlockSyncStub = mocks["lockfile"].unlockSync;

	const {serve} = await esmock("../../../lib/server.js", mocks);
	const graph = createMockGraph(mockBuildServer);

	const ui5DataDir = path.join("test", "tmp", "lock-test-idempotent");
	const result = await serve(graph, {port: 3003, ui5DataDir});

	await new Promise((resolve) => result.close(resolve));
	await new Promise((resolve) => result.close(resolve));

	t.is(unlockSyncStub.callCount, 1, "unlockSync called exactly once even when close() called twice");
});
