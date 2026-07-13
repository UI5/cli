import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

// Note: These tests are focused on the debounce behavior of the `sourcesChanged` event.
// The general BuildServer functionality is tested by the integration test at ./BuildServer.integration.js

// Drain microtasks (zero-ticks) until `predicate` is true for some entry in
// `statusEvents`. Use in place of an arbitrary number of `await clock.tickAsync(0)`
// calls when waiting for an async chain to settle — the number of microtask hops
// is an implementation detail that shifts every time a new `await` is added to
// `#runBackgroundValidation` or its finally clause.
async function drainUntil(clock, statusEvents, predicate, {maxTicks = 100} = {}) {
	for (let i = 0; i < maxTicks; i++) {
		if (statusEvents.some(predicate)) return;
		await clock.tickAsync(0);
	}
	throw new Error(`drainUntil: predicate not satisfied after ${maxTicks} ticks; ` +
		`events: ${statusEvents.map((e) => e.status).join(", ")}`);
}

// Graph with a single library dependency behind the root project. Used by the
// BUILDING → VALIDATING → … tests to leave one INITIAL project after the build
// cycle, which is the trigger for the post-build validation pass.
function makeGraphWithLib() {
	const rootProject = {getName: () => "root.project"};
	const libProject = {getName: () => "library.x"};
	const graph = {
		getRoot: () => rootProject,
		getProjects: () => [rootProject, libProject],
		getTransitiveDependencies: () => ["library.x"],
		getProject: (name) => name === "root.project" ? rootProject : libProject,
		traverseDependents: function* () {
			yield {project: rootProject};
			yield {project: libProject};
		},
	};
	return {rootProject, libProject, graph};
}

// Attach a `ui5.serve-status` listener to the current process, register a
// teardown to detach it, and return the accumulating event array. Every
// serve-status test needs exactly this shape.
function makeStatusRecorder(t) {
	const statusEvents = [];
	const statusHandler = (evt) => statusEvents.push(evt);
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));
	return statusEvents;
}

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.clock = sinon.useFakeTimers();

	// Minimal graph stub: a single root project with no dependencies.
	const rootProject = {
		getName: () => "root.project",
	};
	t.context.rootProject = rootProject;
	t.context.graph = {
		getRoot: () => rootProject,
		getProjects: () => [rootProject],
		getTransitiveDependencies: () => [],
		getProject: (name) => name === "root.project" ? rootProject : undefined,
		// The debounce path traverses dependents to invalidate them. With no dependents
		// the iterator only yields the source project itself.
		traverseDependents: function* (_projectName) {
			yield {project: rootProject};
		},
	};
	t.context.projectBuilder = {
		closeCacheManager: sinon.stub(),
		resourcesChanged: sinon.stub(),
		validateCaches: sinon.stub().resolves([]),
	};

	// on()/watch() are stubbed to swallow BuildServer#initWatcher's wiring calls; the tests
	// don't assert against them. Only destroy() is exercised (via BuildServer#destroy).
	class FakeWatchHandler {
		constructor() {
			this.destroy = sinon.stub().resolves();
			this.on = sinon.stub();
			this.watch = sinon.stub().resolves();
		}
	}

	const BuildServer = (await esmock("../../../lib/build/BuildServer.js", {
		// BuildReader is constructed in the BuildServer constructor but not exercised here.
		"../../../lib/build/BuildReader.js": class BuildReader {},
		"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
	})).default;
	t.context.BuildServer = BuildServer;
	t.context.SOURCES_CHANGED_SETTLE_MS = BuildServer.__internals__.SOURCES_CHANGED_SETTLE_MS;
	// Use the static factory so #watchHandler is initialized — needed for destroy() in some tests.
	t.context.buildServer = await BuildServer.create(
		t.context.graph, t.context.projectBuilder, false, [], []);
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("sourcesChanged: emitted immediately for a single change (leading edge)", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_SETTLE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/foo.js", false);

	t.is(listener.callCount, 1, "Leading edge: emitted immediately on the first change");

	// A lone change owes no trailing emit — the settle window elapses silently.
	clock.tick(SOURCES_CHANGED_SETTLE_MS);
	t.is(listener.callCount, 1, "No trailing emit for a single change");
});

test.serial("sourcesChanged: burst collapses to one leading + one trailing emit", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_SETTLE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	// 5 rapid changes, each well within the settle window.
	for (let i = 0; i < 5; i++) {
		buildServer._projectResourceChanged(rootProject, `/foo${i}.js`, false);
		clock.tick(10);
	}

	t.is(listener.callCount, 1, "Leading edge fired once; the rest of the burst is suppressed");

	// Advance past the settle window from the last change → single trailing emit.
	clock.tick(SOURCES_CHANGED_SETTLE_MS);
	t.is(listener.callCount, 2, "Burst collapsed to one leading + one trailing emit");
});

test.serial("sourcesChanged: each change resets the trailing settle timer", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_SETTLE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/a.js", false);
	t.is(listener.callCount, 1, "Leading edge emitted on the first change");

	clock.tick(SOURCES_CHANGED_SETTLE_MS - 10);
	// Second change just before the trailing timer would fire — must reset it.
	buildServer._projectResourceChanged(rootProject, "/b.js", false);
	clock.tick(SOURCES_CHANGED_SETTLE_MS - 10);
	t.is(listener.callCount, 1,
		"Second change reset the trailing timer; no trailing emit yet despite > settle window elapsed");

	clock.tick(10);
	t.is(listener.callCount, 2, "Trailing emit fires once the reset window elapses");
});

test.serial("sourcesChanged: a change after the window settles fires a fresh leading edge", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_SETTLE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/a.js", false);
	t.is(listener.callCount, 1, "First leading edge");
	// Let the window elapse with no further change — no trailing emit is owed.
	clock.tick(SOURCES_CHANGED_SETTLE_MS);
	t.is(listener.callCount, 1, "No trailing emit for the lone first change");

	// A change after the window closed starts a fresh leading edge.
	buildServer._projectResourceChanged(rootProject, "/b.js", false);
	t.is(listener.callCount, 2, "Second window fires its own leading edge immediately");
	clock.tick(SOURCES_CHANGED_SETTLE_MS);
	t.is(listener.callCount, 2, "Still lone — no trailing emit");
});

test.serial("sourcesChanged: destroy cancels a pending trailing emit", async (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_SETTLE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	// Two changes: leading edge fires, and a second within the window owes a trailing emit.
	buildServer._projectResourceChanged(rootProject, "/a.js", false);
	buildServer._projectResourceChanged(rootProject, "/b.js", false);
	t.is(listener.callCount, 1, "Pre-destroy: only the leading edge has fired");

	await buildServer.destroy();

	clock.tick(SOURCES_CHANGED_SETTLE_MS * 5);
	t.is(listener.callCount, 1, "Pending trailing sourcesChanged emit was cancelled by destroy()");
});

test.serial("serve-status: serve-ready emitted when no initial build is requested", async (t) => {
	const {BuildServer, graph, projectBuilder, sinon} = t.context;
	const statusHandler = sinon.stub();
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));

	await BuildServer.create(graph, projectBuilder, false, [], []);
	const readyCalls = statusHandler.getCalls()
		.filter((c) => c.args[0]?.status === "serve-ready");
	t.is(readyCalls.length, 1, "serve-ready emitted once when no initial build is enqueued");
});

test.serial("serve-status: serve-stale emitted on sources change", (t) => {
	const {buildServer, rootProject, clock, sinon, SOURCES_CHANGED_SETTLE_MS} = t.context;
	const statusHandler = sinon.stub();
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));

	buildServer._projectResourceChanged(rootProject, "/foo.js", false);
	clock.tick(SOURCES_CHANGED_SETTLE_MS);

	const staleCalls = statusHandler.getCalls()
		.filter((c) => c.args[0]?.status === "serve-stale");
	t.is(staleCalls.length, 1, "serve-stale emitted exactly once for one window");
	t.deepEqual(staleCalls[0].args[0], {
		level: "info",
		status: "serve-stale",
		changedProjects: ["root.project"],
	}, "serve-stale event has expected payload");
});

// Helper: drive a full build cycle through the 10ms request-queue debounce.
// Returns the recorded serve-status events so each test can assert on the
// exact ordering and counts.
async function runInitialBuildCycle(t, {buildResult = "ok"} = {}) {
	const {BuildServer, graph, projectBuilder, sinon, clock} = t.context;
	const statusEvents = makeStatusRecorder(t);

	let buildResolve;
	let buildReject;
	projectBuilder.build = sinon.stub().callsFake((_opts, perProjectCb) => {
		t.context.lastPerProjectCb = perProjectCb;
		return new Promise((resolve, reject) => {
			buildResolve = (built) => {
				// Drive the per-project callback for the root project, mimicking
				// the real ProjectBuilder which calls back as each project finishes.
				perProjectCb("root.project", {
					getReader: () => ({fakeReader: true}),
				});
				resolve(built ?? ["root.project"]);
			};
			buildReject = (err) => reject(err);
		});
	});

	const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
	t.context.buildServer = buildServer;

	// Trigger the 10ms request-queue tick → projectBuilder.build is invoked.
	await clock.tickAsync(10);
	t.true(projectBuilder.build.called, "projectBuilder.build invoked after request-queue tick");

	if (buildResult === "ok") {
		buildResolve();
	} else if (buildResult === "error") {
		buildReject(buildResult.error || new Error("Build failed"));
	}
	// Drain microtasks so the build promise's .then/.catch handlers run.
	await clock.tickAsync(0);
	return {statusEvents, buildResolve, buildReject};
}

test.serial("serve-status: initial build cycle emits building → buildDone → ready in order", async (t) => {
	const {statusEvents} = await runInitialBuildCycle(t);
	const seq = statusEvents.map((e) => e.status);
	const idxBuilding = seq.indexOf("serve-building");
	const idxBuildDone = seq.indexOf("serve-build-done");
	const idxReady = seq.indexOf("serve-ready");
	t.true(idxBuilding >= 0 && idxBuildDone > idxBuilding && idxReady > idxBuildDone,
		`Expected building → buildDone → ready, got: ${seq.join(", ")}`);
	t.false(seq.slice(idxBuilding, idxReady + 1).includes("serve-stale"),
		"no intermediate stale emission during the cycle");
});

test.serial(
	"serve-status: source change mid-build emits settling at cycle end (not stale)", async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const statusEvents = makeStatusRecorder(t);

		let buildResolve;
		let perProjectCb;
		projectBuilder.build = sinon.stub().callsFake((_opts, cb) => {
			perProjectCb = cb;
			return new Promise((resolve) => {
				buildResolve = () => resolve(["root.project"]);
			});
		});

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());
		await clock.tickAsync(10);
		t.true(projectBuilder.build.called, "build started");

		// Mid-build source change: invalidates the root project and aborts the cycle.
		buildServer._projectResourceChanged(rootProject, "/x.js", false);
		// The per-project callback is invoked *despite* the invalidation, but
		// ProjectBuildStatus#setReader is now a no-op while INVALIDATED so the
		// project stays stale.
		perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
		buildResolve();
		await clock.tickAsync(0);

		const seq = statusEvents.map((e) => e.status);
		// The aborted cycle defers its restart, so the end-of-cycle state is SETTLING
		// (rebuild pending, held until changes quiesce) rather than STALE. No buildDone
		// is emitted on BUILDING → SETTLING — no successful cycle closed.
		const settlingCalls = seq.filter((s) => s === "serve-settling");
		t.is(settlingCalls.length, 1,
			`Expected exactly one settling emission at cycle end, got sequence: ${seq.join(", ")}`);
		t.false(seq.includes("serve-stale"),
			`No stale emission on the aborted cycle; got: ${seq.join(", ")}`);
		t.false(seq.includes("serve-build-done"),
			`No buildDone on BUILDING → SETTLING; got: ${seq.join(", ")}`);
		t.is(seq[seq.length - 1], "serve-settling",
			`SETTLING is the terminal state of the deferred cycle; got: ${seq.join(", ")}`);
	});

test.serial(
	"abort-restart: a source-change-aborted build waits out the settle window before restarting",
	async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const {ABORTED_BUILD_RESTART_SETTLE_MS, BUILD_REQUEST_DEBOUNCE_MS} =
			BuildServer.__internals__;
		const statusEvents = makeStatusRecorder(t);

		// Each build() invocation parks a resolver. Settling checks the abort signal and, when
		// aborted, rejects with an AbortError — mirroring the real ProjectBuilder so BuildServer
		// takes its abort re-queue path (which is what schedules the deferred restart).
		const resolvers = [];
		projectBuilder.build = sinon.stub().callsFake((opts, cb) => new Promise((resolve, reject) => {
			resolvers.push(() => {
				if (opts.signal?.aborted) {
					const err = new Error("Build aborted");
					err.name = "AbortError";
					reject(err);
					return;
				}
				cb("root.project", {getReader: () => ({fakeReader: true})});
				resolve(["root.project"]);
			});
		}));

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.context.buildServer = buildServer;
		await clock.tickAsync(BUILD_REQUEST_DEBOUNCE_MS);
		t.is(projectBuilder.build.callCount, 1, "initial build started");

		// Mid-build source change aborts the running build, then let it settle.
		buildServer._projectResourceChanged(rootProject, "/a.js", false);
		resolvers[0]();
		await clock.tickAsync(0);
		t.is(projectBuilder.build.callCount, 1, "no restart yet — the settle window is open");
		// The deferred restart reports SETTLING, not a stale/building banner.
		t.is(statusEvents[statusEvents.length - 1].status, "serve-settling",
			"state is settling while the restart is deferred");

		// Well within the settle window: still no restart.
		await clock.tickAsync(ABORTED_BUILD_RESTART_SETTLE_MS - 50);
		t.is(projectBuilder.build.callCount, 1, "restart still held mid-window");

		// A further change resets the window — the restart must not fire at the original deadline.
		buildServer._projectResourceChanged(rootProject, "/b.js", false);
		await clock.tickAsync(ABORTED_BUILD_RESTART_SETTLE_MS - 50);
		t.is(projectBuilder.build.callCount, 1, "second change reset the window; still no restart");

		// Past the reset window: exactly one restart for the whole burst.
		await clock.tickAsync(50);
		t.is(projectBuilder.build.callCount, 2, "burst collapsed to a single restarted build");
		t.is(statusEvents[statusEvents.length - 1].status, "serve-building",
			"SETTLING → BUILDING once the window closes and the restart fires");

		// Settle the restarted build so no promise is left dangling.
		resolvers[1]?.();
		await clock.tickAsync(0);
	});

test.serial(
	"serve-status: transient failure during a change burst reports settling, not error", async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const {ABORTED_BUILD_RESTART_SETTLE_MS, BUILD_REQUEST_DEBOUNCE_MS} =
			BuildServer.__internals__;
		const statusEvents = makeStatusRecorder(t);

		// The first build throws a plain error *while a source change is still queued* — the
		// "half-written tree during git checkout" shape. The retry (second invocation) succeeds.
		const resolvers = [];
		projectBuilder.build = sinon.stub().callsFake((_opts, cb) => new Promise((resolve, reject) => {
			resolvers.push({resolve, reject, cb});
		}));

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.context.buildServer = buildServer;
		await clock.tickAsync(BUILD_REQUEST_DEBOUNCE_MS);
		t.is(projectBuilder.build.callCount, 1, "initial build started");

		// A source change lands (queued, not yet flushed), then the build throws. Because
		// #resourceChangeQueue is non-empty, the failure is treated as transient: re-queue and
		// defer the retry, reporting SETTLING rather than ERROR.
		buildServer._projectResourceChanged(rootProject, "/a.js", false);
		resolvers[0].reject(new Error("ENOENT: half-written tree"));
		await clock.tickAsync(0);

		const midSeq = statusEvents.map((e) => e.status);
		t.false(midSeq.includes("serve-error"),
			`Transient failure must not surface serve-error; got: ${midSeq.join(", ")}`);
		t.is(statusEvents[statusEvents.length - 1].status, "serve-settling",
			`Transient failure reports settling; got: ${midSeq.join(", ")}`);
		t.is(projectBuilder.build.callCount, 1, "retry held until the settle window elapses");

		// Once quiet, a single rebuild fires and succeeds.
		await clock.tickAsync(ABORTED_BUILD_RESTART_SETTLE_MS);
		t.is(projectBuilder.build.callCount, 2, "single deferred rebuild after the tree settled");
		resolvers[1].cb("root.project", {getReader: () => ({fakeReader: true})});
		resolvers[1].resolve(["root.project"]);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-ready");

		const seq = statusEvents.map((e) => e.status);
		t.false(seq.includes("serve-error"),
			`No serve-error anywhere in the transient-failure cycle; got: ${seq.join(", ")}`);
	});

test.serial(
	"serve-status: genuine build failure (no pending changes) still errors", async (t) => {
		const {BuildServer, graph, projectBuilder, sinon, clock} = t.context;
		const {BUILD_REQUEST_DEBOUNCE_MS} = BuildServer.__internals__;
		const statusEvents = makeStatusRecorder(t);

		// Build fails with no queued source change and no aborted signal — the genuine-error
		// branch. Regression guard for the Step 4 `signal.aborted || #resourceChangeQueue.size > 0`
		// predicate: this must land on ERROR, not SETTLING.
		const buildError = new Error("Build blew up");
		projectBuilder.build = sinon.stub().rejects(buildError);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.context.buildServer = buildServer;
		buildServer.on("error", () => {});

		await clock.tickAsync(BUILD_REQUEST_DEBOUNCE_MS);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");

		const seq = statusEvents.map((e) => e.status);
		t.true(seq.includes("serve-error"), `Genuine failure surfaces serve-error; got: ${seq.join(", ")}`);
		t.false(seq.includes("serve-settling"),
			`Genuine failure must not report settling; got: ${seq.join(", ")}`);
		t.is(seq[seq.length - 1], "serve-error", "serve-error is the terminal state of a genuine failure");
	});

test.serial(
	"serve-status: a pending build re-times to the first-build window on a source change", async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const {FIRST_BUILD_SETTLE_MS, BUILD_REQUEST_DEBOUNCE_MS} = BuildServer.__internals__;
		const statusEvents = makeStatusRecorder(t);

		const resolvers = [];
		projectBuilder.build = sinon.stub().callsFake((_opts, cb) => new Promise((resolve) => {
			resolvers.push({resolve, cb});
		}));

		// No initial build: the server starts IDLE. Capture the interface so we can enqueue a
		// reader-request-driven build (which is what makes a build "pending" without an active one).
		let capturedInterface;
		class CapturingBuildReader {
			constructor(_name, _projects, buildServerInterface) {
				capturedInterface = buildServerInterface;
			}
		}
		class FakeWatchHandler {
			constructor() {
				this.destroy = sinon.stub().resolves();
				this.on = sinon.stub();
				this.watch = sinon.stub().resolves();
			}
		}
		const CapturingBuildServer = (await esmock("../../../lib/build/BuildServer.js", {
			"../../../lib/build/BuildReader.js": CapturingBuildReader,
			"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
		})).default;
		const buildServer = await CapturingBuildServer.create(graph, projectBuilder, false, [], []);
		t.teardown(() => buildServer.destroy());

		// A reader request enqueues a build on the snappy debounce (10 ms) but doesn't fire yet.
		const readerPromise = capturedInterface.getReaderForProject("root.project");
		readerPromise.catch(() => {});

		// Before the debounce elapses, a source change lands. The pending (not-yet-started) build
		// is re-timed to the 100 ms first-build window and the banner reports SETTLING.
		buildServer._projectResourceChanged(rootProject, "/a.js", false);
		t.is(statusEvents[statusEvents.length - 1].status, "serve-settling",
			"source change on a pending build reports settling");

		// The old 10 ms debounce must NOT fire the build — the window was pushed out to 100 ms.
		await clock.tickAsync(BUILD_REQUEST_DEBOUNCE_MS);
		t.is(projectBuilder.build.callCount, 0, "build held past the snappy debounce by the 100 ms window");

		await clock.tickAsync(FIRST_BUILD_SETTLE_MS - BUILD_REQUEST_DEBOUNCE_MS);
		t.is(projectBuilder.build.callCount, 1, "build fires once the 100 ms first-build window elapses");

		resolvers[0].cb("root.project", {getReader: () => ({fakeReader: true})});
		resolvers[0].resolve(["root.project"]);
		await readerPromise;
	});

test.serial(
	"serve-status: a reader request supersedes the first-build settle window", async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const {FIRST_BUILD_SETTLE_MS, BUILD_REQUEST_DEBOUNCE_MS} = BuildServer.__internals__;
		makeStatusRecorder(t);

		const resolvers = [];
		projectBuilder.build = sinon.stub().callsFake((_opts, cb) => new Promise((resolve) => {
			resolvers.push({resolve, cb});
		}));

		let capturedInterface;
		class CapturingBuildReader {
			constructor(_name, _projects, buildServerInterface) {
				capturedInterface = buildServerInterface;
			}
		}
		class FakeWatchHandler {
			constructor() {
				this.destroy = sinon.stub().resolves();
				this.on = sinon.stub();
				this.watch = sinon.stub().resolves();
			}
		}
		const CapturingBuildServer = (await esmock("../../../lib/build/BuildServer.js", {
			"../../../lib/build/BuildReader.js": CapturingBuildReader,
			"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
		})).default;
		const buildServer = await CapturingBuildServer.create(graph, projectBuilder, false, [], []);
		t.teardown(() => buildServer.destroy());

		// Enqueue a build, then re-time it to the 100 ms window via a source change.
		const firstReq = capturedInterface.getReaderForProject("root.project");
		firstReq.catch(() => {});
		buildServer._projectResourceChanged(rootProject, "/a.js", false);

		// A fresh reader request must pull the build forward to the snappy debounce, superseding
		// the 100 ms window.
		const secondReq = capturedInterface.getReaderForProject("root.project");
		secondReq.catch(() => {});
		await clock.tickAsync(BUILD_REQUEST_DEBOUNCE_MS);
		t.is(projectBuilder.build.callCount, 1,
			"reader request superseded the 100 ms window; build ran at the snappy debounce");

		// (Sanity) the 100 ms window would not have fired the build this early on its own.
		t.true(BUILD_REQUEST_DEBOUNCE_MS < FIRST_BUILD_SETTLE_MS);

		resolvers[0].cb("root.project", {getReader: () => ({fakeReader: true})});
		resolvers[0].resolve(["root.project"]);
		await Promise.all([firstReq, secondReq]);
	});

test.serial(
	"serve-status: the first-build window resets on each further source change", async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const {FIRST_BUILD_SETTLE_MS} = BuildServer.__internals__;
		makeStatusRecorder(t);

		const resolvers = [];
		projectBuilder.build = sinon.stub().callsFake((_opts, cb) => new Promise((resolve) => {
			resolvers.push({resolve, cb});
		}));

		let capturedInterface;
		class CapturingBuildReader {
			constructor(_name, _projects, buildServerInterface) {
				capturedInterface = buildServerInterface;
			}
		}
		class FakeWatchHandler {
			constructor() {
				this.destroy = sinon.stub().resolves();
				this.on = sinon.stub();
				this.watch = sinon.stub().resolves();
			}
		}
		const CapturingBuildServer = (await esmock("../../../lib/build/BuildServer.js", {
			"../../../lib/build/BuildReader.js": CapturingBuildReader,
			"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
		})).default;
		const buildServer = await CapturingBuildServer.create(graph, projectBuilder, false, [], []);
		t.teardown(() => buildServer.destroy());

		const readerPromise = capturedInterface.getReaderForProject("root.project");
		readerPromise.catch(() => {});
		buildServer._projectResourceChanged(rootProject, "/a.js", false);

		// Just short of the window, a further change resets it.
		await clock.tickAsync(FIRST_BUILD_SETTLE_MS - 10);
		buildServer._projectResourceChanged(rootProject, "/b.js", false);
		await clock.tickAsync(FIRST_BUILD_SETTLE_MS - 10);
		t.is(projectBuilder.build.callCount, 0, "second change reset the window; still no build");

		await clock.tickAsync(10);
		t.is(projectBuilder.build.callCount, 1, "build fires once after the final quiet period");

		resolvers[0].cb("root.project", {getReader: () => ({fakeReader: true})});
		resolvers[0].resolve(["root.project"]);
		await readerPromise;
	});

test.serial("serve-status: build failure emits serveError and no orphan building", async (t) => {
	const {BuildServer, graph, projectBuilder, sinon, clock} = t.context;
	const statusEvents = makeStatusRecorder(t);

	const buildError = new Error("Build blew up");
	projectBuilder.build = sinon.stub().rejects(buildError);

	const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
	// Swallow the emitted error event so AVA doesn't see an unhandled rejection.
	buildServer.on("error", () => {});

	await clock.tickAsync(10);
	// Drain enough microtasks for the catch handler to settle.
	await clock.tickAsync(0);
	await clock.tickAsync(0);

	const seq = statusEvents.map((e) => e.status);
	t.true(seq.includes("serve-building"), "building was emitted at cycle start");
	t.true(seq.includes("serve-error"), "serve-error was emitted on failure");
	// On BUILDING → ERROR we deliberately skip buildDone (see #setState).
	t.false(seq.includes("serve-build-done"), "no orphan buildDone after a failed cycle");
	// And no extra building emission after the failure.
	const lastBuildingIdx = seq.lastIndexOf("serve-building");
	const errorIdx = seq.indexOf("serve-error");
	t.true(errorIdx > lastBuildingIdx, "serve-error follows serve-building");
	// The error must remain the terminal state of the cycle — no serve-stale or
	// serve-ready may follow it, as that would clear the red banner while the
	// project is still gated on its captured error.
	t.is(seq[seq.length - 1], "serve-error", "serve-error is the final status of a failed cycle");
});

// When a build cycle drains with INITIAL-state dependencies left over, the server
// must transition BUILDING → VALIDATING (not STALE), then VALIDATING → IDLE
// once the background validation pass confirms every cache is fresh.
test.serial(
	"serve-status: BUILDING → VALIDATING → IDLE when dependencies validate clean", async (t) => {
		const {BuildServer, sinon, clock} = t.context;

		// Augment the graph with a single library dependency so the build cycle leaves
		// one INITIAL project behind, which is exactly the trigger for VALIDATING.
		const {graph} = makeGraphWithLib();

		// validateCaches: report library.x's cache as fresh — usesCache=true triggers the
		// promote-to-FRESH path that closes out the validation pass with no stale projects.
		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().callsFake(async ({willValidate}, callback) => {
				willValidate?.("library.x");
				await callback("library.x", {
					getReader: () => ({fakeReader: true}),
				}, {}, true);
			}),
			build: sinon.stub().callsFake((_opts, perProjectCb) => {
				perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
				return Promise.resolve(["root.project"]);
			}),
		};

		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());

		// Drain the 10ms request-queue tick → build → validation pass.
		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-ready");

		const seq = statusEvents.map((e) => e.status);
		const idxBuilding = seq.indexOf("serve-building");
		const idxBuildDone = seq.indexOf("serve-build-done");
		const idxValidating = seq.indexOf("serve-validating");
		const idxReady = seq.indexOf("serve-ready");

		t.true(idxBuilding >= 0 && idxBuildDone > idxBuilding &&
			idxValidating > idxBuildDone && idxReady > idxValidating,
		`Expected building → buildDone → validating → ready, got: ${seq.join(", ")}`);

		const validatingEvt = statusEvents[idxValidating];
		t.deepEqual(validatingEvt.validatingProjects, ["library.x"],
			"validating event carries the project being validated");

		// No STALE in between — VALIDATING is the post-build state when caches can still be fresh.
		t.false(seq.slice(idxBuildDone, idxReady).includes("serve-stale"),
			`No stale emission between buildDone and ready; got: ${seq.join(", ")}`);
	});

// When background validation finds a stale cache (usesCache=false), the project stays
// INITIAL and the validation pass must end on STALE, not IDLE.
test.serial(
	"serve-status: VALIDATING → STALE when validation finds a stale cache", async (t) => {
		const {BuildServer, sinon, clock} = t.context;

		const {graph} = makeGraphWithLib();

		// usesCache=false → project must stay INITIAL → final state is STALE.
		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().callsFake(async ({willValidate}, callback) => {
				willValidate?.("library.x");
				await callback("library.x", {
					getReader: () => ({fakeReader: true}),
				}, {}, false);
			}),
			build: sinon.stub().callsFake((_opts, perProjectCb) => {
				perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
				return Promise.resolve(["root.project"]);
			}),
		};

		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());

		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-stale");

		const seq = statusEvents.map((e) => e.status);
		t.true(seq.includes("serve-validating"), `validating emitted; got: ${seq.join(", ")}`);
		t.true(seq.indexOf("serve-stale") > seq.indexOf("serve-validating"),
			`stale follows validating; got: ${seq.join(", ")}`);
		t.false(seq.includes("serve-ready"),
			`No ready when validation found stale cache; got: ${seq.join(", ")}`);
	});

// When validateCaches itself rejects with a non-abort error, the failure must be
// observable: BuildServer emits "error", transitions to SERVER_STATES.ERROR (→
// serve-error on the status feed), and skips the post-validation IDLE/STALE
// transition so the server doesn't silently look "ready" after a failed pass.
test.serial(
	"serve-status: validation failure emits serve-error and skips IDLE/STALE", async (t) => {
		const {BuildServer, sinon, clock} = t.context;

		const rootProject = {getName: () => "root.project"};
		const libProject = {getName: () => "library.x"};
		const graph = {
			getRoot: () => rootProject,
			getProjects: () => [rootProject, libProject],
			getTransitiveDependencies: () => ["library.x"],
			getProject: (name) => name === "root.project" ? rootProject : libProject,
			traverseDependents: function* () {
				yield {project: rootProject};
				yield {project: libProject};
			},
		};

		const validationError = new Error("validateCaches blew up");
		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().rejects(validationError),
			build: sinon.stub().callsFake((_opts, perProjectCb) => {
				perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
				return Promise.resolve(["root.project"]);
			}),
		};
		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());

		const errorEvents = [];
		buildServer.on("error", (err) => errorEvents.push(err));

		await clock.tickAsync(10);
		// Drain microtasks until the validation promise chain
		// (catch → setState → finally → terminal catch) has settled.
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");

		t.is(errorEvents.length, 1, "BuildServer emitted exactly one error event");
		t.is(errorEvents[0], validationError, "Emitted error is the original rejection");

		const seq = statusEvents.map((e) => e.status);
		t.true(seq.includes("serve-validating"),
			`validating emitted before the failure; got: ${seq.join(", ")}`);
		t.true(seq.indexOf("serve-error") > seq.indexOf("serve-validating"),
			`serve-error follows serve-validating; got: ${seq.join(", ")}`);
		// Crucial: a failed validation must NOT settle on ready or stale.
		const lastError = seq.lastIndexOf("serve-error");
		t.is(seq.indexOf("serve-ready", lastError + 1), -1,
			`No ready after a failed validation; got: ${seq.join(", ")}`);
		t.is(seq.indexOf("serve-stale", lastError + 1), -1,
			`No stale after a failed validation; got: ${seq.join(", ")}`);
	});

// A reader request issued while a project is in VALIDATING must NOT enqueue a build
// of its own — that would fire #triggerRequestQueue's 10 ms timer, abort the running
// validation pass, and flicker VALIDATING → BUILDING → VALIDATING for no reason.
// Instead, the request should wait on the validation pass, which resolves it via
// setReader when the cache turns out fresh.
test.serial(
	"serve-status: reader request during VALIDATING does not enqueue a redundant build", async (t) => {
		const {sinon, clock} = t.context;

		const rootProject = {getName: () => "root.project"};
		const libProject = {getName: () => "library.x"};
		const graph = {
			getRoot: () => rootProject,
			getProjects: () => [rootProject, libProject],
			getTransitiveDependencies: () => ["library.x"],
			getProject: (name) => name === "root.project" ? rootProject : libProject,
			traverseDependents: function* () {
				yield {project: rootProject};
				yield {project: libProject};
			},
		};

		// Hold the validation pass open so the reader request can land mid-VALIDATING.
		let releaseValidation;
		const validationGate = new Promise((resolve) => {
			releaseValidation = resolve;
		});

		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().callsFake(async ({willValidate}, callback) => {
				await willValidate?.("library.x");
				await validationGate;
				await callback("library.x", {
					getReader: () => ({fakeReader: true}),
				}, {}, true);
			}),
			build: sinon.stub().callsFake((_opts, perProjectCb) => {
				perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
				return Promise.resolve(["root.project"]);
			}),
		};

		// Capture the buildServerInterface so the test can call getReaderForProject
		// directly. The mocked BuildReader receives it on construction.
		let capturedInterface;
		class CapturingBuildReader {
			constructor(_name, _projects, buildServerInterface) {
				capturedInterface = buildServerInterface;
			}
		}

		class FakeWatchHandler {
			constructor() {
				this.destroy = sinon.stub().resolves();
				this.on = sinon.stub();
				this.watch = sinon.stub().resolves();
			}
		}

		const BuildServer = (await esmock("../../../lib/build/BuildServer.js", {
			"../../../lib/build/BuildReader.js": CapturingBuildReader,
			"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
		})).default;
		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());

		await clock.tickAsync(10);
		// Wait for VALIDATING to land.
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-validating");
		const buildCallsBeforeRequest = projectBuilder.build.callCount;

		// Issue a reader request for the validating project via the buildServerInterface.
		const readerPromise = capturedInterface.getReaderForProject("library.x");

		// Let any spurious queue tick attempt to land before we release validation.
		await clock.tickAsync(20);

		// No second build cycle should have been kicked off while validating.
		t.is(projectBuilder.build.callCount, buildCallsBeforeRequest,
			"No additional build started while reader request was waiting on validation");

		// Now release validation; it should resolve the reader and land on READY.
		releaseValidation();
		const reader = await readerPromise;
		t.deepEqual(reader, {fakeReader: true}, "Reader request resolved via validation's setReader");
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-ready");

		const seq = statusEvents.map((e) => e.status);
		const idxValidating = seq.indexOf("serve-validating");
		const idxReady = seq.lastIndexOf("serve-ready");
		// Crucial: no BUILDING between VALIDATING and the terminal READY.
		t.is(seq.slice(idxValidating, idxReady).indexOf("serve-building"), -1,
			`No serve-building between serve-validating and final serve-ready; got: ${seq.join(", ")}`);
	});

// When validation finds a project's cache stale and a reader request was queued
// for that project during VALIDATING, the validation pass must enqueue a build
// for it before settling — otherwise the queued reader request is orphaned.
test.serial(
	"serve-status: reader request during VALIDATING is built when validation finds cache stale",
	async (t) => {
		const {sinon, clock} = t.context;

		const rootProject = {getName: () => "root.project"};
		const libProject = {getName: () => "library.x"};
		const graph = {
			getRoot: () => rootProject,
			getProjects: () => [rootProject, libProject],
			getTransitiveDependencies: () => ["library.x"],
			getProject: (name) => name === "root.project" ? rootProject : libProject,
			traverseDependents: function* () {
				yield {project: rootProject};
				yield {project: libProject};
			},
		};

		let releaseValidation;
		const validationGate = new Promise((resolve) => {
			releaseValidation = resolve;
		});

		let buildCallCount = 0;
		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().callsFake(async ({willValidate}, callback) => {
				await willValidate?.("library.x");
				await validationGate;
				// usesCache=false: cache is stale, project stays INITIAL.
				await callback("library.x", {
					getReader: () => ({fakeReader: true}),
				}, {}, false);
			}),
			build: sinon.stub().callsFake((opts, perProjectCb) => {
				buildCallCount++;
				if (opts.includeRootProject) {
					perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
				}
				for (const depName of opts.includedDependencies || []) {
					perProjectCb(depName, {getReader: () => ({builtReader: depName})});
				}
				return Promise.resolve(
					(opts.includeRootProject ? ["root.project"] : []).concat(opts.includedDependencies || []));
			}),
		};

		let capturedInterface;
		class CapturingBuildReader {
			constructor(_name, _projects, buildServerInterface) {
				capturedInterface = buildServerInterface;
			}
		}

		class FakeWatchHandler {
			constructor() {
				this.destroy = sinon.stub().resolves();
				this.on = sinon.stub();
				this.watch = sinon.stub().resolves();
			}
		}

		const BuildServer = (await esmock("../../../lib/build/BuildServer.js", {
			"../../../lib/build/BuildReader.js": CapturingBuildReader,
			"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
		})).default;
		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());

		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-validating");
		const buildCallsBeforeRequest = buildCallCount;

		// Queue a reader request for the validating project.
		const readerPromise = capturedInterface.getReaderForProject("library.x");

		// Release validation: cache is stale, so the validation pass settles without
		// resolving the reader. The finally clause must enqueue a build.
		releaseValidation();
		// Drain microtasks + the queue's 10 ms debounce so the follow-up build can run.
		await clock.tickAsync(30);

		const readerResult = await readerPromise;
		t.deepEqual(readerResult, {builtReader: "library.x"},
			"Reader request resolved via follow-up build");
		t.true(buildCallCount > buildCallsBeforeRequest,
			"A follow-up build was triggered to satisfy the pending reader request");
	});

// When a source change lands during a validation pass, the server must transition
// VALIDATING → STALE right away rather than waiting for the pass to finish.
test.serial(
	"serve-status: source change during VALIDATING transitions to STALE eagerly", async (t) => {
		const {BuildServer, sinon, clock} = t.context;

		const rootProject = {getName: () => "root.project"};
		const libProject = {getName: () => "library.x"};
		const graph = {
			getRoot: () => rootProject,
			getProjects: () => [rootProject, libProject],
			getTransitiveDependencies: () => ["library.x"],
			getProject: (name) => name === "root.project" ? rootProject : libProject,
			traverseDependents: function* () {
				yield {project: rootProject};
				yield {project: libProject};
			},
		};

		let releaseValidation;
		const validationGate = new Promise((resolve) => {
			releaseValidation = resolve;
		});

		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().callsFake(async ({willValidate}, callback) => {
				await willValidate?.("library.x");
				await validationGate;
				await callback("library.x", {getReader: () => ({fakeReader: true})}, {}, true);
			}),
			build: sinon.stub().callsFake((_opts, perProjectCb) => {
				perProjectCb("root.project", {getReader: () => ({fakeReader: true})});
				return Promise.resolve(["root.project"]);
			}),
		};
		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());

		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-validating");
		const validatingIdx = statusEvents.findIndex((e) => e.status === "serve-validating");

		// Source change on a project currently in the validation set. This invalidates
		// the project (firing its per-project abort signal which the validation pass is
		// composing with) AND triggers the new VALIDATING → STALE branch in
		// _projectResourceChanged.
		buildServer._projectResourceChanged(libProject, "/x.js", false);

		// STALE must land synchronously — before the validation pass is even released.
		const seqMid = statusEvents.map((e) => e.status);
		const staleIdx = seqMid.indexOf("serve-stale", validatingIdx);
		t.true(staleIdx > validatingIdx,
			`Expected serve-stale promptly after the change; got: ${seqMid.join(", ")}`);

		// Release validation so the test can tear down cleanly.
		releaseValidation();
		await clock.tickAsync(20);
	});

// Regression test for a race where the request-queue timer schedules a second
// timer (T2) during T1's `await #stopActiveValidation`. Without a re-check of
// `#activeBuild` after that await, T2 would call `#processBuildRequests` while
// T1's build is still in flight, invoke `projectBuilder.build` concurrently, and
// surface a spurious "A build is already running" error to the user.
//
// Sequence exercised below:
//   1. Initial build of root completes; library.x and library.y enter
//      background VALIDATING.
//   2. Reader request lands on library.x — queued on its readerQueue via the
//      isValidating() branch, so no build is enqueued.
//   3. Source change on root invalidates root only (traverseDependents yields
//      just root); library.x/y stay in VALIDATING.
//   4. Reader request for root enqueues a build → schedules T1.
//   5. T1 fires: `#stopActiveValidation` aborts the pass. The pass's finally
//      releases library.x/y, which fires `onBuildRequired` for library.x
//      (queued reader) — that re-enters `#triggerRequestQueue` and schedules T2
//      while `#activeBuild` is still null.
//   6. T1 resumes, claims `#activeBuild`, calls `projectBuilder.build`.
//   7. A reader request for library.y arrives during T1's build →
//      `#pendingBuildRequest = {library.y}`.
//   8. T2 fires 10 ms later. Without the guard, it calls
//      `projectBuilder.build` a second time while T1's is still pending.
test.serial(
	"triggerRequestQueue: does not fire a second build while T1's build is in flight",
	async (t) => {
		const {sinon, clock} = t.context;

		const rootProject = {getName: () => "root.project"};
		const libX = {getName: () => "library.x"};
		const libY = {getName: () => "library.y"};
		const projectsByName = {
			"root.project": rootProject,
			"library.x": libX,
			"library.y": libY,
		};
		// traverseDependents yields only the source project itself so a source
		// change on root does not cascade into library.x or library.y.
		const graph = {
			getRoot: () => rootProject,
			getProjects: () => [rootProject, libX, libY],
			getTransitiveDependencies: () => ["library.x", "library.y"],
			getProject: (name) => projectsByName[name],
			traverseDependents: function* (projectName) {
				yield {project: projectsByName[projectName]};
			},
		};

		// Track concurrent invocations of projectBuilder.build. The second
		// concurrent call rejects with the same error the real ProjectBuilder
		// would throw synchronously from its "buildIsRunning" guard.
		let inFlightBuilds = 0;
		let maxConcurrentBuilds = 0;
		const buildInvocations = [];

		// Validation pass hangs until aborted; the abort signal's rejection is what
		// #stopActiveValidation awaits.
		const validationGate = (signal) => new Promise((_, reject) => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}
			signal.addEventListener("abort", () => reject(signal.reason), {once: true});
		});

		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().callsFake(async ({willValidate, signal}) => {
				willValidate?.("library.x");
				willValidate?.("library.y");
				// Wait until the pass is aborted by #stopActiveValidation. The
				// re-thrown abort reason is caught by #runBackgroundValidation.
				await validationGate(signal);
			}),
			build: sinon.stub().callsFake((opts, perProjectCb) => {
				if (inFlightBuilds > 0) {
					return Promise.reject(new Error("A build is already running"));
				}
				inFlightBuilds++;
				maxConcurrentBuilds = Math.max(maxConcurrentBuilds, inFlightBuilds);
				const {promise, resolve} = Promise.withResolvers();
				buildInvocations.push({opts, perProjectCb, resolve});
				return promise.finally(() => {
					inFlightBuilds--;
				});
			}),
		};

		let capturedInterface;
		class CapturingBuildReader {
			constructor(_name, _projects, buildServerInterface) {
				capturedInterface = buildServerInterface;
			}
		}

		class FakeWatchHandler {
			constructor() {
				this.destroy = sinon.stub().resolves();
				this.on = sinon.stub();
				this.watch = sinon.stub().resolves();
			}
		}

		const BuildServer = (await esmock("../../../lib/build/BuildServer.js", {
			"../../../lib/build/BuildReader.js": CapturingBuildReader,
			"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
		})).default;
		const statusEvents = makeStatusRecorder(t);

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
		t.teardown(() => buildServer.destroy());
		// Swallow the emitted error so AVA doesn't see an unhandled rejection
		// if the race actually fires (which it will, without the fix).
		const errorEvents = [];
		buildServer.on("error", (err) => errorEvents.push(err));

		// Drive the initial build of root.
		await clock.tickAsync(10);
		// Resolve the initial root build.
		t.is(buildInvocations.length, 1, "initial root build was invoked");
		buildInvocations[0].perProjectCb("root.project", {
			getReader: () => ({builtReader: "root.project"}),
		});
		buildInvocations[0].resolve(["root.project"]);

		// Wait for the post-build VALIDATING transition.
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-validating");

		// (2) Reader request on VALIDATING library.x — queued, no enqueueBuild.
		const libXReaderPromise = capturedInterface.getReaderForProject("library.x");
		// Keep the promise unhandled from AVA's perspective by attaching a noop
		// catch. If the fix is in place this resolves cleanly at teardown; if
		// not, it may reject when a follow-up build fails.
		libXReaderPromise.catch(() => {});

		// (3) Source change on root: only invalidates root (traverseDependents
		// yields root alone), leaving library.x/y in VALIDATING.
		buildServer._projectResourceChanged(rootProject, "/foo.js", false);

		// (4) Reader request for root → root is INVALIDATED, so this enqueues a
		// build and schedules T1.
		const rootReaderPromise = capturedInterface.getReaderForProject("root.project");
		rootReaderPromise.catch(() => {});

		// (5) Fire T1. tickAsync(10) drains through the timer body's await, which
		// aborts validation; validation's finally releases library.x's queued
		// reader via onBuildRequired → enqueueBuild(library.x) → schedules T2.
		// T1 then continues, claims #activeBuild, and calls projectBuilder.build
		// (the second recorded invocation).
		await clock.tickAsync(10);

		t.is(buildInvocations.length, 2, "T1 kicked off a second projectBuilder.build call");
		const t1Build = buildInvocations[1];
		t.true(t1Build.opts.includeRootProject, "T1 builds root");
		t.deepEqual(t1Build.opts.includedDependencies, ["library.x"],
			"T1 also picks up library.x from the onBuildRequired re-entry");

		// (7) Reader request for library.y while T1's build is pending. This
		// populates #pendingBuildRequest but triggerRequestQueue early-returns
		// because #activeBuild != null.
		const libYReaderPromise = capturedInterface.getReaderForProject("library.y");
		libYReaderPromise.catch(() => {});

		// (8) Fire T2. Without the fix, T2's timer body would call
		// projectBuilder.build concurrently and the mock would reject with
		// "A build is already running" (mirroring the real ProjectBuilder).
		await clock.tickAsync(10);

		// Primary assertion: at no point were two builds in flight.
		t.is(maxConcurrentBuilds, 1,
			"projectBuilder.build must never be called while a build is already in flight");

		// Observable surface: no spurious serve-error / error event.
		const seq = statusEvents.map((e) => e.status);
		t.false(seq.includes("serve-error"),
			`No serve-error should be emitted; got: ${seq.join(", ")}`);
		t.is(errorEvents.length, 0, "No BuildServer 'error' event should be emitted");

		// Let T1's build finish. The follow-up library.y build then runs in the
		// same processBuildRequests cycle. Resolve each in order and drain.
		t1Build.perProjectCb("root.project", {getReader: () => ({builtReader: "root.project"})});
		t1Build.perProjectCb("library.x", {getReader: () => ({builtReader: "library.x"})});
		t1Build.resolve(["root.project", "library.x"]);

		// Drain until the library.y build lands.
		for (let i = 0; i < 100 && buildInvocations.length < 3; i++) {
			await clock.tickAsync(1);
		}
		t.is(buildInvocations.length, 3, "library.y is built in the same request-queue cycle");
		const libYBuild = buildInvocations[2];
		libYBuild.perProjectCb("library.y", {getReader: () => ({builtReader: "library.y"})});
		libYBuild.resolve(["library.y"]);

		await drainUntil(clock, statusEvents, (e) => e.status === "serve-ready");

		// All three reader requests must have resolved.
		t.deepEqual(await libXReaderPromise, {builtReader: "library.x"},
			"library.x reader resolved by its follow-up build");
		t.deepEqual(await rootReaderPromise, {builtReader: "root.project"},
			"root reader resolved by T1's build");
		t.deepEqual(await libYReaderPromise, {builtReader: "library.y"},
			"library.y reader resolved by the trailing build");
	});


// Regression suite for the "sticky HTTP 500" observed during manual testing.
//
// Reproduces two escapes from the ERRORED-project gate that survive a build
// failure:
//
//   1. A build fails on a dependency (library.a). The user then edits a file
//      in an *unrelated* part of the tree — say the root project. That change
//      routes through _projectResourceChanged(root, …), which walks
//      traverseDependents(root, true) and only invalidates root and its
//      dependents. library.a is a *dependency* of root, not a dependent, so
//      its ProjectBuildStatus stays in ERRORED. The server-level banner still
//      transitions ERROR → STALE → BUILDING → READY off the root project's
//      recovery path (root's build succeeds because it doesn't touch the
//      failed library resource path), giving the impression of full recovery.
//      Any HTTP request that resolves through library.a keeps rejecting with
//      the captured file-not-found error → the terminal Express error handler
//      turns each into an HTTP 500 with the same stack.
//
//   2. A build fails during a rapid file-change window (e.g. `git checkout`).
//      By the time the catch block runs, `signal.aborted` is false and
//      `#resourceChangeQueue` has already been flushed, so the failure lands
//      on the "normal" branch and latches ERRORED. The trailing watcher events
//      arrive *after* the queue was flushed but are absorbed by the *rebuild*
//      the transient branch would have run — none of them cascade into
//      invalidate(library.a), and the gate stays closed.
//
// Both variants are captured below.

function makeErrorGraphWithLibDep() {
	const rootProject = {getName: () => "root.project"};
	const libProject = {getName: () => "library.a"};
	const projectsByName = {"root.project": rootProject, "library.a": libProject};
	const graph = {
		getRoot: () => rootProject,
		getProjects: () => [rootProject, libProject],
		getTransitiveDependencies: () => ["library.a"],
		getProject: (name) => projectsByName[name],
		// traverseDependents(x) yields x + everything that transitively depends on x.
		// library.a has NO dependents other than the root project; the root project
		// itself has no dependents. So a change in root.project only invalidates
		// root; a change in library.a invalidates library.a and root.
		traverseDependents: function* (projectName, includeStart) {
			if (projectName === "library.a") {
				if (includeStart) yield {project: libProject};
				yield {project: rootProject};
			} else {
				if (includeStart) yield {project: rootProject};
			}
		},
	};
	return {rootProject, libProject, graph};
}

// Builds a BuildServer whose BuildReader was mocked to capture the
// buildServerInterface (getReaderForProject/getReaderForProjects), so tests can
// simulate the byPath → getReaderForProject call chain a real HTTP request
// would follow without depending on express.
async function makeBuildServerWithCapturedInterface(t, graph, projectBuilder, initialDeps = ["library.a"]) {
	const {sinon} = t.context;
	let capturedInterface;
	class CapturingBuildReader {
		constructor(_name, _projects, buildServerInterface) {
			capturedInterface = buildServerInterface;
		}
	}
	class FakeWatchHandler {
		constructor() {
			this.destroy = sinon.stub().resolves();
			this.on = sinon.stub();
			this.watch = sinon.stub().resolves();
		}
	}
	const BuildServer = (await esmock("../../../lib/build/BuildServer.js", {
		"../../../lib/build/BuildReader.js": CapturingBuildReader,
		"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
	})).default;
	const buildServer = await BuildServer.create(graph, projectBuilder, true, initialDeps, []);
	t.teardown(() => buildServer.destroy());
	// Swallow emitted "error" events so AVA doesn't see unhandled rejections.
	// The failure paths under test do not emit "error" (that's reserved for
	// fatal failures) but installing the noop listener is defensive.
	buildServer.on("error", () => {});
	return {buildServer, getInterface: () => capturedInterface};
}

// Builder factory that fails the first invocation and succeeds subsequent ones.
// Mirrors the "task threw ENOENT once, then the tree settled" shape produced by
// a branch switch.
function makeFailOnceThenSucceedBuilder(sinon, buildError) {
	const invocations = [];
	let calls = 0;
	const builder = {
		closeCacheManager: sinon.stub(),
		resourcesChanged: sinon.stub(),
		validateCaches: sinon.stub().resolves([]),
		build: sinon.stub().callsFake((opts, perProjectCb) => {
			const invocation = {opts, perProjectCb, index: calls};
			invocations.push(invocation);
			const isFirst = calls === 0;
			calls++;
			if (isFirst) {
				return Promise.reject(buildError);
			}
			if (opts.includeRootProject) {
				perProjectCb("root.project", {getReader: () => ({builtReader: "root.project"})});
			}
			for (const depName of opts.includedDependencies || []) {
				perProjectCb(depName, {getReader: () => ({builtReader: depName})});
			}
			return Promise.resolve(
				(opts.includeRootProject ? ["root.project"] : []).concat(opts.includedDependencies || []));
		}),
	};
	return {builder, invocations};
}

test.serial(
	"error-recovery: change in a dependent project lifts the ERRORED gate on its dependency",
	async (t) => {
		// Fix 2 in _projectResourceChanged: a source change in root.project must
		// also clear the ERRORED gate on library.a (a transitive dependency), even
		// though traverseDependents(root) never reaches library.a. Without this,
		// any HTTP request that resolves through library.a would keep returning
		// the captured build error indefinitely — the "sticky HTTP 500" reported
		// after manual testing.
		const {sinon, clock} = t.context;

		const {graph, rootProject} = makeErrorGraphWithLibDep();
		const buildError = new Error("ENOENT: no such file or directory, open '/tmp/vanished.js'");
		const statusEvents = makeStatusRecorder(t);
		const {builder: projectBuilder, invocations} = makeFailOnceThenSucceedBuilder(sinon, buildError);

		const {buildServer, getInterface} = await makeBuildServerWithCapturedInterface(t, graph, projectBuilder);

		// (1) Drive the initial build cycle to failure — the whole batch (root +
		// library.a) rejects, both are latched into ERRORED.
		await clock.tickAsync(10);
		t.is(invocations.length, 1, "initial build was invoked");
		t.true(invocations[0].opts.includeRootProject && invocations[0].opts.includedDependencies.includes("library.a"),
			"initial build covered root + library.a");
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");
		t.is(statusEvents[statusEvents.length - 1].status, "serve-error", "cycle ends in serve-error");

		// (2) User edits a file in root.project. Fix 2 walks
		// getTransitiveDependencies(root.project) and clears library.a's ERRORED
		// gate, since the user's activity signals retry intent.
		buildServer._projectResourceChanged(rootProject, "/index.html", false);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-stale");

		// (3) A request for library.a's reader must now enqueue a real build
		// rather than replay the captured error.
		const iface = getInterface();
		const libReq = iface.getReaderForProject("library.a");
		// Drive the 10ms request-queue tick + drain the build promise. The
		// follow-up build succeeds (fail-once mock).
		await clock.tickAsync(10);
		const reader = await libReq;
		t.deepEqual(reader, {builtReader: "library.a"},
			"library.a rebuild resolved cleanly after the gate was lifted");

		// And confirm the mechanism: a rebuild of library.a was actually
		// attempted after the initial failure.
		t.true(
			invocations.some((inv, i) => i > 0 && inv.opts.includedDependencies?.includes("library.a")),
			"at least one post-failure invocation built library.a");
	});

test.serial(
	"error-recovery: successful build cycle lifts ERRORED gates on unrelated projects", async (t) => {
		// Fix 1 in #processBuildRequests: after any successful build cycle, sweep
		// #projectBuildStatus and lift ERRORED gates on projects the cycle didn't
		// touch. This covers the case where the failed project has no graph
		// relationship to the changed one (multi-root workspaces, sibling libs
		// that only share the root as a common dependent).
		const {sinon, clock} = t.context;

		// Two independent libraries sharing only the root. Fix 2's
		// getTransitiveDependencies(root) covers both, so to isolate Fix 1 we use
		// a graph where a change in libA does NOT reach libB via any traversal —
		// libA/libB are siblings, both dependencies of root, with no dependents
		// of their own.
		const rootProject = {getName: () => "root.project"};
		const libA = {getName: () => "library.a"};
		const libB = {getName: () => "library.b"};
		const projectsByName = {
			"root.project": rootProject, "library.a": libA, "library.b": libB,
		};
		const graph = {
			getRoot: () => rootProject,
			getProjects: () => [rootProject, libA, libB],
			getTransitiveDependencies: (name) => {
				if (name === "root.project") return ["library.a", "library.b"];
				return [];
			},
			getProject: (name) => projectsByName[name],
			traverseDependents: function* (projectName, includeStart) {
				if (projectName === "library.a") {
					if (includeStart) yield {project: libA};
					yield {project: rootProject};
				} else if (projectName === "library.b") {
					if (includeStart) yield {project: libB};
					yield {project: rootProject};
				} else {
					if (includeStart) yield {project: rootProject};
				}
			},
		};

		const buildError = new Error("ENOENT: no such file or directory, open '/tmp/vanished.js'");
		const statusEvents = makeStatusRecorder(t);

		// First cycle fails; every subsequent cycle succeeds.
		let calls = 0;
		const invocations = [];
		const projectBuilder = {
			closeCacheManager: sinon.stub(),
			resourcesChanged: sinon.stub(),
			validateCaches: sinon.stub().resolves([]),
			build: sinon.stub().callsFake((opts, perProjectCb) => {
				const invocation = {opts, perProjectCb, index: calls};
				invocations.push(invocation);
				const isFirst = calls === 0;
				calls++;
				if (isFirst) {
					return Promise.reject(buildError);
				}
				if (opts.includeRootProject) {
					perProjectCb("root.project", {getReader: () => ({builtReader: "root.project"})});
				}
				for (const depName of opts.includedDependencies || []) {
					perProjectCb(depName, {getReader: () => ({builtReader: depName})});
				}
				return Promise.resolve(
					(opts.includeRootProject ? ["root.project"] : []).concat(opts.includedDependencies || []));
			}),
		};

		const {buildServer, getInterface} = await makeBuildServerWithCapturedInterface(
			t, graph, projectBuilder, ["library.a", "library.b"]);

		// (1) Initial build fails — root, library.a, library.b all ERRORED.
		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");

		// (2) Source change ONLY on library.a. This invalidates library.a (via
		// traverseDependents) and lifts library.a's error gate via invalidate().
		// Fix 2 also clears getTransitiveDependencies(library.a) = [] — no effect
		// on library.b. Only Fix 1 (the post-cycle sweep) can lift library.b's
		// gate. root's gate lifts too (root is a dependent of library.a).
		buildServer._projectResourceChanged(libA, "/src/library.a/foo.js", false);

		// (3) Rebuild library.a — this succeeds and, on cycle completion, sweeps
		// #projectBuildStatus, clearing library.b's ERRORED gate.
		const iface = getInterface();
		const libAReq = iface.getReaderForProject("library.a");
		await clock.tickAsync(10);
		await libAReq;

		// (4) A request for library.b must NOT replay the captured error. The
		// post-cycle sweep dropped library.b's gate to INVALIDATED, so this
		// request enqueues a real rebuild.
		const libBReq = iface.getReaderForProject("library.b");
		await clock.tickAsync(10);
		const libBReader = await libBReq;
		t.deepEqual(libBReader, {builtReader: "library.b"},
			"library.b rebuilt after its ERRORED gate was lifted by the successful cycle");
	});

test.serial(
	"error-recovery: no source change and no other build → ERRORED gate stays closed", async (t) => {
		// Complement to the two "gate lifts" tests: without ANY signal — no source
		// change, no successful build — the ERRORED gate is still deterministic
		// (a re-request would just re-produce the same failure). This confirms
		// the gate is only lifted by an explicit signal, not by wall-clock time.
		const {sinon, clock} = t.context;

		const {graph} = makeErrorGraphWithLibDep();
		const buildError = new Error("ENOENT: no such file or directory, open '/tmp/vanished.js'");
		const {builder: projectBuilder, invocations} = makeFailOnceThenSucceedBuilder(sinon, buildError);
		const statusEvents = makeStatusRecorder(t);

		const {getInterface} = await makeBuildServerWithCapturedInterface(t, graph, projectBuilder);

		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");
		t.is(invocations.length, 1, "only the initial build ran");

		const iface = getInterface();
		// Five sequential reader requests, no source change in between. Each
		// must reject with the exact captured error, and no rebuild is attempted.
		const errs = [];
		for (let i = 0; i < 5; i++) {
			const p = iface.getReaderForProject("library.a");
			await clock.tickAsync(1);
			errs.push(await p.catch((e) => e));
		}
		t.is(invocations.length, 1, "no rebuild was triggered by any of the 5 requests");
		for (const err of errs) {
			t.is(err, buildError, "each request rejects with the captured build error");
		}
	});

test.serial(
	"error-recovery: file change on the ERRORED project itself lifts the gate", async (t) => {
		// Sanity-check the counterpart to the sticky path — a change *on*
		// library.a does invalidate its ProjectBuildStatus (invalidate() clears
		// #lastError), so the follow-up reader request enqueues a real rebuild.
		// This documents the current recovery contract and pins down that the
		// escape reproduced above is specifically about invalidations that
		// don't reach the ERRORED project.
		const {sinon, clock} = t.context;

		const {graph, libProject} = makeErrorGraphWithLibDep();
		const buildError = new Error("ENOENT: no such file or directory, open '/tmp/vanished.js'");
		const {builder: projectBuilder, invocations} = makeFailOnceThenSucceedBuilder(sinon, buildError);
		const statusEvents = makeStatusRecorder(t);

		const {buildServer, getInterface} = await makeBuildServerWithCapturedInterface(t, graph, projectBuilder);

		await clock.tickAsync(10);
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");

		// Change on library.a itself → invalidate(library.a) + invalidate(root).
		buildServer._projectResourceChanged(libProject, "/src/library.a/foo.js", false);

		const iface = getInterface();
		const p = iface.getReaderForProject("library.a");
		await clock.tickAsync(10);
		const reader = await p;
		t.deepEqual(reader, {builtReader: "library.a"},
			"reader request for library.a resolved via the follow-up build after its own change");
		t.true(invocations.length >= 2, "a rebuild of library.a was triggered");
		t.true(
			invocations.some((inv, i) => i > 0 && inv.opts.includedDependencies?.includes("library.a")),
			"at least one post-failure invocation built library.a");
	});
// Builds a BuildServer whose WatchHandler and BuildReader are both mocked so tests can
// (a) drive the buildServerInterface (getReaderForProject) and (b) fire the watcher error
// callback and inspect re-subscription. `watchHandlers` accumulates every WatchHandler the
// server constructs — index 0 is the initial handler, later entries are recovery handlers.
// `opts.failWatchFrom` makes watch() reject for the handler at that index and beyond
// (used to exercise the re-subscription-failure fallback).
async function makeRecoverableBuildServer(t, graph, projectBuilder, {initialDeps = ["library.a"],
	failWatchFrom = Infinity} = {}) {
	const {sinon} = t.context;
	let capturedInterface;
	class CapturingBuildReader {
		constructor(_name, _projects, buildServerInterface) {
			capturedInterface = buildServerInterface;
		}
	}
	const watchHandlers = [];
	class FakeWatchHandler {
		constructor() {
			const index = watchHandlers.length;
			this.listeners = Object.create(null);
			this.destroy = sinon.stub().resolves();
			this.watch = index >= failWatchFrom ?
				sinon.stub().rejects(new Error("watch() rejected")) :
				sinon.stub().resolves();
			this.on = sinon.stub().callsFake((event, cb) => {
				(this.listeners[event] ??= []).push(cb);
			});
			this.emitError = (err) => {
				for (const cb of this.listeners.error ?? []) {
					cb(err);
				}
			};
			watchHandlers.push(this);
		}
	}
	const BuildServer = (await esmock("../../../lib/build/BuildServer.js", {
		"../../../lib/build/BuildReader.js": CapturingBuildReader,
		"../../../lib/build/helpers/WatchHandler.js": FakeWatchHandler,
	})).default;
	const buildServer = await BuildServer.create(graph, projectBuilder, true, initialDeps, []);
	t.teardown(() => buildServer.destroy());
	const errorEvents = [];
	buildServer.on("error", (err) => errorEvents.push(err));
	return {buildServer, getInterface: () => capturedInterface, watchHandlers, errorEvents};
}

function makeRescanBuilder(sinon) {
	const invocations = [];
	const builder = {
		closeCacheManager: sinon.stub(),
		resourcesChanged: sinon.stub(),
		forceFullRescan: sinon.stub(),
		validateCaches: sinon.stub().resolves([]),
		build: sinon.stub().callsFake((opts, perProjectCb) => {
			invocations.push({opts});
			if (opts.includeRootProject) {
				perProjectCb("root.project", {getReader: () => ({builtReader: "root.project"})});
			}
			for (const depName of opts.includedDependencies || []) {
				perProjectCb(depName, {getReader: () => ({builtReader: depName})});
			}
			return Promise.resolve(
				(opts.includeRootProject ? ["root.project"] : []).concat(opts.includedDependencies || []));
		}),
	};
	return {builder, invocations};
}

const droppedEventsError = () =>
	new Error("Events were dropped by the FSEvents client. File system must be re-scanned.");

test.serial(
	"watcher-recovery: dropped-events error recreates watcher and forces a full re-scan", async (t) => {
		const {sinon, clock, SOURCES_CHANGED_SETTLE_MS} = t.context;
		const {graph} = makeErrorGraphWithLibDep();
		const {builder: projectBuilder} = makeRescanBuilder(sinon);
		const statusEvents = makeStatusRecorder(t);

		const {buildServer, watchHandlers, errorEvents} =
			await makeRecoverableBuildServer(t, graph, projectBuilder);

		// Let the initial build cycle settle.
		await clock.tickAsync(20);
		t.is(watchHandlers.length, 1, "one watcher initially");

		const sourcesChanged = sinon.stub();
		buildServer.on("sourcesChanged", sourcesChanged);

		// Fire the dropped-events error on the initial watcher.
		watchHandlers[0].emitError(droppedEventsError());
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-stale");

		t.true(watchHandlers[0].destroy.calledOnce, "old watcher destroyed");
		t.is(watchHandlers.length, 2, "a fresh watcher was created");
		t.true(watchHandlers[1].watch.calledOnce, "fresh watcher re-subscribed");
		t.true(projectBuilder.forceFullRescan.calledOnce, "full re-scan forced on the builder");
		t.is(errorEvents.length, 0, "no fatal error event on successful recovery");

		await clock.tickAsync(SOURCES_CHANGED_SETTLE_MS);
		t.true(sourcesChanged.calledOnce, "sourcesChanged emitted so clients reload");

		const seq = statusEvents.map((e) => e.status);
		t.is(seq[seq.length - 1], "serve-stale", "server settles on STALE after recovery");
	});

test.serial(
	"watcher-recovery: a reader request parked before the error resolves after recovery", async (t) => {
		const {sinon, clock} = t.context;
		const {graph} = makeErrorGraphWithLibDep();
		const {builder: projectBuilder, invocations} = makeRescanBuilder(sinon);
		makeStatusRecorder(t);

		const {getInterface, watchHandlers} =
			await makeRecoverableBuildServer(t, graph, projectBuilder, {initialDeps: []});

		await clock.tickAsync(20);
		const buildsBefore = invocations.length;

		// Park a reader request, then fire the watcher error before it is served.
		const readerPromise = getInterface().getReaderForProject("library.a");
		watchHandlers[0].emitError(droppedEventsError());

		// Recovery drains the queue on completion; the parked request must resolve.
		await clock.tickAsync(30);
		const reader = await readerPromise;
		t.deepEqual(reader, {builtReader: "library.a"}, "parked reader request resolved after recovery");
		t.true(invocations.length > buildsBefore, "a build ran to serve the parked request post-recovery");
	});

test.serial(
	"watcher-recovery: repeated errors within the window escalate to a fatal error", async (t) => {
		const {sinon, clock} = t.context;
		const {graph} = makeErrorGraphWithLibDep();
		const {builder: projectBuilder} = makeRescanBuilder(sinon);
		const statusEvents = makeStatusRecorder(t);

		const {watchHandlers, errorEvents} =
			await makeRecoverableBuildServer(t, graph, projectBuilder);
		await clock.tickAsync(20);

		// Drive more recoveries than the loop-protection budget allows within the window.
		// Each successful recovery creates a new handler; fire the error on the latest one.
		let escalated = false;
		for (let i = 0; i < 10 && !escalated; i++) {
			watchHandlers[watchHandlers.length - 1].emitError(droppedEventsError());
			await clock.tickAsync(30);
			escalated = errorEvents.length > 0;
		}

		t.true(escalated, "loop protection eventually escalated to a fatal error event");
		const seq = statusEvents.map((e) => e.status);
		t.is(seq[seq.length - 1], "serve-error", "server ends in ERROR after giving up");
	});

test.serial(
	"watcher-recovery: failure to re-subscribe falls back to fatal error", async (t) => {
		const {sinon, clock} = t.context;
		const {graph} = makeErrorGraphWithLibDep();
		const {builder: projectBuilder} = makeRescanBuilder(sinon);
		const statusEvents = makeStatusRecorder(t);

		// Fail watch() from the first recovery handler (index 1) onward; the initial
		// handler (index 0) subscribes normally so the server starts up.
		const {watchHandlers, errorEvents} =
			await makeRecoverableBuildServer(t, graph, projectBuilder, {failWatchFrom: 1});
		await clock.tickAsync(20);

		watchHandlers[0].emitError(droppedEventsError());
		await drainUntil(clock, statusEvents, (e) => e.status === "serve-error");

		t.is(errorEvents.length, 1, "a fatal error event was emitted");
		t.is(errorEvents[0].message, "watch() rejected", "the re-subscription failure is surfaced");
	});
