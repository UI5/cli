import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {EventEmitter} from "node:events";
// Real RecoveryBudget, fed into the mocked ProjectDefinitionWatcher module below so the Supervisor's
// `new RecoveryBudget()` keeps its real behaviour.
import {RecoveryBudget} from "@ui5/project/internal/graph/ProjectDefinitionWatcher";

// A fake BuildServer: EventEmitter plus the reader/error/destroy surface the supervisor uses.
function createBuildServer() {
	const buildServer = new EventEmitter();
	buildServer.getServeError = sinon.stub().returns(null);
	buildServer.destroy = sinon.stub().resolves();
	buildServer.suspendReaders = sinon.stub();
	buildServer.resumeReaders = sinon.stub();
	buildServer.suspendBuilds = sinon.stub();
	return buildServer;
}

// Builds a mock set for esmock. Each buildApp invocation returns the next queued stack, so a
// test can hand out distinct {app, buildServer} pairs across the initial build and re-inits.
function createMocks({stacks, buildAppImpl, definitionWatcherCreate} = {}) {
	const httpServer = new EventEmitter();
	httpServer.close = sinon.stub().callsFake((cb) => cb && cb());

	const createdHandlers = [];
	const listen = sinon.stub().resolves({port: 3000, server: httpServer});
	const addSsl = sinon.stub().callsFake(async ({app}) => app);
	const announceListening = sinon.stub();

	const liveReloadHandle = {close: sinon.stub()};
	const attachLiveReloadServer = sinon.stub().returns(liveReloadHandle);

	// Fake ProjectDefinitionWatcher: each create() hands out a fresh EventEmitter with a destroy() stub,
	// recorded so a test can assert re-targeting/teardown. A custom impl overrides create().
	const definitionWatchers = [];
	const ProjectDefinitionWatcher = {
		create: sinon.stub().callsFake(async (opts) => {
			if (definitionWatcherCreate) {
				return definitionWatcherCreate(opts);
			}
			const watcher = new EventEmitter();
			watcher.createOptions = opts;
			watcher.destroy = sinon.stub().resolves();
			definitionWatchers.push(watcher);
			return watcher;
		}),
	};
	const waitForProjectGraphSettled = sinon.stub().resolves();

	const stackQueue = stacks ? [...stacks] : null;
	const buildApp = sinon.stub().callsFake(async (graph, config, error, getDegradedError) => {
		if (buildAppImpl) {
			return buildAppImpl(graph, config, error, getDegradedError);
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
		"@ui5/project/internal/graph/ProjectDefinitionWatcher": {
			default: ProjectDefinitionWatcher,
			DEFINITION_CHANGED_SETTLE_MS: 550,
			waitForProjectGraphSettled,
			RecoveryBudget,
		},
		"../../../../lib/serve/stack.js": {default: buildApp},
		"../../../../lib/serve/httpListener.js": {listen, addSsl, announceListening},
		"../../../../lib/liveReload/server.js": {default: attachLiveReloadServer},
	};

	return {
		mocks, httpServer, listen, addSsl, announceListening,
		attachLiveReloadServer, liveReloadHandle, buildApp, createdHandlers,
		ProjectDefinitionWatcher, definitionWatchers, waitForProjectGraphSettled,
	};
}

function createStack(app) {
	return {
		app: app ?? sinon.stub(),
		buildServer: createBuildServer(),
		liveReloadOptions: {active: true, token: "tok"},
	};
}

// A minimal graph stub the Supervisor can traverse for its recovery-convergence root check
// (#graphRootPaths). Only the degraded-recovery path traverses the graph; healthy swaps hand the
// graph straight to the (mocked) buildApp and ProjectDefinitionWatcher, so a bare {} suffices there.
function createGraph(rootPaths = ["/app"]) {
	return {
		rootPaths,
		traverseBreadthFirst: async (cb) => {
			for (const rootPath of rootPaths) {
				await cb({project: {getRootPath: () => rootPath}});
			}
		},
	};
}

async function importSupervisor(mocks) {
	return esmock("../../../../lib/serve/Supervisor.js", mocks);
}

// Yields to the microtask queue until `predicate()` holds or the attempt budget is spent. The
// recovery convergence loop awaits several times per iteration (graphFactory, root traversal, the
// settle stub), so a single microtask flush is not enough to reach a given call count.
async function waitFor(predicate, attempts = 50) {
	for (let i = 0; i < attempts; i++) {
		if (predicate()) {
			return;
		}
		await Promise.resolve();
	}
}

// Drains the microtask queue. A degraded recovery swap awaits several times per convergence iteration
// before it reschedules the next timer, so one Promise.resolve() after a clock tick is not enough.
async function flushMicrotasks(rounds = 20) {
	for (let i = 0; i < rounds; i++) {
		await Promise.resolve();
	}
}

// Drives the fast recovery burst to exhaustion: the manual reinitialize plus the five budgeted
// retries, each fired one 550 ms settle window apart. Leaves the Supervisor degraded with the slow
// timer armed.
async function drainFastBudget(supervisor, clock) {
	await supervisor.reinitialize();
	for (let i = 0; i < 5; i++) {
		await clock.tickAsync(550);
		await flushMicrotasks();
	}
}

const baseConfig = {port: 3000, liveReload: true, webSocketToken: "tok"};

test.afterEach.always(() => {
	sinon.restore();
});

test("create() builds the initial stack, binds once, attaches live-reload to a stable relay", async (t) => {
	const stack = createStack();
	const {mocks, listen, attachLiveReloadServer, buildApp} = createMocks({stacks: [stack]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, undefined);

	t.is(supervisor.getPort(), 3000);
	t.true(buildApp.calledOnce);
	t.true(listen.calledOnce, "port is bound exactly once");
	// Live-reload is attached to the stable relay, not the BuildServer directly.
	t.true(attachLiveReloadServer.calledOnce);
	const {buildServer: relay} = attachLiveReloadServer.firstCall.args[0];
	t.not(relay, stack.buildServer, "live-reload subscribes to the relay, not the BuildServer");
	t.true(relay instanceof EventEmitter);
});

test("request dispatcher retargets to the swapped app after reinitialize()", async (t) => {
	const app1 = sinon.stub();
	const app2 = sinon.stub();
	const stack1 = createStack(app1);
	const stack2 = createStack(app2);
	const graphFactory = sinon.stub().resolves({});
	const {mocks, listen, createdHandlers} = createMocks({stacks: [stack1, stack2]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);

	// The stable request handler passed to http.createServer.
	const dispatcher = createdHandlers[0];
	dispatcher("req", "res");
	t.true(app1.calledOnceWithExactly("req", "res"), "routed to app1 before swap");

	await supervisor.reinitialize();

	dispatcher("req2", "res2");
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
		buildAppImpl: async () => {
			order.push("buildApp");
			return order.filter((s) => s === "buildApp").length === 1 ? stack1 : stack2;
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	order.length = 0; // drop the initial build

	await supervisor.reinitialize();

	t.deepEqual(order, ["graphFactory", "buildApp", "destroy-old"],
		"new graph resolved and new app built before the old BuildServer is destroyed");
});

test("reinitialize() failure keeps the last-good stack serving", async (t) => {
	let calls = 0;
	const app1 = sinon.stub();
	const stack1 = createStack(app1);
	const buildError = new Error("invalid ui5.yaml");
	const graphFactory = sinon.stub().resolves({});
	const {mocks, attachLiveReloadServer, createdHandlers} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1;
			}
			throw buildError;
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const errorEvents = [];
	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	supervisor.on("error", (err) => errorEvents.push(err));
	// A failed swap self-schedules a recovery timer; destroy() clears it synchronously so it does not
	// fire on the shared real clock (re-resolving the bare {} graph) during other concurrent tests.
	t.teardown(() => supervisor.destroy());

	await t.notThrowsAsync(supervisor.reinitialize(), "a broken definition does not reject");

	// The dispatcher still routes to the last-good app: the failed build was not adopted.
	createdHandlers[0]("req", "res");
	t.true(app1.calledOnceWithExactly("req", "res"), "requests still route to the last-good app");
	t.false(stack1.buildServer.destroy.called, "old BuildServer is not destroyed on failure");
	t.is(errorEvents.length, 0, "no fatal 'error' event is emitted");
	t.true(attachLiveReloadServer.calledOnce);
});

test("live-reload subscription moves to the new BuildServer across a swap", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, attachLiveReloadServer} = createMocks({stacks: [stack1, stack2]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	const relay = attachLiveReloadServer.firstCall.args[0].buildServer;
	t.is(stack1.buildServer.listenerCount("sourcesChanged"), 1, "old BuildServer starts attached to the relay");
	t.is(stack2.buildServer.listenerCount("sourcesChanged"), 0, "new BuildServer is not attached before the swap");

	await supervisor.reinitialize();

	t.is(stack1.buildServer.listenerCount("sourcesChanged"), 0, "old BuildServer is detached from the relay");
	t.is(stack2.buildServer.listenerCount("sourcesChanged"), 1, "new BuildServer is attached to the relay");

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
		buildAppImpl: async () => {
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
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);

	const p1 = supervisor.reinitialize();
	const p2 = supervisor.reinitialize(); // collapses into a trailing pass while p1 is in flight
	firstReinitGate.resolve();
	await Promise.all([p1, p2]);

	// One initial build + two re-init builds (the second is the single trailing pass).
	t.is(buildCalls, 3, "the trailing pass runs exactly once, sequentially");
});

test("a queued reinitialize() does not re-resolve early; the trailing pass owns the only extra resolve",
	async (t) => {
		const stack1 = createStack();
		// Hold the first re-init inside buildApp to open an overlap window, mirroring a slow
		// framework build on a large project.
		const firstBuildGate = Promise.withResolvers();
		let buildCalls = 0;
		const {mocks} = createMocks({
			buildAppImpl: async () => {
				buildCalls++;
				if (buildCalls === 1) {
					return stack1; // initial build
				}
				if (buildCalls === 2) {
					await firstBuildGate.promise; // first re-init: park inside the build
				}
				return createStack();
			}
		});
		const graphFactory = sinon.stub().resolves({});
		const {default: Supervisor} = await importSupervisor(mocks);

		const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
		t.is(graphFactory.callCount, 0, "no resolve on the initial build");

		const p1 = supervisor.reinitialize(); // starts #swap(): resolves, then parks in buildApp
		// Let the first swap reach its (blocked) build so #reinitInProgress is set.
		await new Promise((resolve) => setImmediate(resolve));
		t.is(graphFactory.callCount, 1, "first swap resolved the graph");

		// A second definitionChanged lands while the first swap's build is still in flight. The
		// queued branch only sets the trailing-pass flag; it must NOT resolve the graph early.
		const p2 = supervisor.reinitialize();
		await p2;
		t.is(graphFactory.callCount, 1, "the queued re-init does not re-resolve while the swap builds");

		// Release the first build; the trailing pass then re-resolves once for the swap it performs.
		firstBuildGate.resolve();
		await p1;
		t.is(graphFactory.callCount, 2, "only the trailing pass adds a resolve");
		t.is(buildCalls, 3, "one initial build + first swap + trailing-pass swap");
	});

test("create() tears down the bound socket and BuildServer when the definition watcher fails to arm",
	async (t) => {
		const stack = createStack();
		const graphFactory = sinon.stub().resolves({});
		const watcherError = new Error("@parcel/watcher subscribe failed");
		const {mocks, httpServer, liveReloadHandle} = createMocks({
			stacks: [stack],
			definitionWatcherCreate: async () => {
				throw watcherError;
			},
		});
		const {default: Supervisor} = await importSupervisor(mocks);

		await t.throwsAsync(Supervisor.create({}, baseConfig, undefined, graphFactory), {
			is: watcherError,
		}, "the watcher-arm failure propagates to the caller");

		// A post-bind failure must not leak the socket, live-reload handle, relay, or BuildServer.
		t.true(httpServer.close.calledOnce, "the bound socket is closed");
		t.true(liveReloadHandle.close.calledOnce, "the live-reload handle is closed");
		t.true(stack.buildServer.destroy.calledOnce, "the BuildServer is destroyed");
		t.is(stack.buildServer.listenerCount("sourcesChanged"), 0, "the relay subscription is detached");
	});

test("destroy() closes live-reload, the socket, and the BuildServer; reinitialize() is then a no-op", async (t) => {
	const stack = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, httpServer, liveReloadHandle} = createMocks({stacks: [stack]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);

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
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, undefined);

	await new Promise((resolve) => supervisor.destroy(resolve));
	t.true(httpServer.close.calledOnce, "socket is closed despite the BuildServer destroy rejection");
});

test("reinitialize() warns and no-ops when no graphFactory was provided", async (t) => {
	const stack = createStack();
	const {mocks, buildApp} = createMocks({stacks: [stack]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, undefined);
	await supervisor.reinitialize();
	t.true(buildApp.calledOnce, "no re-init build happens without a graphFactory");
});

test("definition watcher is created on create() only when a graphFactory is present", async (t) => {
	const stack = createStack();
	const {mocks, ProjectDefinitionWatcher} = createMocks({stacks: [stack]});
	const {default: Supervisor} = await importSupervisor(mocks);

	await Supervisor.create({}, baseConfig, undefined, undefined);
	t.true(ProjectDefinitionWatcher.create.notCalled, "no watcher without a graphFactory");
});

test("definition watcher is created with the threaded config params", async (t) => {
	const stack = createStack();
	const graphFactory = sinon.stub().resolves({});
	const graph = {getRoot: () => ({})};
	const config = {
		...baseConfig,
		rootConfigPath: "/app/custom.yaml",
		workspaceConfigPath: null,
		dependencyDefinitionPath: "/app/deps.yaml",
		cwd: "/app",
	};
	const {mocks, ProjectDefinitionWatcher} = createMocks({stacks: [stack]});
	const {default: Supervisor} = await importSupervisor(mocks);

	await Supervisor.create(graph, config, undefined, graphFactory);

	t.true(ProjectDefinitionWatcher.create.calledOnce);
	const opts = ProjectDefinitionWatcher.create.firstCall.args[0];
	t.is(opts.graph, graph, "watcher gets the initial graph");
	t.is(opts.rootConfigPath, "/app/custom.yaml");
	t.is(opts.workspaceConfigPath, null);
	t.is(opts.dependencyDefinitionPath, "/app/deps.yaml");
	t.is(opts.cwd, "/app");
});

test("a definitionChanged event triggers reinitialize()", async (t) => {
	const app2 = sinon.stub();
	const stack1 = createStack();
	const stack2 = createStack(app2);
	const graphFactory = sinon.stub().resolves({});
	const {mocks, definitionWatchers, createdHandlers} = createMocks({stacks: [stack1, stack2]});
	const {default: Supervisor} = await importSupervisor(mocks);

	await Supervisor.create({}, baseConfig, undefined, graphFactory);

	// The watcher created on init drives the re-init.
	definitionWatchers[0].emit("definitionChanged", {eventType: "update", filePath: "/app/ui5.yaml"});
	// reinitialize() is async; let the swap settle.
	await new Promise((resolve) => setImmediate(resolve));

	createdHandlers[0]("req", "res");
	t.true(app2.calledOnceWithExactly("req", "res"), "definition change swapped in the new app");
});

test("a definitionChanging event signals ui5.project-resolve-started (version-slot reset)", async (t) => {
	const stack1 = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, definitionWatchers} = createMocks({stacks: [stack1]});
	const {default: Supervisor} = await importSupervisor(mocks);

	await Supervisor.create({}, baseConfig, undefined, graphFactory);

	let started = false;
	const onResolveStarted = () => {
		started = true;
	};
	process.once("ui5.project-resolve-started", onResolveStarted);
	// The watcher's leading-edge event: a re-resolve is coming, blank the version slot.
	definitionWatchers[0].emit("definitionChanging", {eventType: "update", filePath: "/app/ui5.yaml"});
	process.off("ui5.project-resolve-started", onResolveStarted);

	t.true(started, "ui5.project-resolve-started was emitted to reset the version slot");
});

test("a failed swap releases the version placeholder via ui5.project-resolve-failed", async (t) => {
	const stack1 = createStack();
	let calls = 0;
	const graphFactory = sinon.stub().resolves({});
	const {mocks} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1; // initial build
			}
			throw new Error("invalid ui5.yaml"); // the re-init build fails
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	// A failed swap self-schedules a recovery timer; destroy() clears it synchronously so it does not
	// fire on the shared real clock during other concurrent tests.
	t.teardown(() => supervisor.destroy());

	let failed = false;
	const onResolveFailed = () => {
		failed = true;
	};
	process.once("ui5.project-resolve-failed", onResolveFailed);
	await supervisor.reinitialize();
	process.off("ui5.project-resolve-failed", onResolveFailed);

	t.true(failed, "a failed swap emits ui5.project-resolve-failed so the placeholder does not wedge");
});

test("a failed swap flags the stack degraded; the accessor threaded to buildApp reflects it", async (t) => {
	const stack1 = createStack();
	const buildError = new Error("invalid ui5.yaml");
	let calls = 0;
	const graphFactory = sinon.stub().resolves({});
	const {mocks, buildApp} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1; // initial build
			}
			throw buildError; // the re-init build fails
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	// A failed swap self-schedules a recovery timer; destroy() clears it synchronously so it does not
	// fire on the shared real clock during other concurrent tests.
	t.teardown(() => supervisor.destroy());

	// The stable accessor the supervisor threads into every stack it builds.
	const getDegradedError = buildApp.firstCall.args[3];
	t.is(typeof getDegradedError, "function", "a getDegradedError accessor is passed to buildApp");
	t.is(getDegradedError(), null, "not degraded while the initial stack is healthy");

	await supervisor.reinitialize();

	t.is(getDegradedError(), buildError,
		"a failed re-resolve flags the surviving stack degraded with the resolve error");
});

test("a message is emitted with ui5.project-resolve-failed for the degraded status line", async (t) => {
	const stack1 = createStack();
	let calls = 0;
	const graphFactory = sinon.stub().resolves({});
	const {mocks} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1;
			}
			throw new Error("Cannot read ui5.yaml: no such file");
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	// A failed swap self-schedules a recovery timer; destroy() clears it synchronously so it does not
	// fire on the shared real clock during other concurrent tests.
	t.teardown(() => supervisor.destroy());

	// Tests in this file run concurrently and share the global `process` emitter, so collect all
	// emissions and match this test's unique message rather than grabbing the first event.
	const messages = [];
	const onResolveFailed = (evt) => {
		messages.push(evt?.message);
	};
	process.on("ui5.project-resolve-failed", onResolveFailed);
	await supervisor.reinitialize();
	process.off("ui5.project-resolve-failed", onResolveFailed);

	t.true(messages.includes("Cannot read ui5.yaml: no such file"),
		"the failure message rides along for the console degraded line");
});

test("a successful re-resolve after a failed one clears the degraded flag", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	let calls = 0;
	// The recovery reinit runs the convergence loop, which traverses the resolved graph, so hand it a
	// traversable graph with a stable root set (converges after the second resolve agrees).
	const graphFactory = sinon.stub().resolves(createGraph());
	const {mocks, buildApp} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1; // initial build
			}
			if (calls === 2) {
				throw new Error("invalid ui5.yaml"); // first re-init fails -> degraded
			}
			return stack2; // second re-init succeeds -> healthy
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create(createGraph(), baseConfig, undefined, graphFactory);
	const getDegradedError = buildApp.firstCall.args[3];

	await supervisor.reinitialize();
	t.truthy(getDegradedError(), "degraded after the failed swap");

	await supervisor.reinitialize();
	t.is(getDegradedError(), null, "a clean swap lifts the degraded flag");
});

test("a definitionChanging event suspends the current BuildServer's readers", async (t) => {
	const stack1 = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, definitionWatchers} = createMocks({stacks: [stack1]});
	const {default: Supervisor} = await importSupervisor(mocks);

	await Supervisor.create({}, baseConfig, undefined, graphFactory);

	// Leading edge of a definition-file burst: suspend the current BuildServer's readers so parked
	// requests fail fast instead of hanging out the checkout's source burst.
	definitionWatchers[0].emit("definitionChanging", {eventType: "update", filePath: "/app/ui5.yaml"});

	t.true(stack1.buildServer.suspendReaders.calledOnce, "the current BuildServer's readers are suspended");
	const err = stack1.buildServer.suspendReaders.firstCall.args[0];
	t.is(err?.code, "UI5_DEFINITION_CHANGING", "suspended with a well-formed definition-change error");
	t.is(typeof err?.message, "string");

	// The build loop is stopped on the same leading edge, so the outgoing stack stops aborting and
	// re-arming builds while the new stack is built against the shared cache.
	t.true(stack1.buildServer.suspendBuilds.calledOnce, "the current BuildServer's build loop is stopped");
});

test("definitionChanging suspends the new BuildServer after a swap (re-targeted)", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, definitionWatchers} = createMocks({stacks: [stack1, stack2]});
	const {default: Supervisor} = await importSupervisor(mocks);

	await Supervisor.create({}, baseConfig, undefined, graphFactory);

	// First change drives the swap to stack2.
	definitionWatchers[0].emit("definitionChanged", {eventType: "update", filePath: "/app/ui5.yaml"});
	await new Promise((resolve) => setImmediate(resolve));

	// The re-attached handler on the new watcher must suspend the NEW stack's BuildServer.
	definitionWatchers[1].emit("definitionChanging", {eventType: "update", filePath: "/app/ui5.yaml"});
	t.true(stack2.buildServer.suspendReaders.calledOnce, "the swapped-in BuildServer's readers are suspended");
});

test("a failed swap resumes the surviving BuildServer's readers (degraded gate takes over)", async (t) => {
	const stack1 = createStack();
	let calls = 0;
	const graphFactory = sinon.stub().resolves({});
	const {mocks} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1; // initial build
			}
			throw new Error("invalid ui5.yaml"); // re-init fails -> degraded
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	// A failed swap self-schedules a recovery timer; destroy() clears it synchronously so it does not
	// fire on the shared real clock during other concurrent tests.
	t.teardown(() => supervisor.destroy());
	await supervisor.reinitialize();

	t.true(stack1.buildServer.resumeReaders.called,
		"the surviving BuildServer's readers are resumed once the degraded gate is active");
});

test("a failed swap does not restart the surviving BuildServer's build loop", async (t) => {
	// Stopping the build loop is one-way: unlike the reader suspend (lifted so the degraded stack can
	// serve already-built resources), it must stay engaged so the surviving stack never rebuilds off
	// the wrong branch's sources while degraded. There is no resumeBuilds to call.
	const stack1 = createStack();
	let calls = 0;
	const graphFactory = sinon.stub().resolves({});
	const {mocks, definitionWatchers} = createMocks({
		buildAppImpl: async () => {
			calls++;
			if (calls === 1) {
				return stack1; // initial build
			}
			throw new Error("invalid ui5.yaml"); // re-init fails -> degraded
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	t.teardown(() => supervisor.destroy());

	// Leading edge stops the build loop; the trailing swap then fails and leaves stack1 degraded.
	definitionWatchers[0].emit("definitionChanging", {eventType: "update", filePath: "/app/ui5.yaml"});
	await supervisor.reinitialize();

	t.true(stack1.buildServer.suspendBuilds.calledOnce, "the build loop was stopped on the leading edge");
	t.false("resumeBuilds" in stack1.buildServer,
		"no resumeBuilds counterpart exists; the build loop stays stopped until destroy");
});

test.serial("a persistently failing swap retries fast up to the budget, then keeps slow-polling", async (t) => {
	// Two-phase recovery: a fast burst bounded by RecoveryBudget (5 attempts), then an indefinite slow
	// heartbeat (SLOW_RECOVERY_INTERVAL_MS, 30 s). This test proves the slow phase does not give up.
	const stack1 = createStack();
	let buildCalls = 0;
	const graphFactory = sinon.stub().resolves(createGraph());
	const {mocks, buildApp} = createMocks({
		buildAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			throw new Error("invalid ui5.yaml"); // every re-init fails
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);
	const supervisor = await Supervisor.create(createGraph(), baseConfig, undefined, graphFactory);
	const getDegradedError = buildApp.firstCall.args[3];
	const clock = sinon.useFakeTimers();
	t.teardown(() => {
		clock.restore();
		return supervisor.destroy();
	});

	// First failure flags degraded and schedules the first fast recovery (budget attempt 1).
	await supervisor.reinitialize();
	t.is(buildCalls, 2, "the first reinitialize attempt failed and left the stack degraded");
	t.truthy(getDegradedError(), "degraded after the failed swap");

	// Drive the fast burst: each 550 ms tick fires a recovery that fails and schedules the next, until
	// the budget (5 attempts) is spent. The fifth fast fire finds it exhausted and arms the slow timer.
	for (let i = 0; i < 5; i++) {
		await clock.tickAsync(550);
		await flushMicrotasks();
	}
	t.is(buildCalls, 7, "initial + failed manual reinit + 5 fast budgeted recovery swaps");

	// The fast budget is spent, so no further fast tick fires anything.
	await clock.tickAsync(550);
	t.is(buildCalls, 7, "no fast retry fires once the budget is exhausted");

	// The slow heartbeat keeps re-resolving indefinitely. Assert monotonic growth, not an exact total:
	// the slow timer is not tick-aligned, so a fire can land anywhere within a ticked window.
	const afterFast = buildCalls;
	await clock.tickAsync(30000);
	await flushMicrotasks();
	t.true(buildCalls > afterFast, "the slow phase re-resolves past the fast budget");

	const afterFirstSlow = buildCalls;
	await clock.tickAsync(30000);
	await flushMicrotasks();
	t.true(buildCalls > afterFirstSlow, "the slow phase keeps polling indefinitely");
	t.truthy(getDegradedError(), "the stack stays degraded while the branch is broken");
});

test.serial("the slow recovery poll recovers the server once the branch resolves, then stops polling", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	let buildCalls = 0;
	const graphFactory = sinon.stub().resolves(createGraph());
	const {mocks, buildApp} = createMocks({
		buildAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			if (buildCalls < 8) {
				throw new Error("invalid ui5.yaml"); // manual + 5 fast recoveries fail
			}
			return stack2; // the first slow poll succeeds
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);
	const supervisor = await Supervisor.create(createGraph(), baseConfig, undefined, graphFactory);
	const getDegradedError = buildApp.firstCall.args[3];
	const clock = sinon.useFakeTimers();
	t.teardown(() => {
		clock.restore();
		return supervisor.destroy();
	});

	await drainFastBudget(supervisor, clock);
	t.is(buildCalls, 7, "the fast burst is spent and the stack is still degraded");
	t.truthy(getDegradedError(), "degraded before the branch is fixed");

	// The branch is fixed; the next slow poll re-resolves cleanly and swaps in a healthy stack.
	await clock.tickAsync(30000);
	await flushMicrotasks();
	t.is(buildCalls, 8, "the slow poll built the recovered stack");
	t.is(getDegradedError(), null, "the clean slow-poll swap lifted the degraded flag");

	// HEALTHY re-arms nothing: a further tick drives no more polling.
	await clock.tickAsync(30000);
	await clock.tickAsync(30000);
	await flushMicrotasks();
	t.is(buildCalls, 8, "polling stops once the server is healthy again");
});

test.serial("a definitionChanging clears the slow timer and restores a full fast budget", async (t) => {
	const stack1 = createStack();
	let buildCalls = 0;
	const graphFactory = sinon.stub().resolves(createGraph());
	const {mocks, definitionWatchers} = createMocks({
		buildAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			throw new Error("invalid ui5.yaml"); // every re-init fails
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);
	const supervisor = await Supervisor.create(createGraph(), baseConfig, undefined, graphFactory);
	const clock = sinon.useFakeTimers();
	t.teardown(() => {
		clock.restore();
		return supervisor.destroy();
	});

	// Drain the fast budget into the slow phase.
	await drainFastBudget(supervisor, clock);
	t.is(buildCalls, 7, "the fast budget is spent; the slow timer is armed");

	// A real definition change supersedes the slow poll and restores a full fast allowance.
	definitionWatchers[0].emit("definitionChanging", {eventType: "update", filePath: "/app/ui5.yaml"});

	// The budget was reset, so the next failed swap schedules a fast 550 ms retry, not the slow poll.
	await supervisor.reinitialize();
	t.is(buildCalls, 8, "the post-change swap failed");
	await clock.tickAsync(550);
	await flushMicrotasks();
	t.is(buildCalls, 9, "the restored fast budget schedules a 550 ms retry, not the slow poll");
});

test.serial("destroy() mid-poll clears the recovery timer and adopts nothing", async (t) => {
	const stack1 = createStack();
	let buildCalls = 0;
	const graphFactory = sinon.stub().resolves(createGraph());
	const {mocks} = createMocks({
		buildAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			throw new Error("invalid ui5.yaml"); // the re-init fails -> degraded, timer armed
		}
	});
	const {default: Supervisor} = await importSupervisor(mocks);
	const supervisor = await Supervisor.create(createGraph(), baseConfig, undefined, graphFactory);
	const clock = sinon.useFakeTimers();
	t.teardown(() => clock.restore());

	await supervisor.reinitialize();
	t.is(buildCalls, 2, "a failed swap armed a pending recovery timer");

	// Tearing down mid-poll clears the timer: no scheduled recovery fires afterwards.
	await supervisor.destroy();
	await clock.tickAsync(550);
	await clock.tickAsync(30000);
	t.is(buildCalls, 2, "no recovery swap runs after destroy()");
});

test.serial("degraded recovery re-resolves and settles until the root set converges", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	let buildCalls = 0;
	const initialGraph = createGraph(["/app"]);
	// The recovery convergence loop resolves, settles, re-resolves, and swaps once two consecutive
	// resolves agree on the project-root set. Here both recovery resolves see the same root set, so it
	// converges after the second resolve.
	const recoveryGraph = createGraph(["/app"]);
	const graphFactory = sinon.stub();
	graphFactory.onFirstCall().resolves(initialGraph); // failed reinit
	graphFactory.onSecondCall().resolves(recoveryGraph); // first recovery resolve
	graphFactory.onThirdCall().resolves(recoveryGraph); // second resolve agrees -> converged
	let releaseQuiet;
	const quiet = new Promise((resolve) => {
		releaseQuiet = resolve;
	});
	const {mocks, ProjectDefinitionWatcher, waitForProjectGraphSettled} = createMocks({
		buildAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			if (buildCalls === 2) {
				throw new Error("invalid ui5.yaml");
			}
			return stack2;
		}
	});
	waitForProjectGraphSettled.callsFake(() => quiet);
	const {default: Supervisor} = await importSupervisor(mocks);
	const supervisor = await Supervisor.create(initialGraph, baseConfig, undefined, graphFactory);

	await supervisor.reinitialize();
	t.is(buildCalls, 2, "the first reinitialize attempt failed and left the stack degraded");
	t.is(graphFactory.callCount, 1, "the failed attempt resolved the graph once");

	const recovery = supervisor.reinitialize();
	await waitFor(() => waitForProjectGraphSettled.called);
	t.is(graphFactory.callCount, 2, "recovery resolves a candidate graph immediately");
	t.deepEqual(waitForProjectGraphSettled.firstCall.args[0], [recoveryGraph, initialGraph],
		"the just-resolved candidate and the previous last-good graph are observed for quietness");
	t.like(waitForProjectGraphSettled.firstCall.args[1], {settleMs: 550});
	t.is(buildCalls, 2, "no replacement stack is built before the candidate graph settles");

	releaseQuiet();
	await recovery;
	t.is(graphFactory.callCount, 3, "the graph is re-resolved after the quiet window to check convergence");
	t.is(buildCalls, 3, "the healthy replacement stack is built once the root set converged");
	t.is(ProjectDefinitionWatcher.create.secondCall.args[0].graph, recoveryGraph,
		"the definition watcher is re-targeted to the converged graph");
});

test.serial("degraded recovery observes a target-only root across convergence iterations", async (t) => {
	// The recovery gap this closes: a project introduced only by the target branch is unknown to both
	// the previous last-good graph and the first candidate resolve. It surfaces on the second resolve
	// once its package.json has landed; the loop must then observe it for quietness before swapping.
	const stack1 = createStack();
	const stack2 = createStack();
	let buildCalls = 0;
	const initialGraph = createGraph(["/repo/app"]);
	const earlyGraph = createGraph(["/repo/app"]); // first recovery resolve: target-only dep not yet seen
	const targetGraph = createGraph(["/repo/app", "/repo/node_modules/@scope/new"]); // dep now present
	const graphFactory = sinon.stub();
	graphFactory.onFirstCall().resolves(initialGraph); // failed reinit
	graphFactory.onSecondCall().resolves(earlyGraph); // iteration 1: {app}
	graphFactory.onThirdCall().resolves(targetGraph); // iteration 2: {app, newDep} (grew -> settle again)
	graphFactory.onCall(3).resolves(targetGraph); // iteration 3: same set -> converged
	const quietCalls = [];
	const {mocks, waitForProjectGraphSettled} = createMocks({
		buildAppImpl: async () => {
			buildCalls++;
			if (buildCalls === 1) {
				return stack1; // initial build
			}
			if (buildCalls === 2) {
				throw new Error("invalid ui5.yaml");
			}
			return stack2;
		}
	});
	// Record each settle's observed graphs and resolve immediately so the loop advances on microtasks.
	waitForProjectGraphSettled.callsFake(async (graphs) => {
		quietCalls.push(graphs);
	});
	const {default: Supervisor} = await importSupervisor(mocks);
	const supervisor = await Supervisor.create(initialGraph, baseConfig, undefined, graphFactory);

	await supervisor.reinitialize();
	t.is(buildCalls, 2, "the first reinitialize attempt failed and left the stack degraded");

	await supervisor.reinitialize();

	// Iteration 1 settled on {app}; iteration 2 saw the target-only root appear and settled again with
	// it included; iteration 3 resolved the same set and converged without a further settle.
	t.is(quietCalls.length, 2, "the loop settled once per growing root set, then converged");
	const secondObserved = quietCalls[1].map((g) => g.rootPaths);
	t.true(
		secondObserved.some((roots) => roots.includes("/repo/node_modules/@scope/new")),
		"the target-only dependency root is observed for quietness once it surfaces in a resolve");
	t.is(buildCalls, 3, "the converged graph (with the target-only root) is built and swapped in");
	t.is(graphFactory.callCount, 4, "one failed resolve plus three convergence resolves");
});

test("a successful swap resumes the old BuildServer's readers before destroying it", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks} = createMocks({stacks: [stack1, stack2]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	await supervisor.reinitialize();

	t.true(stack1.buildServer.resumeReaders.calledOnce, "old BuildServer's readers are resumed");
	t.true(stack1.buildServer.resumeReaders.calledBefore(stack1.buildServer.destroy),
		"resume happens before destroy");
});

test("watcher is re-targeted to the new graph after a swap (old destroyed, new created)", async (t) => {
	const stack1 = createStack();
	const stack2 = createStack();
	const newGraph = {name: "newGraph", getRoot: () => ({})};
	const graphFactory = sinon.stub().resolves(newGraph);
	const {mocks, ProjectDefinitionWatcher, definitionWatchers} = createMocks({stacks: [stack1, stack2]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);
	t.is(ProjectDefinitionWatcher.create.callCount, 1, "watcher created on init");
	const firstWatcher = definitionWatchers[0];

	await supervisor.reinitialize();

	t.is(ProjectDefinitionWatcher.create.callCount, 2, "a fresh watcher created after the swap");
	t.is(ProjectDefinitionWatcher.create.secondCall.args[0].graph, newGraph, "new watcher targets the new graph");
	t.true(firstWatcher.destroy.calledOnce, "old watcher destroyed");
});

test("a watcher-create failure during swap keeps the server serving", async (t) => {
	const app1 = sinon.stub();
	const stack1 = createStack(app1);
	const stack2 = createStack();
	const graphFactory = sinon.stub().resolves({getRoot: () => ({})});
	let createCalls = 0;
	const {mocks, createdHandlers} = createMocks({
		stacks: [stack1, stack2],
		definitionWatcherCreate: async () => {
			createCalls++;
			if (createCalls === 1) {
				const watcher = new EventEmitter();
				watcher.destroy = sinon.stub().resolves();
				return watcher;
			}
			throw new Error("watcher failed to arm");
		},
	});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);

	await t.notThrowsAsync(supervisor.reinitialize(), "a watcher-create failure does not reject the swap");

	// The swap itself still committed: the new stack is serving.
	createdHandlers[0]("req", "res");
	t.true(stack2.app.calledOnceWithExactly("req", "res"), "the new app serves despite the watcher failure");
});

test("destroy() tears the definition watcher down", async (t) => {
	const stack = createStack();
	const graphFactory = sinon.stub().resolves({});
	const {mocks, definitionWatchers} = createMocks({stacks: [stack]});
	const {default: Supervisor} = await importSupervisor(mocks);

	const supervisor = await Supervisor.create({}, baseConfig, undefined, graphFactory);

	await new Promise((resolve) => supervisor.destroy(resolve));
	t.true(definitionWatchers[0].destroy.calledOnce, "watcher destroyed on teardown");
});
