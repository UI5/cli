import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

// Note: These tests are focused on the debounce behavior of the `sourcesChanged` event.
// The general BuildServer functionality is tested by the integration test at ./BuildServer.integration.js

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
		destroy: sinon.stub(),
	};
	t.context.projectBuilder = {
		closeCacheManager: sinon.stub(),
		resourcesChanged: sinon.stub(),
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
	t.context.SOURCES_CHANGED_DEBOUNCE_MS = BuildServer.__internals__.SOURCES_CHANGED_DEBOUNCE_MS;
	// Use the static factory so #watchHandler is initialized — needed for destroy() in some tests.
	t.context.buildServer = await BuildServer.create(
		t.context.graph, t.context.projectBuilder, false, [], []);
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("sourcesChanged: emitted once after debounce window for a single change", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_DEBOUNCE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/foo.js", false);

	t.is(listener.callCount, 0, "Not emitted synchronously");

	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS - 1);
	t.is(listener.callCount, 0, "Not emitted before window elapses");

	clock.tick(1);
	t.is(listener.callCount, 1, "Emitted exactly once after window elapses");
});

test.serial("sourcesChanged: burst of changes within window collapses to one emit", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_DEBOUNCE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	// 5 rapid changes, each well within the debounce window.
	for (let i = 0; i < 5; i++) {
		buildServer._projectResourceChanged(rootProject, `/foo${i}.js`, false);
		clock.tick(10);
	}

	t.is(listener.callCount, 0, "No emit while bursts are within window");

	// Advance past the remaining debounce window from the last change.
	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS);
	t.is(listener.callCount, 1, "Burst collapsed to a single emit");
});

test.serial("sourcesChanged: each change resets the debounce timer", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_DEBOUNCE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/a.js", false);
	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS - 10);
	// Second change just before the original timer would fire — must reset, not fire-then-reset.
	buildServer._projectResourceChanged(rootProject, "/b.js", false);
	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS - 10);
	t.is(listener.callCount, 0,
		"Second change reset the timer; no emit yet despite > debounce window of total elapsed time");

	clock.tick(10);
	t.is(listener.callCount, 1, "Emitted once the reset window elapses");
});

test.serial("sourcesChanged: separate change windows produce separate emits", (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_DEBOUNCE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/a.js", false);
	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS);
	t.is(listener.callCount, 1, "First window emitted");

	// A change after the first emit starts a new debounce window.
	buildServer._projectResourceChanged(rootProject, "/b.js", false);
	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS);
	t.is(listener.callCount, 2, "Second window produced a second emit");
});

test.serial("sourcesChanged: destroy cancels a pending emit", async (t) => {
	const {buildServer, rootProject, clock, SOURCES_CHANGED_DEBOUNCE_MS} = t.context;
	const listener = t.context.sinon.stub();
	buildServer.on("sourcesChanged", listener);

	buildServer._projectResourceChanged(rootProject, "/a.js", false);
	t.is(listener.callCount, 0, "Pre-destroy: pending emit not yet fired");

	await buildServer.destroy();

	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS * 5);
	t.is(listener.callCount, 0, "Pending sourcesChanged emit was cancelled by destroy()");
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

test.serial("serve-status: serve-stale emitted on debounced sources change", (t) => {
	const {buildServer, rootProject, clock, sinon, SOURCES_CHANGED_DEBOUNCE_MS} = t.context;
	const statusHandler = sinon.stub();
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));

	buildServer._projectResourceChanged(rootProject, "/foo.js", false);
	clock.tick(SOURCES_CHANGED_DEBOUNCE_MS);

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
	const statusEvents = [];
	const statusHandler = (evt) => statusEvents.push(evt);
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));

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
	"serve-status: source change mid-build emits exactly one stale at cycle end", async (t) => {
		const {BuildServer, graph, projectBuilder, rootProject, sinon, clock} = t.context;
		const statusEvents = [];
		const statusHandler = (evt) => statusEvents.push(evt);
		process.on("ui5.serve-status", statusHandler);
		t.teardown(() => process.off("ui5.serve-status", statusHandler));

		let buildResolve;
		let perProjectCb;
		projectBuilder.build = sinon.stub().callsFake((_opts, cb) => {
			perProjectCb = cb;
			return new Promise((resolve) => {
				buildResolve = () => resolve(["root.project"]);
			});
		});

		const buildServer = await BuildServer.create(graph, projectBuilder, true, [], []);
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
		const staleCalls = seq.filter((s) => s === "serve-stale");
		t.is(staleCalls.length, 1,
			`Expected exactly one stale emission at cycle end, got sequence: ${seq.join(", ")}`);
		// And the emission must come AFTER serve-build-done (i.e. it's the
		// end-of-cycle one, not the IDLE→STALE one).
		const lastStaleIdx = seq.lastIndexOf("serve-stale");
		const lastBuildDoneIdx = seq.lastIndexOf("serve-build-done");
		t.true(lastStaleIdx > lastBuildDoneIdx,
			`Expected stale after build-done; got: ${seq.join(", ")}`);
	});

test.serial("serve-status: build failure emits serveError and no orphan building", async (t) => {
	const {BuildServer, graph, projectBuilder, sinon, clock} = t.context;
	const statusEvents = [];
	const statusHandler = (evt) => statusEvents.push(evt);
	process.on("ui5.serve-status", statusHandler);
	t.teardown(() => process.off("ui5.serve-status", statusHandler));

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
});
