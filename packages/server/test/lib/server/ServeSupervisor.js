import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {EventEmitter} from "node:events";

// A fake BuildServer: EventEmitter plus the reader/error/destroy surface the supervisor uses.
function createBuildServer() {
	const buildServer = new EventEmitter();
	buildServer.getServeError = sinon.stub().returns(null);
	buildServer.destroy = sinon.stub().resolves();
	return buildServer;
}

// Builds a mock set for esmock. Each buildServeApp invocation returns the next queued stack, so a
// test can hand out distinct {app, buildServer} pairs across the initial build and re-inits.
function createMocks({stacks, buildServeAppImpl} = {}) {
	const httpServer = new EventEmitter();
	httpServer.close = sinon.stub().callsFake((cb) => cb && cb());

	const createdHandlers = [];
	const listen = sinon.stub().resolves({port: 3000, server: httpServer});
	const addSsl = sinon.stub().callsFake(async ({app}) => app);
	const announceListening = sinon.stub();

	const liveReloadHandle = {close: sinon.stub()};
	const attachLiveReloadServer = sinon.stub().returns(liveReloadHandle);

	const stackQueue = stacks ? [...stacks] : null;
	const buildServeApp = sinon.stub().callsFake(async (graph, config, error) => {
		if (buildServeAppImpl) {
			return buildServeAppImpl(graph, config, error);
		}
		return stackQueue.shift();
	});

	const httpMock = {
		default: {
			createServer: sinon.stub().callsFake((handler) => {
				createdHandlers.push(handler);
				return httpServer;
			})
		}
	};

	const mocks = {
		"node:http": httpMock,
		"../../../lib/serveApp.js": {default: buildServeApp},
		"../../../lib/serveHttp.js": {listen, addSsl, announceListening},
		"../../../lib/liveReload/server.js": {default: attachLiveReloadServer},
	};

	return {
		mocks, httpServer, listen, addSsl, announceListening,
		attachLiveReloadServer, liveReloadHandle, buildServeApp, createdHandlers,
	};
}

function createStack(app) {
	return {
		app: app ?? sinon.stub(),
		buildServer: createBuildServer(),
		liveReloadOptions: {active: true, token: "tok"},
	};
}

async function importSupervisor(mocks) {
	return esmock("../../../lib/ServeSupervisor.js", mocks);
}

const baseConfig = {port: 3000, liveReload: true, webSocketToken: "tok"};

test.afterEach.always(() => {
	sinon.restore();
});

test("create() builds the initial stack, binds once, attaches live-reload to a stable relay", async (t) => {
	const stack = createStack();
	const {mocks, listen, attachLiveReloadServer, buildServeApp} = createMocks({stacks: [stack]});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {});

	t.is(supervisor.getPort(), 3000);
	t.true(buildServeApp.calledOnce);
	t.true(listen.calledOnce, "port is bound exactly once");
	// Live-reload is attached to the stable relay, not the BuildServer directly.
	t.true(attachLiveReloadServer.calledOnce);
	const {buildServer: relay} = attachLiveReloadServer.firstCall.args[0];
	t.not(relay, stack.buildServer, "live-reload subscribes to the relay, not the BuildServer");
	t.true(relay instanceof EventEmitter);
});

test("request trampoline retargets to the swapped app after reinitialize()", async (t) => {
	const app1 = sinon.stub();
	const app2 = sinon.stub();
	const stack1 = createStack(app1);
	const stack2 = createStack(app2);
	const graphFactory = sinon.stub().resolves({});
	const {mocks, listen, createdHandlers} = createMocks({stacks: [stack1, stack2]});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {graphFactory});

	// The stable request handler passed to http.createServer.
	const trampoline = createdHandlers[0];
	trampoline("req", "res");
	t.true(app1.calledOnceWithExactly("req", "res"), "routed to app1 before swap");

	await supervisor.reinitialize();

	trampoline("req2", "res2");
	t.true(app2.calledOnceWithExactly("req2", "res2"), "routed to app2 after swap");
	t.true(listen.calledOnce, "the socket is not re-bound on reinitialize");
});

test("reinitialize() is build-new-then-swap: new stack is built before the old is destroyed", async (t) => {
	const order = [];
	const stack1 = createStack();
	stack1.buildServer.destroy = sinon.stub().callsFake(async () => {
		order.push("destroy-old");
	});
	const stack2 = createStack();
	const graphFactory = sinon.stub().callsFake(async () => {
		order.push("graphFactory");
		return {};
	});
	const {mocks} = createMocks({
		buildServeAppImpl: async () => {
			order.push("buildServeApp");
			return order.filter((s) => s === "buildServeApp").length === 1 ? stack1 : stack2;
		}
	});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {graphFactory});
	order.length = 0; // drop the initial build

	await supervisor.reinitialize();

	t.deepEqual(order, ["graphFactory", "buildServeApp", "destroy-old"],
		"new graph resolved and new app built before the old BuildServer is destroyed");
});

test("reinitialize() failure keeps the last-good stack serving", async (t) => {
	let calls = 0;
	const app1 = sinon.stub();
	const stack1 = createStack(app1);
	const buildError = new Error("invalid ui5.yaml");
	const graphFactory = sinon.stub().resolves({});
	const {mocks, attachLiveReloadServer, createdHandlers} = createMocks({
		buildServeAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1;
			}
			throw buildError;
		}
	});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const errorEvents = [];
	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {graphFactory});
	supervisor.on("error", (err) => errorEvents.push(err));

	await t.notThrowsAsync(supervisor.reinitialize(), "a broken definition does not reject");

	// The trampoline still routes to the last-good app — the failed build was not adopted.
	createdHandlers[0]("req", "res");
	t.true(app1.calledOnceWithExactly("req", "res"), "requests still route to the last-good app");
	t.false(stack1.buildServer.destroy.called, "old BuildServer is not destroyed on failure");
	t.is(errorEvents.length, 0, "no fatal 'error' event is emitted");
	t.true(attachLiveReloadServer.calledOnce);
});

test("live-reload subscription moves to the new BuildServer across a swap", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	sinon.spy(stack1.buildServer, "off");
	sinon.spy(stack2.buildServer, "on");
	const graphFactory = sinon.stub().resolves({});
	const {mocks, attachLiveReloadServer} = createMocks({stacks: [stack1, stack2]});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {graphFactory});
	const relay = attachLiveReloadServer.firstCall.args[0].buildServer;

	await supervisor.reinitialize();

	t.true(stack1.buildServer.off.calledWith("sourcesChanged"), "old BuildServer is detached from the relay");
	t.true(stack2.buildServer.on.calledWith("sourcesChanged"), "new BuildServer is attached to the relay");

	// A sourcesChanged from the new BuildServer still reaches relay subscribers.
	let relayed = 0;
	relay.on("sourcesChanged", () => relayed++);
	stack2.buildServer.emit("sourcesChanged");
	t.is(relayed, 1, "new BuildServer drives the stable relay");

	// The detached old BuildServer no longer drives it.
	stack1.buildServer.emit("sourcesChanged");
	t.is(relayed, 1, "old BuildServer no longer drives the relay");
});

test("overlapping reinitialize() calls collapse into one trailing pass", async (t) => {
	const stack1 = createStack();
	// Pre-created gate so resolving it does not depend on the async callback having run yet.
	const firstReinitGate = Promise.withResolvers();
	let buildCalls = 0;
	const graphFactory = sinon.stub().resolves({});
	const {mocks} = createMocks({
		buildServeAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			if (buildCalls === 2) {
				// First re-init: block until released to create the overlap window.
				await firstReinitGate.promise;
			}
			return createStack();
		}
	});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {graphFactory});

	const p1 = supervisor.reinitialize();
	const p2 = supervisor.reinitialize(); // collapses into a trailing pass while p1 is in flight
	firstReinitGate.resolve();
	await Promise.all([p1, p2]);

	// One initial build + two re-init builds (the second is the single trailing pass).
	t.is(buildCalls, 3, "the trailing pass runs exactly once, sequentially");
});

test("destroy() closes live-reload, the socket, and the BuildServer; reinitialize() is then a no-op", async (t) => {
	const stack = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, httpServer, liveReloadHandle} = createMocks({stacks: [stack]});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {graphFactory});

	await new Promise((resolve) => supervisor.destroy(resolve));

	t.true(liveReloadHandle.close.calledOnce);
	t.true(httpServer.close.calledOnce);
	t.true(stack.buildServer.destroy.calledOnce);

	await supervisor.reinitialize();
	t.true(graphFactory.notCalled, "reinitialize after destroy does nothing");
});

test("destroy() closes the socket even when BuildServer.destroy() rejects", async (t) => {
	const stack = createStack();
	stack.buildServer.destroy = sinon.stub().rejects(new Error("destroy failed"));
	const {mocks, httpServer} = createMocks({stacks: [stack]});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {});

	await new Promise((resolve) => supervisor.destroy(resolve));
	t.true(httpServer.close.calledOnce, "socket is closed despite the BuildServer destroy rejection");
});

test("reinitialize() warns and no-ops when no graphFactory was provided", async (t) => {
	const stack = createStack();
	const {mocks, buildServeApp} = createMocks({stacks: [stack]});
	const {default: ServeSupervisor} = await importSupervisor(mocks);

	const supervisor = await ServeSupervisor.create({}, baseConfig, undefined, {});
	await supervisor.reinitialize();
	t.true(buildServeApp.calledOnce, "no re-init build happens without a graphFactory");
});
