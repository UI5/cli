import test from "ava";
import sinon from "sinon";
import {EventEmitter} from "node:events";
import stripAnsi from "strip-ansi";
import figures from "figures";

import InteractiveConsole from "../../../lib/writers/InteractiveConsole.js";
import {STATES} from "../../../lib/writers/interactiveConsole/state/build.js";

function createStubStderr() {
	const stub = new EventEmitter();
	stub.columns = 200;
	stub.writes = [];
	stub.write = (chunk) => {
		stub.writes.push(chunk);
		return true;
	};
	return stub;
}

// Build a writer wired to a stub stderr so tests can drive events without
// touching the real terminal. The writer is fully event-driven — tests emit
// process events to populate its regions.
function createWriter() {
	const stderr = createStubStderr();
	const writer = new InteractiveConsole({stderr});
	writer.enable();
	return {writer, stderr};
}

test.afterEach.always(() => {
	// Ensure a stray stop-console doesn't leak between tests.
	process.emit("ui5.log.stop-console");
});

test.serial("tool-info populates the header region", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.tool-info", {name: "UI5 CLI", version: "1.2.3"});

	const state = writer._getStateForTest();
	t.deepEqual(state.header.tool, {name: "UI5 CLI", version: "1.2.3"});

	writer.disable();
});

test.serial("project-resolved populates the project region", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.project-resolved", {
		name: "my.app",
		type: "application",
		version: "1.0.0",
		framework: {name: "SAPUI5", version: "1.150.0"},
	});

	const state = writer._getStateForTest();
	t.deepEqual(state.project.project, {name: "my.app", type: "application", version: "1.0.0"});
	t.deepEqual(state.project.framework, {name: "SAPUI5", version: "1.150.0"});

	writer.disable();
});

test.serial("duplicate project-resolved throws", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.project-resolved", {
		name: "my.app",
		type: "application",
		version: "1.0.0",
		framework: null,
	});

	// The writer's model is single-root-project. A second event means the
	// caller violated the invariant.
	t.throws(() => {
		process.emit("ui5.project-resolved", {
			name: "other.app",
			type: "application",
			version: "2.0.0",
			framework: null,
		});
	}, {
		message: /duplicate ui5\.project-resolved/,
	});

	writer.disable();
});

test.serial("server-listening populates the server region", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.server-listening", {
		urls: [
			{label: "Local", url: "http://localhost:8080"},
			{label: "Network", url: "http://192.168.1.5:8080"},
		],
		acceptRemoteConnections: true,
	});

	const state = writer._getStateForTest();
	t.is(state.server.urls.length, 2);
	t.is(state.server.urls[0].url, "http://localhost:8080");
	t.true(state.server.acceptRemoteConnections);

	writer.disable();
});

test.serial("build-metadata + build-status advance the build region", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.build-metadata", {projectsToBuild: ["proj1", "proj2"]});

	let state = writer._getStateForTest();
	t.is(state.build.totalProjects, 2);
	t.deepEqual(state.build.projectOrder, ["proj1", "proj2"]);

	process.emit("ui5.build-status", {projectName: "proj1", status: "project-build-start"});
	state = writer._getStateForTest();
	t.is(state.build.currentProjectIndex, 1);
	t.is(state.build.currentProjectName, "proj1");

	process.emit("ui5.build-status", {projectName: "proj2", status: "project-build-start"});
	state = writer._getStateForTest();
	t.is(state.build.currentProjectIndex, 2);
	t.is(state.build.currentProjectName, "proj2");

	writer.disable();
});

test.serial("serve-status: serve-ready transitions to READY", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.serve-status", {status: "serve-ready"});

	t.is(writer._getStateForTest().build.state, STATES.READY);
	writer.disable();
});

test.serial("serve-status: serve-building resets progress and transitions to BUILDING", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.build-metadata", {projectsToBuild: ["proj1"]});
	process.emit("ui5.build-status", {projectName: "proj1", status: "project-build-start"});
	process.emit("ui5.serve-status", {status: "serve-building"});

	const state = writer._getStateForTest();
	t.is(state.build.state, STATES.BUILDING);
	t.is(state.build.currentProjectIndex, 0, "counter reset for new build");
	t.is(state.build.currentProjectName, "", "project name cleared for new build");

	writer.disable();
});

test.serial("serve-status: serve-error transitions to ERROR and records message", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.serve-status", {
		status: "serve-error",
		error: new Error("Boom"),
	});

	const state = writer._getStateForTest();
	t.is(state.build.state, STATES.ERROR);
	t.is(state.build.errorMessage, "Boom");
	writer.disable();
});

test.serial("regions are order-tolerant — server before project", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.server-listening", {
		urls: [{label: "Local", url: "http://localhost:8080"}],
		acceptRemoteConnections: false,
	});
	process.emit("ui5.project-resolved", {
		name: "my.app", type: "application", version: "1.0.0", framework: null,
	});

	const state = writer._getStateForTest();
	t.truthy(state.server.urls);
	t.truthy(state.project.project);

	writer.disable();
});

test.serial("warn / error logs scroll above the live region", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.log", {
		level: "warn",
		message: "Something odd",
		moduleName: "my:module",
	});

	const output = stripAnsi(stderr.writes.join(""));
	t.regex(output, /warn my:module Something odd/);

	writer.disable();
});

test.serial("info logs logs scroll above the live region", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.log", {
		level: "info",
		message: "quiet info",
		moduleName: "my:module",
	});

	const output = stripAnsi(stderr.writes.join(""));
	t.regex(output, /quiet info/);

	writer.disable();
});

test.serial("info logs from ProjectBuilder are suppressed (banner-redundant)", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.log", {
		level: "info",
		message: "Preparing build for projects",
		moduleName: "ProjectBuilder",
	});

	const output = stripAnsi(stderr.writes.join(""));
	t.notRegex(output, /Preparing build for projects/,
		"ProjectBuilder info line does not scroll above the live region");

	writer.disable();
});

test.serial("non-info logs from ProjectBuilder still scroll above the live region", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.log", {
		level: "warn",
		message: "Build warning",
		moduleName: "ProjectBuilder",
	});
	process.emit("ui5.log", {
		level: "error",
		message: "Build failed",
		moduleName: "ProjectBuilder",
	});

	const output = stripAnsi(stderr.writes.join(""));
	t.regex(output, /Build warning/);
	t.regex(output, /Build failed/);

	writer.disable();
});

test.serial("build-metadata a second time resets and continues (rebuild)", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.build-metadata", {projectsToBuild: ["proj1", "proj2"]});
	process.emit("ui5.build-status", {projectName: "proj1", status: "project-build-start"});

	process.emit("ui5.build-metadata", {projectsToBuild: ["projA"]});

	const state = writer._getStateForTest();
	t.deepEqual(state.build.projectOrder, ["projA"]);
	t.is(state.build.totalProjects, 1);
	t.is(state.build.currentProjectIndex, 0, "reset for rebuild");
	t.is(state.build.currentProjectName, "", "cleared for rebuild");

	writer.disable();
});

test.serial("enable() emits ui5.log.stop-console to displace prior writer", (t) => {
	const stopHandler = sinon.stub();
	process.on("ui5.log.stop-console", stopHandler);

	const stderr = createStubStderr();
	const writer = new InteractiveConsole({stderr});
	writer.enable();

	t.true(stopHandler.callCount >= 1, "stop-console emitted on enable");

	process.off("ui5.log.stop-console", stopHandler);
	writer.disable();
});

test.serial("frame includes visible content for each populated region", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.tool-info", {name: "UI5 CLI", version: "1.2.3"});
	process.emit("ui5.project-resolved", {
		name: "my.app", type: "application", version: "1.0.0",
		framework: {name: "SAPUI5", version: "1.150.0"},
	});
	process.emit("ui5.server-listening", {
		urls: [{label: "Local", url: "http://localhost:8080"}],
		acceptRemoteConnections: false,
	});
	process.emit("ui5.serve-status", {status: "serve-ready"});

	const output = stripAnsi(stderr.writes.join(""));
	t.regex(output, /UI5 CLI v1\.2\.3/);
	t.regex(output, /Project\s+my\.app/);
	t.regex(output, /Framework\s+SAPUI5 1\.150\.0/);
	t.regex(output, /Local:\s+http:\/\/localhost:8080/);
	t.regex(output, new RegExp(`Status\\s+${figures.bullet}\\s+ready`));

	writer.disable();
});

test.serial("tool-mode 'serve' enables placeholders for project, server, and status regions", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.tool-info", {name: "UI5 CLI", version: "1.2.3"});
	process.emit("ui5.tool-mode", {mode: "serve", acceptRemoteConnections: false});

	const output = stripAnsi(stderr.writes.join(""));
	t.regex(output, /UI5 CLI v1\.2\.3/, "header rendered");
	t.regex(output, /Project\s+resolving…/, "project placeholder rendered");
	t.notRegex(output, /Framework/, "framework row is not reserved in placeholder mode");
	t.regex(output, /Local:\s+binding…/, "server local placeholder rendered");
	t.regex(output, /Network:\s+use --accept-remote-connections to expose/,
		"network hint rendered when the flag isn't set");
	t.regex(output, /Status\s+.+?\s+starting/, "status starting placeholder rendered");

	const state = writer._getStateForTest();
	t.true(state.project.showPlaceholders);
	t.true(state.server.showPlaceholders);
	t.is(state.build.state, STATES.STARTING);

	writer.disable();
});

test.serial("tool-mode 'serve' with acceptRemoteConnections shows a Network placeholder", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.tool-info", {name: "UI5 CLI", version: "1.2.3"});
	process.emit("ui5.tool-mode", {
		mode: "serve",
		acceptRemoteConnections: true,
	});

	const output = stripAnsi(stderr.writes.join(""));
	// One Local placeholder + one Network placeholder
	const bindingCount = (output.match(/binding…/g) || []).length;
	t.is(bindingCount, 2, "one Local placeholder + one Network placeholder");
	t.regex(output, /accepting connections from all hosts/,
		"remote-connections warning rendered up front");

	writer.disable();
});

test.serial("tool-mode 'serve' placeholders are replaced by real data", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.tool-info", {name: "UI5 CLI", version: "1.2.3"});
	process.emit("ui5.tool-mode", {mode: "serve", acceptRemoteConnections: false});

	const midOutput = stripAnsi(stderr.writes.join(""));
	t.regex(midOutput, /resolving…/, "placeholders visible before real data");
	t.regex(midOutput, /binding…/);
	t.regex(midOutput, /starting/);

	process.emit("ui5.project-resolved", {
		name: "my.app", type: "application", version: "1.0.0",
		framework: {name: "SAPUI5", version: "1.150.0"},
	});
	process.emit("ui5.server-listening", {
		urls: [{label: "Local", url: "http://localhost:8080"}],
		acceptRemoteConnections: false,
	});
	process.emit("ui5.serve-status", {status: "serve-ready"});

	// State reflects real data now — the placeholder rendering path is gone.
	const state = writer._getStateForTest();
	t.deepEqual(state.project.project, {name: "my.app", type: "application", version: "1.0.0"});
	t.truthy(state.server.urls);
	t.is(state.build.state, STATES.READY);

	writer.disable();
});

test.serial("tool-mode with an unknown mode is ignored", (t) => {
	const {writer} = createWriter();

	process.emit("ui5.tool-mode", {mode: "future-mode"});

	const state = writer._getStateForTest();
	t.false(state.project.showPlaceholders);
	t.false(state.server.showPlaceholders);
	t.is(state.build.state, STATES.INITIAL);

	writer.disable();
});

test.serial("region blocks are separated by a blank line in the composed frame", async (t) => {
	const [
		{renderHeaderRegion, renderProjectRegion, renderServerRegion, renderBuildRegion},
		{createHeaderState, setTool},
		{createProjectState, setProject},
		{createServerState, setListening},
		{createBuildState, transitionTo, STATES: BUILD_STATES},
	] = await Promise.all([
		import("../../../lib/writers/interactiveConsole/render.js"),
		import("../../../lib/writers/interactiveConsole/state/header.js"),
		import("../../../lib/writers/interactiveConsole/state/project.js"),
		import("../../../lib/writers/interactiveConsole/state/server.js"),
		import("../../../lib/writers/interactiveConsole/state/build.js"),
	]);

	const header = createHeaderState();
	setTool(header, {name: "UI5 CLI", version: "1.2.3"});
	const project = createProjectState();
	setProject(project, {
		name: "my.app", type: "application", version: "1.0.0", framework: null,
	});
	const server = createServerState();
	setListening(server, {
		urls: [{label: "Local", url: "http://localhost:8080"}],
		acceptRemoteConnections: false,
	});
	const build = createBuildState();
	transitionTo(build, BUILD_STATES.READY);

	const frame = stripAnsi([
		...renderHeaderRegion(header),
		...renderProjectRegion(project),
		...renderServerRegion(server),
		...renderBuildRegion(build),
	].join("\n"));

	// Blank line between header (UI5 CLI …) and project block
	t.regex(frame, /UI5 CLI v1\.2\.3\n\nProject/);
	// No framework configured: the Framework row is omitted entirely. The
	// Project block is just the Project line, followed by the blank
	// separator before the server block.
	t.regex(frame, /Project\s+my\.app.*\n\n.*Local:/);
	t.notRegex(frame, /Framework/, "no Framework label when framework is null");
	t.notRegex(frame, /\(none\)/, "no '(none)' placeholder when framework is null");
	// Blank line between server block and status
	t.regex(frame, /Network:.*\n\nStatus/);
});

test.serial("static init() returns an enabled writer", (t) => {
	const stopHandler = sinon.stub();
	process.on("ui5.log.stop-console", stopHandler);
	// init() constructs against the real process.stderr, which would spew ANSI
	// escapes into the AVA runner. Stub the underlying writes for the duration
	// of the test.
	const origStdout = process.stdout.write;
	const origStderr = process.stderr.write;
	process.stdout.write = () => true;
	process.stderr.write = () => true;
	t.teardown(() => {
		process.stdout.write = origStdout;
		process.stderr.write = origStderr;
	});

	const writer = InteractiveConsole.init();
	t.true(stopHandler.callCount >= 1, "init() displaces any prior writer");
	process.off("ui5.log.stop-console", stopHandler);
	writer.disable();
});

test.serial("static stop() emits ui5.log.stop-console", (t) => {
	const stopHandler = sinon.stub();
	process.on("ui5.log.stop-console", stopHandler);
	InteractiveConsole.stop();
	t.is(stopHandler.callCount, 1, "stop() emits the shutdown event once");
	process.off("ui5.log.stop-console", stopHandler);
});

test.serial("disable() is idempotent", (t) => {
	const {writer} = createWriter();
	writer.disable();
	t.notThrows(() => writer.disable(), "second disable() is a no-op");
});

test.serial("disable() flushes a trailing newline", (t) => {
	const {writer, stderr} = createWriter();
	stderr.writes.length = 0;
	writer.disable();
	// log-update.done() clears its own state on stop; the writer itself emits
	// a trailing newline so the next prompt lands on a fresh row below the
	// final frame.
	const trailing = stderr.writes.join("");
	t.true(trailing.endsWith("\n"), "trailing newline written on stop");
});

test.serial("logAbove: after disable() writes directly to stderr", (t) => {
	const {writer, stderr} = createWriter();
	writer.disable();
	stderr.writes.length = 0;
	writer.logAbove("trailing warn");
	const after = stderr.writes.join("");
	t.regex(after, /trailing warn/, "line is written verbatim");
	t.true(after.endsWith("\n"), "newline appended");
});

test.serial("resize handler re-renders the status line", (t) => {
	const {writer, stderr} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-ready"});
	stderr.writes.length = 0;

	stderr.columns = 40;
	stderr.emit("resize");

	const after = stripAnsi(stderr.writes.join(""));
	t.regex(after, /Status/, "resize triggers a status line re-render");
	writer.disable();
});

test.serial("writer survives a stderr without on/off methods", (t) => {
	// A minimal write-only sink (no event emitter API) must not crash the
	// writer's resize hook setup — the live region is best-effort about
	// terminal capabilities.
	const stderr = {
		columns: 80,
		writes: [],
		write(chunk) {
			this.writes.push(chunk);
			return true;
		},
	};
	const writer = new InteractiveConsole({stderr});
	writer.enable();
	t.notThrows(() => writer.disable(), "disable() handles stderr without off()");
});

test.serial("serve-status: same state re-renders without resetting the tick timer", (t) => {
	// Drive the writer into READY, then emit another serve-ready to hit the
	// same-state branch in #transitionTo that re-renders without resetting
	// the tick timer.
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-ready"});
	t.notThrows(() => process.emit("ui5.serve-status", {status: "serve-ready"}));
	t.is(writer._getStateForTest().build.state, STATES.READY);
	writer.disable();
});

test.serial("serve-status: serve-build-done sets lastBuildHrtime + returns to READY", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-building"});
	t.is(writer._getStateForTest().build.state, STATES.BUILDING);
	process.emit("ui5.serve-status", {status: "serve-build-done", hrtime: [1, 500_000_000]});
	const state = writer._getStateForTest().build;
	t.is(state.state, STATES.READY);
	t.deepEqual(state.lastBuildHrtime, [1, 500_000_000]);
	writer.disable();
});

test.serial("serve-status: serve-build-done without a valid hrtime records null", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-build-done"});
	t.is(writer._getStateForTest().build.lastBuildHrtime, null);
	writer.disable();
});

test.serial("serve-status: serve-stale records changedProjects without a state transition", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-ready"});
	process.emit("ui5.serve-status", {status: "serve-stale", changedProjects: ["my.app"]});
	const state = writer._getStateForTest().build;
	t.is(state.state, STATES.READY, "the stale report does not change the activity state");
	t.deepEqual(state.changedProjects, ["my.app"]);
	writer.disable();
});

test.serial("serve-status: serve-stale without a payload falls back to an empty list", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-stale"});
	t.deepEqual(writer._getStateForTest().build.changedProjects, []);
	writer.disable();
});

test.serial("serve-status: serve-settling records pendingProjects and transitions to SETTLING", (t) => {
	const {writer, stderr} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-settling", pendingProjects: ["my.app"]});
	const state = writer._getStateForTest().build;
	t.is(state.state, STATES.SETTLING);
	t.deepEqual(state.pendingProjects, ["my.app"]);
	const tail = stripAnsi(stderr.writes.slice(-5).join(""));
	t.regex(tail, /settling/);
	writer.disable();
});

test.serial("serve-status: serve-settling without a payload falls back to an empty list", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-settling"});
	t.deepEqual(writer._getStateForTest().build.pendingProjects, []);
	writer.disable();
});

test.serial("serve-status: serve-validating records projects and transitions to VALIDATING", (t) => {
	const {writer, stderr} = createWriter();
	process.emit("ui5.serve-status", {
		status: "serve-validating",
		validatingProjects: ["library.a", "library.b"],
	});
	const state = writer._getStateForTest().build;
	t.is(state.state, STATES.VALIDATING);
	t.deepEqual(state.validatingProjects, ["library.a", "library.b"]);
	const tail = stripAnsi(stderr.writes.slice(-5).join(""));
	t.regex(tail, /validating/);
	writer.disable();
});

test.serial("serve-status: serve-validating without a payload falls back to an empty list", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-validating"});
	t.deepEqual(writer._getStateForTest().build.validatingProjects, []);
	writer.disable();
});

test.serial("serve-status: transitions away from VALIDATING clear validatingProjects", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {
		status: "serve-validating",
		validatingProjects: ["library.a"],
	});
	t.deepEqual(writer._getStateForTest().build.validatingProjects, ["library.a"]);
	process.emit("ui5.serve-status", {status: "serve-ready"});
	t.deepEqual(writer._getStateForTest().build.validatingProjects, [],
		"validatingProjects cleared on transition away from VALIDATING");
	writer.disable();
});

test.serial("serve-status: serve-error coerces a non-Error payload to a string", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-error", error: "plain string failure"});
	t.is(writer._getStateForTest().build.errorMessage, "plain string failure");
	writer.disable();
});

test.serial("serve-status: serve-error does not echo the error via logAbove", (t) => {
	const {writer, stderr} = createWriter();
	const err = new Error("boom");
	err.stack = "Error: boom\n    at <anonymous>";
	process.emit("ui5.serve-status", {status: "serve-error", error: err});
	// The writer intentionally does NOT echo the error via logAbove —
	// BuildServer's own log.error and the yargs fail-handler already render
	// the message and stack trace.
	const output = stripAnsi(stderr.writes.join(""));
	t.notRegex(output, /at <anonymous>/, "stack trace is not duplicated via logAbove");
	writer.disable();
});

test.serial("log events without moduleName render without a module prefix", (t) => {
	const {writer, stderr} = createWriter();
	stderr.writes.length = 0;
	process.emit("ui5.log", {level: "warn", message: "module-less warning"});
	const output = stripAnsi(stderr.writes.join(""));
	t.regex(output, /warn module-less warning/,
		"warn line renders with just the level prefix and message");
	writer.disable();
});

test.serial("log events are suppressed when Logger level filters them out", async (t) => {
	const {default: Logger} = await import("../../../lib/loggers/Logger.js");
	const previousLevel = Logger.getLevel();
	Logger.setLevel("error");
	t.teardown(() => Logger.setLevel(previousLevel));

	const {writer, stderr} = createWriter();
	stderr.writes.length = 0;

	process.emit("ui5.log", {level: "warn", message: "Filtered warning"});
	const afterWarn = stripAnsi(stderr.writes.join(""));
	t.notRegex(afterWarn, /Filtered warning/, "warn is suppressed when log level is error");

	process.emit("ui5.log", {level: "error", message: "Real failure"});
	const afterError = stripAnsi(stderr.writes.join(""));
	t.regex(afterError, /Real failure/, "error still passes through");

	writer.disable();
});

test.serial("build-status: project-build-skip also advances the counter", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.build-metadata", {projectsToBuild: ["a", "b"]});
	process.emit("ui5.build-status", {projectName: "b", status: "project-build-skip"});
	const state = writer._getStateForTest().build;
	t.is(state.currentProjectIndex, 2);
	t.is(state.currentProjectName, "b");
	writer.disable();
});

test.serial("build-status: unknown statuses are ignored", (t) => {
	const {writer} = createWriter();
	process.emit("ui5.build-metadata", {projectsToBuild: ["a", "b"]});
	const beforeIndex = writer._getStateForTest().build.currentProjectIndex;
	// Statuses outside the known set must not advance the project counter
	// — the writer's project tally is driven solely by build-start/skip.
	process.emit("ui5.build-status", {projectName: "a", status: "project-build-end"});
	t.is(writer._getStateForTest().build.currentProjectIndex, beforeIndex,
		"unknown status leaves the counter untouched");
	writer.disable();
});

test.serial("project-build-status: non task-start events are ignored", (t) => {
	const {writer} = createWriter();
	// task-end (and any other non-start status) must not overwrite the
	// currently-displayed task name — the live region keeps the most recent
	// in-progress task visible until the next task-start.
	process.emit("ui5.project-build-status", {taskName: "minify", status: "task-start"});
	process.emit("ui5.project-build-status", {taskName: "css", status: "task-end"});
	t.is(writer._getStateForTest().build.currentTaskName, "minify",
		"task-end did not overwrite the active task name");
	writer.disable();
});

test.serial("spinner tick advances spinFrame while BUILDING", (t) => {
	const clock = sinon.useFakeTimers();
	t.teardown(() => clock.restore());

	const {writer, stderr} = createWriter();
	process.emit("ui5.serve-status", {status: "serve-building"});
	const frameBefore = writer._getStateForTest().build.spinFrame;
	stderr.writes.length = 0;
	clock.tick(150);
	const frameAfter = writer._getStateForTest().build.spinFrame;
	t.true(frameAfter > frameBefore, "spinFrame advanced on tick");
	t.true(stderr.writes.length > 0, "tick triggered a re-render");
	writer.disable();
});

test.serial("spinner tick advances spinFrame while VALIDATING", (t) => {
	const clock = sinon.useFakeTimers();
	t.teardown(() => clock.restore());

	const {writer, stderr} = createWriter();
	process.emit("ui5.serve-status", {
		status: "serve-validating",
		validatingProjects: ["library.a"],
	});
	const frameBefore = writer._getStateForTest().build.spinFrame;
	stderr.writes.length = 0;
	clock.tick(150);
	const frameAfter = writer._getStateForTest().build.spinFrame;
	t.true(frameAfter > frameBefore, "spinFrame advanced on tick");
	t.true(stderr.writes.length > 0, "tick triggered a re-render");
	writer.disable();
});


// ---- process.stdout / process.stderr interception ---------------------------
// InteractiveConsole replaces process.stdout.write / process.stderr.write while
// active so writes that bypass @ui5/logger (custom tasks, third-party libs) get
// routed through logAbove() instead of corrupting the live region. These tests
// exercise that path against the real process streams — with the real writes
// stubbed out to keep the test runner's stdout quiet.

function stubProcessStreams(t) {
	const stdoutWrites = [];
	const stderrWrites = [];
	const trueOrigStdout = process.stdout.write;
	const trueOrigStderr = process.stderr.write;
	process.stdout.write = (chunk) => {
		stdoutWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	};
	process.stderr.write = (chunk) => {
		stderrWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	};
	// `origStdout`/`origStderr` reference the STUBS — that's what the writer
	// captured on install, and therefore what should be restored on stop.
	const origStdout = process.stdout.write;
	const origStderr = process.stderr.write;
	t.teardown(() => {
		process.stdout.write = trueOrigStdout;
		process.stderr.write = trueOrigStderr;
	});
	return {stdoutWrites, stderrWrites, origStdout, origStderr};
}

test.serial("intercepts direct process.stderr.write and routes lines above the live region", (t) => {
	const {stderrWrites, origStderr} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	// The intercepted stream must NOT be the raw original — the wrapper the
	// writer installed sits on top.
	t.not(process.stderr.write, origStderr, "process.stderr.write is wrapped");

	process.stderr.write("boom\n");

	const output = stripAnsi(stderrWrites.join(""));
	t.regex(output, /boom/, "line written directly to stderr surfaces via logAbove");
	writer.disable();
	t.is(process.stderr.write, origStderr, "process.stderr.write is restored on disable");
});

test.serial("intercepts direct process.stdout.write too", (t) => {
	const {stderrWrites, origStdout} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	t.not(process.stdout.write, origStdout, "process.stdout.write is wrapped");

	// A custom task that writes to stdout is just as bad for the live region
	// as one writing to stderr — same TTY, same cursor.
	process.stdout.write("stdout line\n");

	const output = stripAnsi(stderrWrites.join(""));
	t.regex(output, /stdout line/, "line written directly to stdout surfaces via logAbove");
	writer.disable();
	t.is(process.stdout.write, origStdout, "process.stdout.write is restored on disable");
});

test.serial("joins split-chunk writes into a single logged line", (t) => {
	const {stderrWrites} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	stderrWrites.length = 0;

	// A single logical "foobar" line delivered as two chunks — a naive
	// per-chunk logAbove call would emit two separate lines and desync the
	// live region. The writer must buffer until the newline arrives.
	process.stderr.write("foo");
	process.stderr.write("bar\n");

	const output = stripAnsi(stderrWrites.join(""));
	t.regex(output, /foobar/, "split chunks are joined at the newline");
	writer.disable();
});

test.serial("disable() flushes a buffered partial line", (t) => {
	const {stderrWrites} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	stderrWrites.length = 0;

	// No trailing newline — the fragment stays buffered until disable()
	// flushes it. Without the flush the message would be lost entirely.
	process.stderr.write("dangling fragment");
	writer.disable();

	const output = stripAnsi(stderrWrites.join(""));
	t.regex(output, /dangling fragment/, "partial line flushed on disable");
});

test.serial("interceptor invokes the write() callback asynchronously", async (t) => {
	stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();

	// stream.write(chunk, callback) contract: callback fires once the write
	// drains. Our sink is synchronous, but the callback must still be async
	// so the caller doesn't observe recursion inside its own write() call.
	const observedDuringCall = await new Promise((resolve) => {
		let calledSync = false;
		process.stderr.write("cb line\n", () => {
			resolve(calledSync);
		});
		calledSync = true;
	});
	t.true(observedDuringCall, "callback fires after the write() call returns");
	writer.disable();
});

test.serial("interceptor handles Buffer chunks with an explicit encoding", (t) => {
	const {stderrWrites} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	stderrWrites.length = 0;

	process.stderr.write(Buffer.from("buffered line\n", "utf8"), "utf8");

	const output = stripAnsi(stderrWrites.join(""));
	t.regex(output, /buffered line/, "buffer chunk decoded and surfaced");
	writer.disable();
});

test.serial("interceptor handles Buffer chunks with an encoding + callback", (t) => {
	const {stderrWrites} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	stderrWrites.length = 0;

	// Exercises the encoding argument branch AND the callback argument branch
	// of write(chunk, encoding, callback) at the same time.
	return new Promise((resolve) => {
		process.stderr.write(Buffer.from("cb+enc\n", "utf8"), "utf8", () => {
			const output = stripAnsi(stderrWrites.join(""));
			t.regex(output, /cb\+enc/);
			writer.disable();
			resolve();
		});
	});
});

test.serial("interceptor handles Uint8Array chunks that are not Buffer instances", (t) => {
	const {stderrWrites} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	stderrWrites.length = 0;

	// A plain Uint8Array trips the final fallback branch — neither a string
	// nor a Buffer — via `Buffer.from(chunk).toString(encoding)`.
	const arr = new Uint8Array([104, 105, 10]); // "hi\n"
	process.stderr.write(arr);

	const output = stripAnsi(stderrWrites.join(""));
	t.regex(output, /hi/, "Uint8Array chunk decoded and surfaced");
	writer.disable();
});

test.serial("does not intercept when a non-process stderr is supplied", (t) => {
	// The interceptor is gated on stderr === process.stderr — the vast
	// majority of unit tests pass a stub stderr and must not have process.*
	// yanked out from under them.
	const {origStderr, origStdout} = stubProcessStreams(t);
	const {writer} = createWriter();
	t.is(process.stderr.write, origStderr,
		"stderr.write is untouched when a stub stderr is used");
	t.is(process.stdout.write, origStdout,
		"stdout.write is untouched when a stub stderr is used");
	writer.disable();
});

test.serial("stopped writer forwards intercepted writes to the original stream", (t) => {
	const {stderrWrites, origStderr} = stubProcessStreams(t);
	const writer = new InteractiveConsole();
	writer.enable();
	const wrapper = process.stderr.write;
	// Manually flip the writer into #stopped without going through disable(),
	// which would restore process.stderr. That leaves the wrapper installed —
	// exactly the state where the "stopped" branch inside the wrapper must
	// short-circuit straight to the original stub.
	writer.disable();
	// Put the wrapper back in place so we can drive it while #stopped is true.
	process.stderr.write = wrapper;
	stderrWrites.length = 0;
	process.stderr.write("late byte\n");
	const output = stderrWrites.join("");
	t.true(output.includes("late byte\n"),
		"intercepted write short-circuits to the underlying stream when stopped");
	// Restore the real (stubbed) write before teardown.
	process.stderr.write = origStderr;
});

test.serial("enable() reuses an existing log-update instance across disable+enable", (t) => {
	// disable() doesn't destroy log-update — a re-enable simply continues to
	// write against the same instance. This test covers the `#logUpdate` truthy
	// branch of the initializer.
	const stderr = createStubStderr();
	const writer = new InteractiveConsole({stderr});
	writer.enable();
	writer.disable();
	t.notThrows(() => writer.enable(), "second enable() succeeds without re-initialising log-update");
	writer.disable();
});

test.serial("spinner tick timer without unref support is left as-is", (t) => {
	// Node returns Timeout objects with an unref() method; some polyfills and
	// runtimes don't. The writer must survive that shape — it doesn't rely on
	// unref for correctness, only for not blocking process exit.
	const origSetInterval = globalThis.setInterval;
	globalThis.setInterval = (fn, ms) => {
		const timer = origSetInterval(fn, ms);
		// Shadow the inherited `unref` with a non-function so the writer's
		// `typeof … === "function"` guard takes the fallback path.
		timer.unref = undefined;
		return timer;
	};
	t.teardown(() => {
		globalThis.setInterval = origSetInterval;
	});

	const {writer} = createWriter();
	// Enter BUILDING to install the tick timer.
	t.notThrows(() => process.emit("ui5.serve-status", {status: "serve-building"}),
		"writer survives an unref-less timer");
	writer.disable();
});

test.serial("ui5.log.stop-console handler calls disable() on the active writer", (t) => {
	// When another writer emits ui5.log.stop-console to claim the terminal, the
	// active writer's own listener must invoke disable() so it detaches all
	// event listeners and restores process.stdout/stderr.
	const {stderr} = createWriter();
	stderr.writes.length = 0;

	process.emit("ui5.log.stop-console");

	// A disabled writer no longer reacts to events — verify by emitting one
	// that would normally scroll a line above the frame.
	stderr.writes.length = 0;
	process.emit("ui5.log", {level: "warn", message: "post-stop warn"});
	const output = stripAnsi(stderr.writes.join(""));
	t.notRegex(output, /post-stop warn/, "listeners are detached after the stop-console handler");
});
