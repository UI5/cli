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
