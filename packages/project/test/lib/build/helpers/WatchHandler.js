import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

let WatchHandler;
let subscribeStub;
let accessStub;

test.before(async () => {
	subscribeStub = sinon.stub();
	accessStub = sinon.stub();
	WatchHandler = await esmock("../../../../lib/build/helpers/WatchHandler.js", {
		"@parcel/watcher": {
			default: {
				subscribe: subscribeStub
			}
		},
		"node:fs/promises": {
			access: accessStub
		}
	});
});

test.afterEach.always(() => {
	sinon.restore();
	subscribeStub.reset();
	accessStub.reset();
});

function createMockSubscription() {
	return {
		unsubscribe: sinon.stub().resolves()
	};
}

function captureCallback(subscription) {
	let resolveCb;
	const callbackReady = new Promise((resolve) => {
		resolveCb = resolve;
	});
	subscribeStub.callsFake(async (path, cb) => {
		resolveCb(cb);
		return subscription;
	});
	return callbackReady;
}

test.serial("watch: emits change events for file updates", async (t) => {
	const subscription = createMockSubscription();
	const callbackReady = captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => `/resources/${filePath.replace("/src/", "")}`,
		getName: () => "test-project"
	};

	await handler.watch([project]);
	const callback = await callbackReady;

	const changePromise = new Promise((resolve) => {
		handler.on("change", (eventType, resourcePath, proj) => {
			t.is(eventType, "update");
			t.is(resourcePath, "/resources/file.js");
			t.is(proj, project);
			resolve();
		});
	});
	callback(null, [{type: "update", path: "/src/file.js"}]);
	await changePromise;

	await handler.destroy();
	t.true(subscription.unsubscribe.calledOnce);
});

test.serial("watch: emits create events for new files", async (t) => {
	const subscription = createMockSubscription();
	const callbackReady = captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => `/resources/${filePath.replace("/src/", "")}`,
		getName: () => "test-project"
	};

	await handler.watch([project]);
	const callback = await callbackReady;

	const changePromise = new Promise((resolve) => {
		handler.on("change", (eventType, resourcePath) => {
			t.is(eventType, "create");
			t.is(resourcePath, "/resources/file.js");
			resolve();
		});
	});
	callback(null, [{type: "create", path: "/src/file.js"}]);
	await changePromise;

	await handler.destroy();
});

test.serial("watch: emits delete events", async (t) => {
	const subscription = createMockSubscription();
	const callbackReady = captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => `/resources/${filePath.replace("/src/", "")}`,
		getName: () => "test-project"
	};

	await handler.watch([project]);
	const callback = await callbackReady;

	const changePromise = new Promise((resolve) => {
		handler.on("change", (eventType, resourcePath) => {
			t.is(eventType, "delete");
			t.is(resourcePath, "/resources/gone.js");
			resolve();
		});
	});
	callback(null, [{type: "delete", path: "/src/gone.js"}]);
	await changePromise;

	await handler.destroy();
});

test.serial("watch: emits error from watcher callback error", async (t) => {
	const subscription = createMockSubscription();
	const callbackReady = captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getName: () => "test-project"
	};

	await handler.watch([project]);
	const callback = await callbackReady;

	const errorPromise = new Promise((resolve) => {
		handler.on("error", (err) => {
			t.is(err.message, "watcher error");
			resolve();
		});
	});
	callback(new Error("watcher error"));
	await errorPromise;
	await handler.destroy();
});

// @parcel/watcher surfaces dropped OS-level FS events as a callback error whose message
// asks the consumer to re-scan the file system. WatchHandler forwards it verbatim; the
// re-scan/recovery decision lives in the BuildServer error handler.
test.serial("watch: forwards dropped-events error from watcher callback", async (t) => {
	const subscription = createMockSubscription();
	const callbackReady = captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getName: () => "test-project"
	};

	await handler.watch([project]);
	const callback = await callbackReady;

	const droppedError = new Error(
		"Events were dropped by the FSEvents client. File system must be re-scanned.");
	const errorPromise = new Promise((resolve) => {
		handler.on("error", (err) => {
			t.is(err, droppedError, "forwards the original error instance");
			resolve();
		});
	});
	callback(droppedError);
	await errorPromise;
	await handler.destroy();
});

// A source dir moved/removed under the running watcher (e.g. git checkout) makes getVirtualPath
// throw the unmappable-path error. The event is dropped — neither a `change` nor a fatal `error` is
// emitted — so a branch switch does not escalate the server to terminal ERROR.
test.serial("watch: drops event whose path no longer maps to a virtual path", async (t) => {
	const subscription = createMockSubscription();
	const callbackReady = captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: () => {
			throw new Error(
				"Unable to convert source path /src/file.js to virtual path for project test-project");
		},
		getName: () => "test-project"
	};

	await handler.watch([project]);
	const callback = await callbackReady;

	const changeSpy = sinon.spy();
	const errorSpy = sinon.spy();
	handler.on("change", changeSpy);
	handler.on("error", errorSpy);

	callback(null, [{type: "update", path: "/src/file.js"}]);

	t.is(changeSpy.callCount, 0, "unmappable event is dropped, not forwarded as a change");
	t.is(errorSpy.callCount, 0, "unmappable event does not escalate to a fatal error");
	await handler.destroy();
});

test.serial("watch: subscribes to each source path", async (t) => {
	const subA = createMockSubscription();
	const subB = createMockSubscription();
	subscribeStub.onFirstCall().resolves(subA);
	subscribeStub.onSecondCall().resolves(subB);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src", "/test"],
		getVirtualPath: (filePath) => filePath,
		getName: () => "test-project"
	};

	await handler.watch([project]);

	t.is(subscribeStub.callCount, 2, "subscribed once per source path");
	t.is(subscribeStub.firstCall.args[0], "/src");
	t.is(subscribeStub.secondCall.args[0], "/test");

	await handler.destroy();
	t.true(subA.unsubscribe.calledOnce);
	t.true(subB.unsubscribe.calledOnce);
});

// A branch switch can remove a watched source dir before recovery re-subscribes. parcel then
// rejects with a bare "No such file or directory" (no code/errno), so the decision is made on
// current disk state: a missing path is skipped rather than escalated to a fatal error.
test.serial("watch: skips subscribe on a missing source path", async (t) => {
	const goodSub = createMockSubscription();
	subscribeStub.withArgs("/src").resolves(goodSub);
	subscribeStub.withArgs("/gone").rejects(new Error("No such file or directory"));
	// /gone no longer exists on disk; /src does.
	accessStub.withArgs("/gone").rejects(new Error("ENOENT"));
	accessStub.withArgs("/src").resolves();

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src", "/gone"],
		getVirtualPath: (filePath) => filePath,
		getName: () => "test-project"
	};

	const errorSpy = sinon.spy();
	handler.on("error", errorSpy);

	await t.notThrowsAsync(handler.watch([project]), "watch resolves despite the missing path");
	t.is(errorSpy.callCount, 0, "no error emitted for a skipped missing path");

	await handler.destroy();
	t.true(goodSub.unsubscribe.calledOnce, "the surviving path was subscribed and torn down");
});

// A subscribe failure on a path that still exists is a genuine watcher fault, not a vanished
// source dir. It must propagate so BuildServer's loop-protected recovery/escalation applies.
test.serial("watch: rejects when subscribe fails on an existing path", async (t) => {
	subscribeStub.withArgs("/src").rejects(new Error("EMFILE: too many open files"));
	accessStub.withArgs("/src").resolves(); // path present → genuine fault

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => filePath,
		getName: () => "test-project"
	};

	await t.throwsAsync(handler.watch([project]), {
		message: "EMFILE: too many open files"
	}, "subscribe failure on an existing path propagates");

	await handler.destroy();
});

test.serial("destroy: unsubscribes subscriptions in parallel", async (t) => {
	const subA = createMockSubscription();
	const subB = createMockSubscription();
	// Make subA's unsubscribe block until subB's has at least started.
	// If destroy() runs sequentially, subB.unsubscribe is never called while
	// subA is still pending and the test deadlocks (caught by AVA timeout).
	let resolveA;
	subA.unsubscribe = sinon.stub().returns(new Promise((resolve) => {
		resolveA = resolve;
	}));
	subB.unsubscribe = sinon.stub().callsFake(async () => {
		resolveA();
	});
	subscribeStub.onFirstCall().resolves(subA);
	subscribeStub.onSecondCall().resolves(subB);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src", "/test"],
		getVirtualPath: (filePath) => filePath,
		getName: () => "test-project"
	};

	await handler.watch([project]);
	await handler.destroy();

	t.true(subA.unsubscribe.calledOnce);
	t.true(subB.unsubscribe.calledOnce);
});

test.serial("destroy: continues unsubscribing when one subscription rejects", async (t) => {
	const subA = createMockSubscription();
	const subB = createMockSubscription();
	const subC = createMockSubscription();
	subA.unsubscribe = sinon.stub().rejects(new Error("unsub A failed"));
	subB.unsubscribe = sinon.stub().resolves();
	subC.unsubscribe = sinon.stub().rejects(new Error("unsub C failed"));
	subscribeStub.onCall(0).resolves(subA);
	subscribeStub.onCall(1).resolves(subB);
	subscribeStub.onCall(2).resolves(subC);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/a", "/b", "/c"],
		getVirtualPath: (filePath) => filePath,
		getName: () => "test-project"
	};

	const errorSpy = sinon.spy();
	handler.on("error", errorSpy);

	await handler.watch([project]);
	await handler.destroy();

	t.true(subA.unsubscribe.calledOnce, "subA was attempted");
	t.true(subB.unsubscribe.calledOnce, "subB still ran despite subA failing");
	t.true(subC.unsubscribe.calledOnce, "subC still ran despite subA failing");
	t.is(errorSpy.callCount, 1, "single aggregated error emitted");
	const aggErr = errorSpy.firstCall.args[0];
	t.true(aggErr instanceof AggregateError, "emits AggregateError");
	t.is(aggErr.errors.length, 2, "both failures collected");
	t.deepEqual(aggErr.errors.map((e) => e.message).sort(), ["unsub A failed", "unsub C failed"]);
});

test.serial("destroy: is idempotent", async (t) => {
	const subscription = createMockSubscription();
	captureCallback(subscription);

	const handler = new WatchHandler();
	const project = {
		getSourcePaths: () => ["/src"],
		getVirtualPath: (filePath) => filePath,
		getName: () => "test-project"
	};

	await handler.watch([project]);
	await handler.destroy();
	await handler.destroy();

	t.is(subscription.unsubscribe.callCount, 1, "unsubscribe not invoked on second destroy");
});
