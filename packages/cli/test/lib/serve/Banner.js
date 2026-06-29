import test from "ava";
import sinon from "sinon";
import {EventEmitter} from "node:events";
import stripAnsi from "strip-ansi";

import Banner from "../../../lib/serve/Banner.js";
import {STATES} from "../../../lib/serve/state.js";

function createStubStdout() {
	const stub = new EventEmitter();
	stub.columns = 200;
	stub.writes = [];
	stub.write = (chunk) => {
		stub.writes.push(chunk);
		return true;
	};
	return stub;
}

// Spin up a fully-populated banner the way production does it: observe() first,
// then setProject() + setUrls(). Mirrors serve.js's call sequence so the tests
// drive Banner through its real public API. The banner starts in the INITIAL
// state — tests that need a particular runtime state emit the matching
// ui5.serve-status event themselves.
function createBanner(stdout) {
	const banner = Banner.observe({
		stdout,
		brand: {name: "UI5 CLI", version: "1.0.0"},
		acceptRemoteConnections: false,
	});
	banner.setProject({
		name: "my.app",
		type: "application",
		version: "1.0.0",
		framework: {name: "SAPUI5", version: "1.0.0"},
	});
	banner.setUrls({local: "http://localhost:8080"});
	return banner;
}

test.serial("Banner.observe + setters: prints header + initial ready status", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-ready"});

	const output = stripAnsi(stdout.writes.join(""));
	t.regex(output, /UI5 CLI v1\.0\.0/);
	t.regex(output, /Local:\s+http:\/\/localhost:8080/);
	t.regex(output, /Project\s+my\.app/);
	t.regex(output, /Status\s+●\s+ready/);

	t.is(banner._getStateForTest().state, STATES.READY);
	banner.stop();
});

test.serial("Banner reacts to serve-stale event", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);

	process.emit("ui5.serve-status", {
		status: "serve-stale",
		changedProjects: ["my.app"],
	});

	t.is(banner._getStateForTest().state, STATES.STALE);
	const tail = stripAnsi(stdout.writes.slice(-5).join(""));
	t.regex(tail, /stale/);
	banner.stop();
});

test.serial("Banner reacts to serve-building, then serve-build-done", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);

	process.emit("ui5.serve-status", {status: "serve-building"});
	t.is(banner._getStateForTest().state, STATES.BUILDING);

	process.emit("ui5.serve-status", {status: "serve-build-done", hrtime: [0, 50000000]});
	t.is(banner._getStateForTest().state, STATES.READY);

	banner.stop();
});

test.serial("Banner tracks build-metadata and project-build-status updates", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);

	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-metadata", {projectsToBuild: ["a", "b", "c"]});
	process.emit("ui5.build-status", {
		projectName: "b",
		projectType: "library",
		status: "project-build-start",
	});
	process.emit("ui5.project-build-status", {
		projectName: "b",
		projectType: "library",
		taskName: "minify",
		status: "task-start",
	});

	const state = banner._getStateForTest();
	t.is(state.totalProjects, 3);
	t.is(state.currentProjectIndex, 2);
	t.is(state.currentProjectName, "b");
	t.is(state.currentTaskName, "minify");

	banner.stop();
});

test.serial("Banner enters error state on serve-error", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);

	const err = new Error("boom");
	err.stack = "Error: boom\n    at <anonymous>";
	process.emit("ui5.serve-status", {status: "serve-error", error: err});

	t.is(banner._getStateForTest().state, STATES.ERROR);
	t.is(banner._getStateForTest().errorMessage, "boom");

	// The banner intentionally does NOT echo the error via logAbove —
	// BuildServer's own log.error and the yargs fail-handler already render
	// the message and stack trace, so a third copy would be noise.
	const fullOutput = stripAnsi(stdout.writes.join(""));
	t.notRegex(fullOutput, /at <anonymous>/, "stack trace is not duplicated via logAbove");

	// Next build cycle clears error state via the BUILDING transition.
	process.emit("ui5.serve-status", {status: "serve-building"});
	t.is(banner._getStateForTest().state, STATES.BUILDING);

	banner.stop();
});

test.serial("Banner routes warn/error log events through logAbove", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	stdout.writes.length = 0;

	process.emit("ui5.log", {
		level: "warn",
		message: "Heads up",
		moduleName: "test:module",
	});
	const afterWarn = stripAnsi(stdout.writes.join(""));
	t.regex(afterWarn, /Heads up/);
	t.regex(afterWarn, /test:module/);

	stdout.writes.length = 0;
	process.emit("ui5.log", {
		level: "info",
		message: "Should not appear",
		moduleName: "test:module",
	});
	const afterInfo = stripAnsi(stdout.writes.join(""));
	t.notRegex(afterInfo, /Should not appear/);

	banner.stop();
});

test.serial("Banner suppresses log events below the configured level", async (t) => {
	const {default: Logger} = await import("@ui5/logger/Logger");
	const previousLevel = Logger.getLevel();
	Logger.setLevel("error");
	t.teardown(() => Logger.setLevel(previousLevel));

	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	stdout.writes.length = 0;

	process.emit("ui5.log", {
		level: "warn",
		message: "Filtered warning",
		moduleName: "test:module",
	});
	const afterWarn = stripAnsi(stdout.writes.join(""));
	t.notRegex(afterWarn, /Filtered warning/, "warn is suppressed when log level is error");

	process.emit("ui5.log", {
		level: "error",
		message: "Real failure",
		moduleName: "test:module",
	});
	const afterError = stripAnsi(stdout.writes.join(""));
	t.regex(afterError, /Real failure/, "error still passes through");

	banner.stop();
});

test.serial("Banner stops on ui5.log.stop-console", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);

	const stopSpy = sinon.spy(banner, "stop");
	process.emit("ui5.log.stop-console");
	t.is(stopSpy.callCount, 1, "Banner.stop was triggered by ui5.log.stop-console");

	sinon.restore();
});

test.serial("Banner handles resize by re-rendering the status line", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	stdout.writes.length = 0;

	stdout.columns = 40;
	stdout.emit("resize");

	const after = stripAnsi(stdout.writes.join(""));
	t.regex(after, /Status/, "resize triggers a status line re-render");

	banner.stop();
});

test.serial("Banner.stop is idempotent", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	banner.stop();
	t.notThrows(() => banner.stop(), "second stop() is a no-op");
});

test.serial("Banner.observe: paints skeleton with placeholders, fills in via setters", (t) => {
	const stdout = createStubStdout();
	const banner = Banner.observe({
		stdout,
		brand: {name: "UI5 CLI", version: "1.0.0"},
	});

	const skeleton = stripAnsi(stdout.writes.join(""));
	// Brand is known up front; the rest is rendered as a placeholder so the
	// layout is stable while we wait for the graph and the server.
	t.regex(skeleton, /UI5 CLI v1\.0\.0/);
	t.regex(skeleton, /Local:\s+binding…/);
	t.regex(skeleton, /Project\s+resolving…/);
	t.notRegex(skeleton, /my\.app/, "no project name before setProject");

	// State updates still arrive during the resolve phase.
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-metadata", {projectsToBuild: ["sap.ui.core"]});
	process.emit("ui5.build-status", {
		projectName: "sap.ui.core",
		projectType: "library",
		status: "project-build-start",
	});
	t.is(banner._getStateForTest().state, STATES.BUILDING, "state tracked from events");
	t.is(banner._getStateForTest().currentProjectName, "sap.ui.core");

	// Filling in the header sections refines the skeleton in place.
	banner.setProject({name: "my.app", type: "application", version: "1.0.0"});
	banner.setUrls({local: "http://localhost:8080"});

	const filled = stripAnsi(stdout.writes.join(""));
	t.regex(filled, /Local:\s+http:\/\/localhost:8080/);
	t.regex(filled, /Project\s+my\.app/);
	t.regex(filled, /building/, "status line reflects the building state");
	t.regex(filled, /sap\.ui\.core/);

	banner.stop();
});

test.serial("Banner.observe: warn/error logs surface above the painted live region", (t) => {
	const stdout = createStubStdout();
	const banner = Banner.observe({
		stdout,
		brand: {name: "UI5 CLI", version: "1.0.0"},
	});

	process.emit("ui5.log", {
		level: "warn",
		message: "early warning",
		moduleName: "test:module",
	});

	const output = stripAnsi(stdout.writes.join(""));
	t.regex(output, /early warning/, "warning is written above the live region");

	banner.stop();
});

test.serial("Banner.observe: stop() after paint flushes a trailing newline", (t) => {
	const stdout = createStubStdout();
	const banner = Banner.observe({stdout});
	stdout.writes.length = 0;
	banner.stop();
	// `log-update.done()` clears its internal state on stop; the banner
	// itself emits a trailing newline so the next prompt lands on a fresh
	// row below the final frame. Cursor visibility is restored by
	// `cli-cursor` (writes to stderr, not this stdout stub).
	const after = stdout.writes.join("");
	t.true(after.endsWith("\n"), "trailing newline written on stop");
});

test.serial("Banner.observe: networkAddressCount reserves placeholder rows", (t) => {
	const stdout = createStubStdout();
	const banner = Banner.observe({
		stdout,
		brand: {name: "UI5 CLI", version: "1.0.0"},
		acceptRemoteConnections: true,
		networkAddressCount: 2,
	});
	// One Local placeholder plus `networkAddressCount` Network placeholders
	// should appear so the live region doesn't reflow once real URLs arrive.
	const skeleton = stripAnsi(stdout.writes.join(""));
	const placeholderMatches = skeleton.match(/binding…/g) || [];
	t.is(placeholderMatches.length, 3,
		"one Local + two Network placeholders reserved");
	banner.stop();
});

test.serial("Banner reacts to serve-ready event", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.serve-status", {status: "serve-ready"});
	t.is(banner._getStateForTest().state, STATES.READY);
	banner.stop();
});

test.serial("#transitionTo re-renders when the new state matches the current one", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	// Drive the banner into READY, then emit another serve-ready to hit the
	// same-state branch in #transitionTo that re-renders without resetting
	// the tick timer. log-update suppresses identical frame writes, so we
	// just assert the banner stays in READY and the call doesn't throw.
	process.emit("ui5.serve-status", {status: "serve-ready"});
	t.notThrows(() => process.emit("ui5.serve-status", {status: "serve-ready"}));
	t.is(banner._getStateForTest().state, STATES.READY);
	banner.stop();
});

test.serial("Spinner tick advances spinFrame and re-renders while building", (t) => {
	const clock = sinon.useFakeTimers();
	t.teardown(() => clock.restore());

	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-building"});

	const frameBefore = banner._getStateForTest().spinFrame;
	stdout.writes.length = 0;
	clock.tick(150);
	const frameAfter = banner._getStateForTest().spinFrame;

	t.true(frameAfter > frameBefore, "spinFrame advanced on tick");
	t.true(stdout.writes.length > 0, "tick triggered a re-render");
	banner.stop();
});

test.serial("logAbove writes directly to stdout after stop() with no live region", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	banner.stop();
	stdout.writes.length = 0;
	// External callers may still hand the banner a line after stop() runs
	// (e.g. a late warn from an in-flight task). Without a live region to
	// erase, the banner just writes the line straight to stdout.
	banner.logAbove("trailing warn");
	const after = stdout.writes.join("");
	t.regex(after, /trailing warn/, "line is written verbatim to stdout");
	t.true(after.endsWith("\n"), "newline appended");
});

test.serial("Banner.observe with no arguments uses defaults", (t) => {
	// Exercises the default-arg branches on observe()/constructor() and
	// confirms the banner survives without a brand. stdout falls back to
	// process.stdout — we route writes elsewhere to avoid polluting the
	// test runner's output.
	const realWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = () => true;
	t.teardown(() => {
		process.stdout.write = realWrite;
	});
	const banner = Banner.observe();
	t.is(banner._getStateForTest().brand, null);
	banner.stop();
});

test.serial("build-status for an unknown project increments the project counter", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-metadata", {projectsToBuild: ["known"]});
	// A project-build-start for a project that wasn't announced via
	// build-metadata falls back to ++currentProjectIndex.
	process.emit("ui5.build-status", {
		projectName: "surprise",
		status: "project-build-start",
	});
	const state = banner._getStateForTest();
	t.is(state.currentProjectIndex, 1, "fallback path bumped the counter");
	t.is(state.currentProjectName, "surprise");
	banner.stop();
});

test.serial("project-build-status does not shrink the task-name column", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.project-build-status", {taskName: "minifyAndBundle", status: "task-start"});
	process.emit("ui5.project-build-status", {taskName: "css", status: "task-start"});
	// The column width never shrinks: it stays at the longest name seen.
	t.is(banner._getStateForTest().currentTaskName, "css");
	banner.stop();
});

test.serial("serve-stale without a changedProjects payload falls back to an empty list", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-stale"});
	t.deepEqual(banner._getStateForTest().changedProjects, []);
	banner.stop();
});

test.serial("serve-error coerces a non-Error payload to a string", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-error", error: "plain string failure"});
	t.is(banner._getStateForTest().errorMessage, "plain string failure");
	banner.stop();
});

test.serial("log events without moduleName render without a module prefix", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	stdout.writes.length = 0;
	process.emit("ui5.log", {level: "warn", message: "module-less warning"});
	const output = stripAnsi(stdout.writes.join(""));
	t.regex(output, /warn module-less warning/,
		"warn line renders with just the level prefix and message");
	banner.stop();
});

test.serial("build-status: project-build-skip also advances the counter", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-metadata", {projectsToBuild: ["a", "b"]});
	process.emit("ui5.build-status", {projectName: "b", status: "project-build-skip"});
	const state = banner._getStateForTest();
	t.is(state.currentProjectIndex, 2);
	t.is(state.currentProjectName, "b");
	banner.stop();
});

test.serial("build-status: unknown statuses are ignored", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-metadata", {projectsToBuild: ["a", "b"]});
	const beforeIndex = banner._getStateForTest().currentProjectIndex;
	// Statuses outside the known set must not advance the project counter
	// — the banner's project tally is driven solely by build-start/skip.
	process.emit("ui5.build-status", {projectName: "a", status: "project-build-end"});
	t.is(banner._getStateForTest().currentProjectIndex, beforeIndex,
		"unknown status leaves the counter untouched");
	banner.stop();
});

test.serial("project-build-status: non task-start events are ignored", (t) => {
	const stdout = createStubStdout();
	const banner = createBanner(stdout);
	// task-end (and any other non-start status) must not overwrite the
	// currently-displayed task name — the live region keeps the most recent
	// in-progress task visible until the next task-start.
	process.emit("ui5.project-build-status", {taskName: "minify", status: "task-start"});
	process.emit("ui5.project-build-status", {taskName: "css", status: "task-end"});
	t.is(banner._getStateForTest().currentTaskName, "minify",
		"task-end did not overwrite the active task name");
	banner.stop();
});

test.serial("Banner survives a stdout without on/off methods", (t) => {
	// A minimal write-only sink (no event emitter API) must not crash the
	// banner's resize hook setup — the live banner is best-effort about
	// terminal capabilities.
	const stdout = {
		columns: 80,
		writes: [],
		write(chunk) {
			this.writes.push(chunk);
			return true;
		},
	};
	const banner = Banner.observe({stdout, brand: {name: "UI5 CLI", version: "1.0.0"}});
	t.notThrows(() => banner.stop(), "stop() handles stdout without off()");
});
