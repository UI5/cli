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

test.serial("info logs are filtered — status line represents build state", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.log", {
		level: "info",
		message: "quiet info",
		moduleName: "my:module",
	});

	// The persistent frame renders on info events too because #render is
	// called; but no line containing the info text should scroll above.
	const output = stripAnsi(stderr.writes.join(""));
	t.notRegex(output, /quiet info/);

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
	t.regex(output, /Framework\s+resolving…/, "framework placeholder rendered");
	t.regex(output, /Local:\s+binding…/, "server local placeholder rendered");
	t.regex(output, /Network:\s+use --accept-remote-connections to expose/,
		"network hint rendered when the flag isn't set");
	t.regex(output, /Status\s+\S+\s+starting/, "status starting placeholder rendered");

	const state = writer._getStateForTest();
	t.true(state.project.showPlaceholders);
	t.true(state.server.showPlaceholders);
	t.is(state.build.state, STATES.STARTING);

	writer.disable();
});

test.serial("tool-mode 'serve' with acceptRemoteConnections reserves network placeholder rows", (t) => {
	const {writer, stderr} = createWriter();

	process.emit("ui5.tool-info", {name: "UI5 CLI", version: "1.2.3"});
	process.emit("ui5.tool-mode", {
		mode: "serve",
		acceptRemoteConnections: true,
		networkAddressCount: 2,
	});

	const output = stripAnsi(stderr.writes.join(""));
	// Two "binding…" URL placeholders on Network — one for each announced address
	const bindingCount = (output.match(/binding…/g) || []).length;
	t.is(bindingCount, 3, "one Local placeholder + two Network placeholders");
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
	// Blank line between project/framework block and server block
	t.regex(frame, /Framework\s+\(none\)\n\n.*Local:/);
	// Blank line between server block and status
	t.regex(frame, /Network:.*\n\nStatus/);
});
