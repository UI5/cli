import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

let WatchHandler;
let chokidarWatchStub;

test.before(async () => {
	chokidarWatchStub = sinon.stub();
	WatchHandler = await esmock("../../../../lib/build/helpers/WatchHandler.js", {
		"chokidar": {
			default: {
				watch: chokidarWatchStub
			}
		}
	});
});

test.afterEach.always(() => {
	sinon.restore();
	chokidarWatchStub.reset();
});

function createMockWatcher() {
	const callbacks = {};
	const watcher = {
		on: sinon.stub().callsFake((event, cb) => {
			callbacks[event] = cb;
			return watcher;
		}),
		close: sinon.stub().resolves()
	};
	return {watcher, callbacks};
}

test.serial("watch: emits change events for file changes", async (t) => {
	const {watcher, callbacks} = createMockWatcher();
	chokidarWatchStub.returns(watcher);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => `/resources/${filePath.replace("/src/", "")}`,
		getName: () => "test-project"
	};

	const watchPromise = handler.watch([project]);
	callbacks.ready();
	await watchPromise;

	const changePromise = new Promise((resolve) => {
		handler.on("change", (eventType, resourcePath, proj) => {
			t.is(eventType, "change");
			t.is(resourcePath, "/resources/file.js");
			t.is(proj, project);
			resolve();
		});
	});
	callbacks.all("change", "/src/file.js");
	await changePromise;

	await handler.destroy();
	t.true(watcher.close.calledOnce);
});

test.serial("watch: ignores events before ready", async (t) => {
	const {watcher, callbacks} = createMockWatcher();
	chokidarWatchStub.returns(watcher);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => `/resources/${filePath.replace("/src/", "")}`,
		getName: () => "test-project"
	};

	const changeSpy = sinon.spy();
	handler.on("change", changeSpy);

	const watchPromise = handler.watch([project]);
	callbacks.all("change", "/src/file.js");
	callbacks.ready();
	await watchPromise;

	t.is(changeSpy.callCount, 0, "No change emitted before ready");
	await handler.destroy();
});

test.serial("watch: ignores addDir events", async (t) => {
	const {watcher, callbacks} = createMockWatcher();
	chokidarWatchStub.returns(watcher);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => `/resources/${filePath.replace("/src/", "")}`,
		getName: () => "test-project"
	};

	const changeSpy = sinon.spy();
	handler.on("change", changeSpy);

	const watchPromise = handler.watch([project]);
	callbacks.ready();
	await watchPromise;

	callbacks.all("addDir", "/src/newdir");
	await new Promise((resolve) => setTimeout(resolve, 10));
	t.is(changeSpy.callCount, 0, "No change emitted for addDir");
	await handler.destroy();
});

test.serial("watch: emits error from watcher error event", async (t) => {
	const {watcher, callbacks} = createMockWatcher();
	chokidarWatchStub.returns(watcher);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getName: () => "test-project"
	};

	const watchPromise = handler.watch([project]);
	callbacks.ready();
	await watchPromise;

	const errorPromise = new Promise((resolve) => {
		handler.on("error", (err) => {
			t.is(err.message, "watcher error");
			resolve();
		});
	});
	callbacks.error(new Error("watcher error"));
	await errorPromise;
	await handler.destroy();
});

test.serial("watch: emits error when handler throws", async (t) => {
	const {watcher, callbacks} = createMockWatcher();
	chokidarWatchStub.returns(watcher);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: () => {
			throw new Error("virtual path error");
		},
		getName: () => "test-project"
	};

	const watchPromise = handler.watch([project]);
	callbacks.ready();
	await watchPromise;

	const errorPromise = new Promise((resolve) => {
		handler.on("error", (err) => {
			t.is(err.message, "virtual path error");
			resolve();
		});
	});
	callbacks.all("change", "/src/file.js");
	await errorPromise;
	await handler.destroy();
});
