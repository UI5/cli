import test from "ava";
import sinon from "sinon";
import {EventEmitter} from "node:events";
import stripAnsi from "strip-ansi";
import process from "node:process";

import InteractiveConsole from "../../../lib/writers/InteractiveConsole.js";
import {renderInspectRegion} from "../../../lib/writers/interactiveConsole/render.js";
import {WAVE_GAP_MS} from "../../../lib/writers/interactiveConsole/state/inspect.js";

// Writer-level tests for the opt-in inspect waterfall. The writer reads UI5_CLI_INSPECT in its
// constructor, so each test toggles the env var before constructing and restores it after.

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

function createWriter({inspect} = {}) {
	const previous = process.env.UI5_CLI_INSPECT;
	if (inspect) {
		process.env.UI5_CLI_INSPECT = "true";
	} else {
		delete process.env.UI5_CLI_INSPECT;
	}
	const stderr = createStubStderr();
	const writer = new InteractiveConsole({stderr});
	writer.enable();
	// Restore immediately: the constructor has already captured the flag.
	if (previous === undefined) {
		delete process.env.UI5_CLI_INSPECT;
	} else {
		process.env.UI5_CLI_INSPECT = previous;
	}
	return {writer, stderr};
}

const hr = (ms) => [Math.floor(ms / 1000), (ms % 1000) * 1e6];

test.afterEach.always(() => {
	process.emit("ui5.log.stop-console");
});

test.serial("inspect: serve-request events populate the inspect state and render the waterfall", (t) => {
	const {writer, stderr} = createWriter({inspect: true});

	// The writer stamps its render clock from the live process.hrtime(), so a rendered row only
	// exists while the request sits inside the rolling window. Emit on the live clock so the request
	// is recent relative to the render that follows.
	process.emit("ui5.serve-request", {
		id: 1, phase: "start", path: "/resources/sap/m/Button.js",
		projects: [{name: "sap.m", state: "building"}], hrtime: process.hrtime(),
	});
	process.emit("ui5.serve-request", {
		id: 1, phase: "end", hrtime: process.hrtime(), resolvedProject: "sap.m", found: true,
	});

	const {inspect} = writer._getStateForTest();
	t.is(inspect.requests.length, 1);
	t.is(inspect.requests[0].resolvedProject, "sap.m");
	t.true(inspect.requests[0].endMs > 0, "the request is closed with an end timestamp");

	const out = stripAnsi(stderr.writes.join(""));
	t.regex(out, /Inspect\s+requests and dependency builds/);
	t.regex(out, /sap\.m\s+\(cached\)/, "a resolved request served from a warm cache reads as cached");

	writer.disable();
});

test.serial("inspect: a build cycle is recorded for build-cause correlation", (t) => {
	const {writer} = createWriter({inspect: true});

	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-status", {
		status: "project-build-skip", projectName: "sap.ui.core",
	});
	process.emit("ui5.project-build-status", {
		status: "task-start", projectName: "sap.m", taskName: "minify",
	});
	process.emit("ui5.serve-status", {
		status: "serve-build-done", hrtime: [0, 800e6], builtProjects: ["sap.m"],
	});

	const {inspect} = writer._getStateForTest();
	t.is(inspect.builds.length, 1);
	t.not(inspect.builds[0].endMs, null, "the cycle is closed");
	t.deepEqual(inspect.builds[0].durationHr, [0, 800e6]);
	t.deepEqual(inspect.builds[0].projects, ["sap.m"]);

	writer.disable();
});

test.serial("inspect: task execution marks a project built after its request has ended", (t) => {
	const {writer, stderr} = createWriter({inspect: true});
	const requestStart = process.hrtime();

	for (const [id, projectName] of [[1, "sap.ui.core"], [2, "sap.m"]]) {
		process.emit("ui5.serve-request", {
			id, phase: "start", path: `/resources/${projectName}/resource.js`,
			projects: [{name: projectName, state: "building"}], hrtime: requestStart,
		});
	}

	// BuildServer enters both project pipelines. Every sap.ui.core task stage is a cache hit, while
	// sap.m executes a task. The request responses arrive before BuildServer reports the cycle duration.
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-status", {
		status: "project-build-start", projectName: "sap.ui.core",
	});
	process.emit("ui5.project-build-status", {
		status: "task-skip", projectName: "sap.ui.core", taskName: "minify",
	});
	process.emit("ui5.build-status", {
		status: "project-build-end", projectName: "sap.ui.core",
	});
	process.emit("ui5.build-status", {
		status: "project-build-start", projectName: "sap.m",
	});
	process.emit("ui5.project-build-status", {
		status: "task-start", projectName: "sap.m", taskName: "minify",
	});
	process.emit("ui5.build-status", {
		status: "project-build-end", projectName: "sap.m",
	});

	for (const [id, projectName] of [[1, "sap.ui.core"], [2, "sap.m"]]) {
		process.emit("ui5.serve-request", {
			id, phase: "end", hrtime: process.hrtime(), resolvedProject: projectName, found: true,
		});
	}
	const beforeBuildDone = renderInspectRegion(
		writer._getStateForTest().inspect, stderr.columns).map(stripAnsi).join("\n");
	t.regex(beforeBuildDone, /sap\.m\s+\(cached\)/,
		"the completed request has no duration until serve-build-done arrives");
	process.emit("ui5.serve-status", {
		status: "serve-build-done", hrtime: [0, 11e6],
		builtProjects: ["sap.ui.core", "sap.m"],
	});

	const {inspect} = writer._getStateForTest();
	t.deepEqual(inspect.builds[0].projects, ["sap.m"],
		"the cycle contains only the project that executed a task");
	const out = renderInspectRegion(inspect, stderr.columns).map(stripAnsi).join("\n");
	t.regex(out, /sap\.ui\.core\s+\(cached\)/,
		"a dependency whose tasks were cache hits stays cached");
	t.regex(out, /sap\.m\s+\(built 11 ms\)/);

	writer.disable();
});

test.serial("inspect: attributes a build to a project requested later in the same wave", (t) => {
	const {writer, stderr} = createWriter({inspect: true});

	// An early bootstrap request triggers a build that includes sap.m. The browser asks for sap.m
	// resources only after the cycle has completed, but all requests are part of the same page load.
	process.emit("ui5.serve-request", {
		id: 1, phase: "start", path: "/resources/sap-ui-core.js",
		projects: [{name: "sap.ui.documentation", state: "building"}], hrtime: process.hrtime(),
	});
	process.emit("ui5.serve-status", {status: "serve-building"});
	process.emit("ui5.build-status", {
		status: "project-build-start", projectName: "sap.ui.core",
	});
	process.emit("ui5.project-build-status", {
		status: "task-skip", projectName: "sap.ui.core", taskName: "minify",
	});
	process.emit("ui5.build-status", {
		status: "project-build-start", projectName: "sap.m",
	});
	process.emit("ui5.project-build-status", {
		status: "task-start", projectName: "sap.m", taskName: "minify",
	});
	process.emit("ui5.serve-request", {
		id: 1, phase: "end", hrtime: process.hrtime(),
		resolvedProject: "sap.ui.documentation", found: true,
	});
	process.emit("ui5.serve-status", {
		status: "serve-build-done", hrtime: [0, 36e6],
		builtProjects: ["sap.ui.core", "sap.m"],
	});
	const afterDependencyBuild = renderInspectRegion(
		writer._getStateForTest().inspect, stderr.columns).map(stripAnsi).join("\n");
	t.regex(afterDependencyBuild, /sap\.m\s+\(dependency built 36 ms\)/,
		"build work is visible before a direct request creates a sap.m reader row");

	for (const [id, projectName] of [[2, "sap.ui.core"], [3, "sap.m"]]) {
		process.emit("ui5.serve-request", {
			id, phase: "start", path: `/resources/${projectName}/resource.js`,
			projects: [{name: projectName, state: "fresh"}], hrtime: process.hrtime(),
		});
		process.emit("ui5.serve-request", {
			id, phase: "end", hrtime: process.hrtime(), resolvedProject: projectName, found: true,
		});
	}

	const {inspect} = writer._getStateForTest();
	const out = renderInspectRegion(inspect, stderr.columns).map(stripAnsi).join("\n");
	t.regex(out, /sap\.ui\.core\s+\(cached\)/);
	t.regex(out, /sap\.m\s+\(built 36 ms\)/,
		"sap.m keeps the build attribution even though its requests followed the cycle");

	writer.disable();
});

test.serial("inspect: disabled by default - no listener, no region", (t) => {
	const {writer, stderr} = createWriter({inspect: false});

	process.emit("ui5.serve-request", {
		id: 1, phase: "start", path: "/resources/sap/m/Button.js",
		projects: [{name: "sap.m", state: "building"}], hrtime: hr(0),
	});
	// Trigger a render so any region would show up.
	process.emit("ui5.serve-status", {status: "serve-ready"});

	const {inspect} = writer._getStateForTest();
	t.is(inspect.requests.length, 0, "no serve-request listener is attached when disabled");

	const out = stripAnsi(stderr.writes.join(""));
	t.notRegex(out, /Inspect/, "the inspect region stays hidden when disabled");

	writer.disable();
});

test.serial("inspect: the animation tick renders the new-wave marker and then stops", (t) => {
	const clock = sinon.useFakeTimers();
	const setSpy = sinon.spy(global, "setInterval");
	const clearSpy = sinon.spy(global, "clearInterval");
	try {
		const {writer, stderr} = createWriter({inspect: true});
		// Idle (ready): no build spinner is driving renders, so an in-flight request is what arms
		// the inspect animation tick.
		process.emit("ui5.serve-status", {status: "serve-ready"});
		process.emit("ui5.serve-request", {
			id: 1, phase: "start", path: "/x",
			projects: [{name: "sap.m", state: "building"}], hrtime: hr(0),
		});
		t.true(setSpy.called, "an in-flight request arms the animation tick");

		// The timer stays active through the quiet gap so it can render the marker without another
		// event. It stops after the marker is visible.
		const clearedBefore = clearSpy.callCount;
		process.emit("ui5.serve-request", {
			id: 1, phase: "end", hrtime: hr(10), resolvedProject: "sap.m", found: true,
		});
		clock.tick(300);
		t.is(clearSpy.callCount, clearedBefore, "the timer remains active during the quiet gap");

		clock.tick(WAVE_GAP_MS);
		t.regex(stripAnsi(stderr.writes.join("")), /new wave ready/);
		clock.tick(300);
		t.true(clearSpy.callCount > clearedBefore, "the timer stops after the marker renders");

		writer.disable();
	} finally {
		setSpy.restore();
		clearSpy.restore();
		clock.restore();
	}
});

test.serial("inspect: a serve-request with an unknown phase is ignored", (t) => {
	const {writer} = createWriter({inspect: true});

	process.emit("ui5.serve-request", {id: 1, phase: "sometime", path: "/x", projects: []});

	t.is(writer._getStateForTest().inspect.requests.length, 0,
		"an unrecognized phase records nothing");

	writer.disable();
});

test.serial("inspect: an unresolved request renders an all-projects reader row", (t) => {
	const {writer, stderr} = createWriter({inspect: true});

	// A request for a non-existent resource falls through to the all-projects reader and misses.
	process.emit("ui5.serve-request", {
		id: 1, phase: "start", path: "/resources/foo.js", projects: [], hrtime: process.hrtime(),
	});
	process.emit("ui5.serve-request", {
		id: 1, phase: "end", hrtime: process.hrtime(), resolvedProject: null, found: false,
	});

	const out = stripAnsi(stderr.writes.join(""));
	t.regex(out, /all projects\s+\(not found\)/,
		"the miss is bucketed under the all-projects reader");

	writer.disable();
});

test.serial("inspect: a completed application request miss renders as not found", (t) => {
	const {writer, stderr} = createWriter({inspect: true});

	// A browser favicon request selects the application reader first, then falls through the
	// all-projects reader without finding a resource. The application can still be ready to serve.
	process.emit("ui5.serve-request", {
		id: 1, phase: "start", path: "/favicon.ico",
		projects: [{name: "openui5-testsuite", state: "initial"}], hrtime: process.hrtime(),
	});
	process.emit("ui5.serve-request", {
		id: 1, phase: "end", hrtime: process.hrtime(), resolvedProject: null, found: false, error: false,
	});

	const out = renderInspectRegion(
		writer._getStateForTest().inspect, stderr.columns).map(stripAnsi).join("\n");
	t.regex(out, /openui5-testsuite\s+\(not found\)/);
	t.notRegex(out, /openui5-testsuite\s+\(stale\)/);

	writer.disable();
});

test.serial("inspect: caps reader rows to the terminal height and summarizes the overflow", (t) => {
	const {writer, stderr} = createWriter({inspect: true});
	// A short terminal: only a few reader rows fit below the inspect header.
	stderr.rows = 6;

	for (const name of ["lib.a", "lib.b", "lib.c", "lib.d", "lib.e", "lib.f"]) {
		process.emit("ui5.serve-request", {
			id: name, phase: "start", path: `/resources/${name}/x.js`,
			projects: [{name, state: "fresh"}], hrtime: process.hrtime(),
		});
		process.emit("ui5.serve-request", {
			id: name, phase: "end", hrtime: process.hrtime(), resolvedProject: name, found: true,
		});
	}

	const out = stripAnsi(stderr.writes.join(""));
	t.regex(out, /\+\d+ more readers/, "the readers beyond the terminal height collapse into a summary");

	writer.disable();
});
