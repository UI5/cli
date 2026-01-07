import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

function createSessionStubs() {
	const connectStub = sinon.stub();
	const postStub = sinon.stub().callsFake(async (method) => {
		if (method === "Profiler.stop") {
			return {profile: {foo: "bar"}};
		}
		return {};
	});
	class Session {
		connect() {
			return connectStub();
		}
		post(method) {
			return postStub(method);
		}
	}
	return {Session, connectStub, postStub};
}

test.afterEach.always(() => {
	sinon.restore();
});

test.serial("start() enables and starts profiler and registers signals", async (t) => {
	const {Session, connectStub, postStub} = createSessionStubs();
	const writeFileSyncStub = sinon.stub();

	const installed = new Map();
	const onStub = sinon.stub(process, "on").callsFake((signal, handler) => {
		installed.set(signal, handler);
		return process;
	});
	const removeListenerStub = sinon.stub(process, "removeListener");

	const {start, stop} = await esmock("../../../lib/utils/profile.js", {
		"node:inspector/promises": {Session},
		"node:fs": {writeFileSync: writeFileSyncStub}
	});

	await start();

	t.true(connectStub.calledOnce, "session.connect called once");
	t.true(postStub.calledWith("Profiler.enable"), "Profiler.enable posted");
	t.true(postStub.calledWith("Profiler.start"), "Profiler.start posted");

	// Four signals should be registered
	t.true(onStub.calledWith("SIGHUP"));
	t.true(onStub.calledWith("SIGINT"));
	t.true(onStub.calledWith("SIGTERM"));
	t.true(onStub.calledWith("SIGBREAK"));

	// Cleanup to reset internal state
	await stop();

	// stop should deregister the same handlers
	t.true(removeListenerStub.calledWith("SIGHUP", installed.get("SIGHUP")));
	t.true(removeListenerStub.calledWith("SIGINT", installed.get("SIGINT")));
	t.true(removeListenerStub.calledWith("SIGTERM", installed.get("SIGTERM")));
	t.true(removeListenerStub.calledWith("SIGBREAK", installed.get("SIGBREAK")));
});

test.serial("start() is idempotent", async (t) => {
	const {Session, connectStub} = createSessionStubs();
	const writeFileSyncStub = sinon.stub();

	sinon.stub(process, "on").returns(process);
	sinon.stub(process, "removeListener");

	const {start, stop} = await esmock("../../../lib/utils/profile.js", {
		"node:inspector/promises": {Session},
		"node:fs": {writeFileSync: writeFileSyncStub}
	});

	await start();
	await start();
	t.true(connectStub.calledOnce, "connect should be called only once");

	await stop();
});

test.serial("stop() writes profile and deregisters signals", async (t) => {
	const {Session, postStub} = createSessionStubs();
	const writeFileSyncStub = sinon.stub();

	const installed = new Map();
	sinon.stub(process, "on").callsFake((signal, handler) => {
		installed.set(signal, handler);
		return process;
	});
	const removeListenerStub = sinon.stub(process, "removeListener");

	const {start, stop} = await esmock("../../../lib/utils/profile.js", {
		"node:inspector/promises": {Session},
		"node:fs": {writeFileSync: writeFileSyncStub}
	});

	await start();
	t.true(postStub.calledWith("Profiler.start"));

	await stop();

	t.true(writeFileSyncStub.calledOnce, "profile written once");
	const [fileName, content] = writeFileSyncStub.firstCall.args;
	t.regex(fileName, /^\.\/ui5_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.cpuprofile$/, "filename matches pattern");
	t.deepEqual(JSON.parse(content), {foo: "bar"}, "written profile content matches");

	t.true(removeListenerStub.calledWith("SIGHUP", installed.get("SIGHUP")));
	t.true(removeListenerStub.calledWith("SIGINT", installed.get("SIGINT")));
	t.true(removeListenerStub.calledWith("SIGTERM", installed.get("SIGTERM")));
	t.true(removeListenerStub.calledWith("SIGBREAK", installed.get("SIGBREAK")));
});

test.serial("stop() without start is a no-op", async (t) => {
	const writeFileSyncStub = sinon.stub();

	const removeListenerStub = sinon.stub(process, "removeListener");

	const {stop} = await esmock("../../../lib/utils/profile.js", {
		"node:inspector/promises": {Session: class {}},
		"node:fs": {writeFileSync: writeFileSyncStub}
	});

	await stop();

	t.true(removeListenerStub.notCalled, "no signal deregistration happened");
	t.true(writeFileSyncStub.notCalled, "no write happened");
});

test.serial("signal handler stops profiling and exits", async (t) => {
	const {Session, postStub} = createSessionStubs();
	const writeFileSyncStub = sinon.stub();

	const installed = new Map();
	sinon.stub(process, "on").callsFake((signal, handler) => {
		installed.set(signal, handler);
		return process;
	});
	const removeListenerStub = sinon.stub(process, "removeListener");
	const exitStub = sinon.stub(process, "exit");

	const {start} = await esmock("../../../lib/utils/profile.js", {
		"node:inspector/promises": {Session},
		"node:fs": {writeFileSync: writeFileSyncStub}
	});

	await start();

	t.true(typeof installed.get("SIGINT") === "function", "SIGINT handler registered");

	// Trigger the signal handler
	installed.get("SIGINT")();

	// Allow the Promise chain in the handler (stop().then(...)) to run
	await new Promise((resolve) => setImmediate(resolve));

	t.true(postStub.calledWith("Profiler.stop"), "Profiler.stop posted via handler");
	t.true(writeFileSyncStub.calledOnce, "profile written by handler");
	t.true(exitStub.calledWith(128 + 2), "process.exit called with SIGINT code");

	// Signals should be deregistered during stop
	t.true(removeListenerStub.calledWith("SIGHUP", installed.get("SIGHUP")));
	t.true(removeListenerStub.calledWith("SIGINT", installed.get("SIGINT")));
	t.true(removeListenerStub.calledWith("SIGTERM", installed.get("SIGTERM")));
	t.true(removeListenerStub.calledWith("SIGBREAK", installed.get("SIGBREAK")));
});
