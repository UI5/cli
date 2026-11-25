import test from "ava";
import stripAnsi from "strip-ansi";
import chalk from "chalk";
import figures from "figures";

import {
	renderHeaderRegion,
	renderProjectRegion,
	renderServerRegion,
	renderBuildRegion,
	renderInspectRegion,
} from "../../../../lib/writers/interactiveConsole/render.js";
import {REMOTE_CONNECTIONS_WARNING_LINES} from
	"../../../../lib/writers/interactiveConsole/remoteConnectionsWarning.js";
import {
	createBuildState,
	transitionTo,
	setError,
	setTask,
	beginBuild,
	advanceToProject,
	STATES,
} from "../../../../lib/writers/interactiveConsole/state/build.js";
import {createHeaderState, setTool} from
	"../../../../lib/writers/interactiveConsole/state/header.js";
import {createProjectState, setProject, setFramework, enableProjectPlaceholders, setVersionResolving} from
	"../../../../lib/writers/interactiveConsole/state/project.js";
import {createServerState, setListening, enableServerPlaceholders} from
	"../../../../lib/writers/interactiveConsole/state/server.js";
import {
	createInspectState, setInspectNow, recordRequestStart, recordRequestEnd,
	recordBuildStart, recordBuildProject, recordBuildDone,
	WAVE_GAP_MS,
} from "../../../../lib/writers/interactiveConsole/state/inspect.js";
import {brand} from "../../../../lib/writers/interactiveConsole/format.js";

// chalk auto-detects "no color" in non-TTY subprocesses (e.g. the AVA worker), which would strip
// every color code from the status line and defeat the color-per-state assertions below. Force
// truecolor for this file. All other tests here run through stripAnsi and tolerate either mode.
chalk.level = 3;

// ---- renderHeaderRegion -------------------------------------------------------

test("renderHeaderRegion: empty when no tool is set", (t) => {
	t.deepEqual(renderHeaderRegion(createHeaderState()), []);
});

test("renderHeaderRegion: includes brand name and dim version prefix", (t) => {
	const state = createHeaderState();
	setTool(state, {name: "UI5 CLI", version: "1.2.3"});
	const plain = renderHeaderRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /UI5 CLI v1\.2\.3/);
});

test("renderHeaderRegion: falls back to default brand name when tool.name is missing", (t) => {
	const state = createHeaderState();
	setTool(state, {name: undefined, version: "1.0.0"});
	const plain = renderHeaderRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /UI5 CLI v1\.0\.0/, "renders default brand name when tool provides no name");
});

test("renderHeaderRegion: omits version when tool.version is missing", (t) => {
	const state = createHeaderState();
	setTool(state, {name: "UI5 CLI"});
	const plain = renderHeaderRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /UI5 CLI/);
	t.notRegex(plain, /UI5 CLI v/, "no version marker when tool has no version");
});

// ---- renderProjectRegion ------------------------------------------------------

test("renderProjectRegion: empty when no project and no placeholders", (t) => {
	t.deepEqual(renderProjectRegion(createProjectState()), []);
});

test("renderProjectRegion: renders placeholders when enabled", (t) => {
	const state = createProjectState();
	enableProjectPlaceholders(state);
	const plain = renderProjectRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Project\s+resolving…/);
	// The Framework row is deferred until project-resolved reveals a real
	// framework name — otherwise a stale "resolving…" would flash and vanish
	// for the (very common) case of an app without a declared framework.
	t.notRegex(plain, /Framework/, "no Framework row is reserved in placeholder mode");
});

test("renderProjectRegion: renders project, type, and version", (t) => {
	const state = createProjectState();
	setProject(state, {
		name: "my.app",
		type: "application",
		version: "1.0.0",
	});
	setFramework(state, {name: "SAPUI5", version: "1.150.0"});
	const plain = renderProjectRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Project\s+my\.app\s+\(application\)\s+v1\.0\.0/);
	t.regex(plain, /Framework\s+SAPUI5 1\.150\.0/);
});

test("renderProjectRegion: renders framework without a version when only the name is known", (t) => {
	const state = createProjectState();
	setProject(state, {
		name: "my.app",
		type: "application",
		version: "1.0.0",
	});
	setFramework(state, {name: "OpenUI5"});
	const plain = renderProjectRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Framework\s+OpenUI5$/m);
});

test("renderProjectRegion: omits the framework row when project has no framework", (t) => {
	// For a UI5 app without a declared framework (a common shape when
	// something like fiori-tools-proxy supplies it at runtime) the writer
	// omits the row entirely rather than rendering a misleading "(none)"
	// label.
	const state = createProjectState();
	setProject(state, {
		name: "my.app",
		type: "application",
		version: "1.0.0",
	});
	const rendered = renderProjectRegion(state);
	t.is(rendered.length, 2, "two lines: separator + Project");
	const plain = rendered.map(stripAnsi).join("\n");
	t.notRegex(plain, /Framework/, "no Framework label is rendered");
	t.notRegex(plain, /\(none\)/, "no '(none)' placeholder is rendered");
});

test("renderProjectRegion: project rendered without type/version still includes the name", (t) => {
	const state = createProjectState();
	setProject(state, {name: "bare.project"});
	const plain = renderProjectRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Project\s+bare\.project/);
	t.notRegex(plain, /bare\.project\s+\(/, "no type marker is rendered when type is absent");
});

test("renderProjectRegion: version slot shows a placeholder while resolving, name and type stay", (t) => {
	const state = createProjectState();
	setProject(state, {
		name: "my.app",
		type: "application",
		version: "1.0.0",
	});
	setFramework(state, {name: "SAPUI5", version: "1.150.0"});
	setVersionResolving(state);
	const plain = renderProjectRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Project\s+my\.app\s+\(application\)\s+resolving…/, "name and type stay, version is a placeholder");
	t.notRegex(plain, /v1\.0\.0/, "the stale project version is not shown while resolving");
	// The framework version goes stale alongside it: placeholdered, name kept.
	t.regex(plain, /Framework\s+SAPUI5\s+resolving…/, "framework name stays, its version is a placeholder");
	t.notRegex(plain, /1\.150\.0/, "the stale framework version is not shown while resolving");
});

test("renderProjectRegion: resolving over a frameworkless project placeholders only the project version", (t) => {
	const state = createProjectState();
	setProject(state, {name: "my.app", type: "application", version: "1.0.0"});
	setVersionResolving(state);
	const plain = renderProjectRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Project\s+my\.app\s+\(application\)\s+resolving…/);
	t.notRegex(plain, /Framework/, "no Framework row is invented while resolving");
});

// ---- renderServerRegion -------------------------------------------------------

test("renderServerRegion: empty when no urls and no placeholders", (t) => {
	t.deepEqual(renderServerRegion(createServerState()), []);
});

test("renderServerRegion: renders Local + Network placeholders when acceptRemoteConnections=true", (t) => {
	const state = createServerState();
	enableServerPlaceholders(state, {acceptRemoteConnections: true});
	const plain = renderServerRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Local:\s+binding…/);
	t.regex(plain, /Network:\s+binding…/);
	t.regex(plain, /accepting connections from all hosts/,
		"remote-connections warning rendered up front");
});

test("renderServerRegion: renders --accept-remote-connections hint by default", (t) => {
	const state = createServerState();
	enableServerPlaceholders(state);
	const plain = renderServerRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Local:\s+binding…/);
	t.regex(plain, /Network:\s+use --accept-remote-connections to expose/);
	t.false(plain.includes("accepting connections from all hosts"),
		"warning block is omitted when remote connections are not accepted");
});

test("renderServerRegion: shows single Local + hint when acceptRemoteConnections=false", (t) => {
	const state = createServerState();
	setListening(state, {
		urls: [{label: "Local", url: "http://localhost:8080"}],
		acceptRemoteConnections: false,
	});
	const plain = renderServerRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Local:\s+http:\/\/localhost:8080/);
	t.regex(plain, /Network:\s+use --accept-remote-connections/);
	t.false(plain.includes("accepting connections from all hosts"));
});

test("renderServerRegion: lists every Network URL when several addresses are supplied", (t) => {
	const state = createServerState();
	setListening(state, {
		urls: [
			{label: "Local", url: "http://localhost:8080"},
			{label: "Network", url: "http://10.0.0.1:8080"},
			{label: "Network", url: "http://10.0.0.2:8080"},
			{label: "Network", url: "http://10.0.0.3:8080"},
		],
		acceptRemoteConnections: true,
	});
	const plain = renderServerRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Network:\s+http:\/\/10\.0\.0\.1:8080/);
	// Continuation URLs are aligned under the first — they must be present but
	// without a repeated "Network:" label.
	t.regex(plain, /http:\/\/10\.0\.0\.2:8080/);
	t.regex(plain, /http:\/\/10\.0\.0\.3:8080/);
	const networkLabelHits = plain.match(/Network:/g) || [];
	t.is(networkLabelHits.length, 1, "Network label appears only on the first row");
	// Warning block is present because acceptRemoteConnections=true.
	for (const line of REMOTE_CONNECTIONS_WARNING_LINES) {
		t.true(plain.includes(stripAnsi(line)));
	}
});

test("renderServerRegion: renders labels other than Local/Network verbatim", (t) => {
	// A future URL kind (e.g. WebSocket, HTTPS mirror) falls through to the
	// "other" bucket and is rendered with its label preserved.
	const state = createServerState();
	setListening(state, {
		urls: [
			{label: "Local", url: "http://localhost:8080"},
			{label: "Custom", url: "wss://ws.localhost/socket"},
		],
		acceptRemoteConnections: false,
	});
	const plain = renderServerRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Custom:\s+wss:\/\/ws\.localhost\/socket/);
});

test("renderServerRegion: non-array urls fall through to an empty list", (t) => {
	// setListening() defensively coerces missing urls to [], so the region
	// renders as "no local" (no Local row and no hint).
	const state = createServerState();
	setListening(state, {urls: undefined, acceptRemoteConnections: false});
	const plain = renderServerRegion(state).map(stripAnsi).join("\n");
	t.notRegex(plain, /Local:/, "no Local row when the urls list is empty");
	t.notRegex(plain, /Network:/, "no Network hint when there is no Local row to hang it under");
});

// ---- renderBuildRegion --------------------------------------------------------

test("renderBuildRegion: empty in INITIAL state", (t) => {
	const state = createBuildState();
	t.deepEqual(renderBuildRegion(state), []);
});

test("renderBuildRegion: starting state renders a dim placeholder", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.STARTING);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Status\s+.+?\s+starting/);
});

test("renderBuildRegion: ready state", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.READY);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Status\s+.+?\s+ready/);
});

test("renderBuildRegion: ready state with hrtime shows elapsed suffix", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.READY);
	state.lastBuildHrtime = [0, 50_000_000];
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /ready.*Time elapsed:/);
});

test("renderBuildRegion: ready state appends a singular stale count", (t) => {
	const state = createBuildState();
	state.staleProjects = ["library.a"];
	transitionTo(state, STATES.READY);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /ready.*·\s+1 project(?!s) stale/);
});

test("renderBuildRegion: ready state appends a plural stale count", (t) => {
	const state = createBuildState();
	state.staleProjects = ["library.a", "library.b"];
	transitionTo(state, STATES.READY);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /ready.*·\s+2 projects stale/);
});

test("renderBuildRegion: ready state omits the stale count when everything is fresh", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.READY);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.notRegex(plain, /stale/, "no stale fragment when staleProjects is empty");
});

test("renderBuildRegion: settling state includes 'waiting for changes to settle' hint", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.SETTLING);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Status\s+.+?\s+settling\s+·\s+waiting for changes to settle/);
});

test("renderBuildRegion: validating state includes 'checking dependency caches' hint", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.VALIDATING);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Status\s+.+?\s+validating cache\s+·\s+checking dependency caches/);
	t.notRegex(plain, /project/, "no counter fragment when validatingProjects is empty");
});

test("renderBuildRegion: validating state appends singular project count", (t) => {
	const state = createBuildState();
	state.validatingProjects = ["library.a"];
	transitionTo(state, STATES.VALIDATING);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /·\s+1 project(?!s)/);
});

test("renderBuildRegion: validating state appends plural project count", (t) => {
	const state = createBuildState();
	state.validatingProjects = ["library.a", "library.b"];
	transitionTo(state, STATES.VALIDATING);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /·\s+2 projects/);
});

test("renderBuildRegion: building state renders project counter + project + task", (t) => {
	const state = createBuildState();
	beginBuild(state, ["proj-a", "my.app", "proj-c"]);
	transitionTo(state, STATES.BUILDING);
	advanceToProject(state, "my.app");
	setTask(state, "minify");
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /building/);
	t.regex(plain, /2\/3 projects/);
	t.regex(plain, /my\.app/);
	t.regex(plain, /minify/);
});

test("renderBuildRegion: building state without counter or task falls back to bare label", (t) => {
	// Fresh BUILDING transition with no build-metadata: no counter, no project,
	// no task — just the state word.
	const state = createBuildState();
	transitionTo(state, STATES.BUILDING);
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Status\s+.+?\s+building/);
	t.notRegex(plain, /projects/, "no counter fragment when totalProjects is 0");
});

test("renderBuildRegion: building state pads project + task names for stable columns", (t) => {
	const state = createBuildState();
	beginBuild(state, ["short", "longer-name"]);
	transitionTo(state, STATES.BUILDING);
	advanceToProject(state, "short");
	setTask(state, "task-with-a-longer-name");
	setTask(state, "css");
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	// projectNameWidth (11) pads "short" to "short      "; the width never
	// shrinks so the eventual re-render doesn't re-flow.
	t.regex(plain, /short {6}/, "project name padded to widest known project");
	t.regex(plain, /css {20}/, "task name padded to widest known task");
});

test("renderBuildRegion: error state shows message", (t) => {
	const state = createBuildState();
	setError(state, "Build failed");
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /error\s+·\s+Build failed/);
});

test("renderBuildRegion: error state without message omits the separator", (t) => {
	const state = createBuildState();
	setError(state, "");
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /error\s*$/m, "error state renders without a message tail");
});

test("renderBuildRegion: unknown state falls back to a bare label", (t) => {
	// Guards against future callers passing a state value the renderer
	// doesn't recognise yet.
	const state = createBuildState();
	state.state = "totally-new-state";
	const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
	t.regex(plain, /Status/);
});

test("renderBuildRegion: building spinner cycles through frames", (t) => {
	const seen = new Set();
	for (let frame = 0; frame < 8; frame++) {
		const state = createBuildState();
		transitionTo(state, STATES.BUILDING);
		state.spinFrame = frame;
		const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
		// The spinner glyph is the first non-space character after the Status label.
		const match = plain.match(/Status\s+(\S)/);
		t.truthy(match, "expected to find a spinner glyph");
		seen.add(match[1]);
	}
	t.true(seen.size > 1, "spinner glyph rotates across frames");
});

test("renderBuildRegion: building state renders bare project/task names when no width has been recorded", (t) => {
	// projectNameWidth / taskNameWidth are populated by beginBuild + setTask.
	// If a project-build-start event arrives before build-metadata (unusual but
	// possible in weird flows), the widths are still 0 and the renderer should
	// emit the names verbatim instead of padEnd-ing to zero.
	const state = createBuildState();
	transitionTo(state, STATES.BUILDING);
	state.currentProjectName = "proj";
	state.currentTaskName = "css";
	// projectNameWidth / taskNameWidth left at 0 on purpose.
	const [, line] = renderBuildRegion(state);
	const plain = stripAnsi(line);
	// Strict: exact substrings, no trailing padding after either name.
	t.regex(plain, /· proj ·/);
	t.regex(plain, /· css$/);
});

// Locks the glyph chosen per state. Complements the shape-only regex tests above: those verify
// "some glyph is followed by the state word"; these verify "it's specifically THIS glyph". A swap
// (e.g. bullet ↔ circle) would still look plausible but would break the design contract.
const GLYPH_BY_STATE = [
	{state: STATES.STARTING, glyph: figures.circle, name: "circle"},
	{state: STATES.READY, glyph: figures.bullet, name: "bullet"},
	{state: STATES.ERROR, glyph: figures.cross, name: "cross"},
];
for (const {state: s, glyph, name} of GLYPH_BY_STATE) {
	test(`renderBuildRegion: ${s} uses the ${name} glyph`, (t) => {
		const state = createBuildState();
		transitionTo(state, s);
		const plain = renderBuildRegion(state).map(stripAnsi).join("\n");
		t.true(plain.includes(glyph),
			`expected output to contain ${JSON.stringify(glyph)}, got ${JSON.stringify(plain)}`);
	});
}

// Locks the color chosen per state. Color is the primary semantic signal to a human reader
// (green=healthy, yellow=attention, red=error) and stripAnsi throws it away — so the plain-text
// tests above would happily accept a swap. Build the expected wrapped-word substring with the
// same chalk instance the renderer uses; matching it in the output proves the state word is
// wrapped in exactly that color span.
const WIDTH = "building".length;
const COLOR_BY_STATE = [
	{state: STATES.STARTING, wrap: (x) => chalk.dim(x), word: "starting", name: "dim"},
	{state: STATES.READY, wrap: (x) => chalk.green(x), word: "ready", name: "green"},
	{state: STATES.BUILDING, wrap: (x) => chalk.yellow(x), word: "building", name: "yellow"},
	{state: STATES.VALIDATING, wrap: (x) => chalk.cyan(x), word: "validating cache", name: "cyan"},
	{state: STATES.ERROR, wrap: (x) => chalk.red(x), word: "error", name: "red"},
];
for (const {state: s, wrap, word, name} of COLOR_BY_STATE) {
	test(`renderBuildRegion: ${s} state is rendered in ${name}`, (t) => {
		const state = createBuildState();
		transitionTo(state, s);
		const [, line] = renderBuildRegion(state);
		const expected = wrap(word.padEnd(WIDTH));
		t.true(line.includes(expected),
			`expected the "${word}" label to be wrapped in ${name}; ` +
			`looked for ${JSON.stringify(expected)} in ${JSON.stringify(line)}`);
	});
}

// ---- renderInspectRegion ------------------------------------------------------

// Builds an inspect state with a single resolved request for `project` in `state`, over a fixed
// 10-second window, so the layout assertions below are deterministic. `found` controls whether the
// request resolved the project (served) or missed (keeping the start state).
function inspectStateWith(project, projectState, {startMs = 0, endMs = 2000, buildHr, found = true} = {}) {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	recordRequestStart(state, {
		id: 1, path: `/resources/${project}/x.js`,
		projects: [{name: project, state: projectState}], hrtime: toHr(startMs),
	});
	if (buildHr) {
		recordBuildStart(state, toHr(startMs));
		recordBuildProject(state, project);
		recordBuildDone(state, toHr(endMs), buildHr);
	}
	recordRequestEnd(state, {
		id: 1, hrtime: toHr(endMs), resolvedProject: found ? project : null, found,
	});
	return state;
}

// An in-flight request (no end) for `project` in `projectState`, so the row is classified by the
// state seen at request start.
function inFlightStateWith(project, projectState) {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	recordRequestStart(state, {
		id: 1, path: `/resources/${project}/x.js`,
		projects: [{name: project, state: projectState}], hrtime: toHr(0),
	});
	return state;
}

test("renderInspectRegion: empty when there are no requests", (t) => {
	t.deepEqual(renderInspectRegion(createInspectState(), 80), []);
});

test("renderInspectRegion: renders a header and one line per project reader", (t) => {
	const state = inFlightStateWith("sap.m", "building");
	const plain = renderInspectRegion(state, 80).map(stripAnsi);
	t.is(plain[0], "", "leads with the region separator blank line");
	t.regex(plain[1], /Inspect\s+requests and dependency builds/);
	t.regex(plain[2], /sap\.m\s+\(stale\)/);
	t.regex(plain[2], /1 req\b/);
});

test("renderInspectRegion: marks a wave ready after the quiet gap", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = inspectStateWith("sap.m", "fresh", {endMs: 500});
	setInspectNow(state, toHr(500 + WAVE_GAP_MS - 1));
	t.notRegex(stripAnsi(renderInspectRegion(state, 80)[1]), /new wave ready/);

	setInspectNow(state, toHr(500 + WAVE_GAP_MS));
	const header = renderInspectRegion(state, 80)[1];
	t.regex(stripAnsi(header), /new wave ready/);
	t.true(header.includes(chalk.green(`${figures.tick} new wave ready`)));
});

test("renderInspectRegion: a built reader shows an explicit built label and its build time", (t) => {
	const state = inspectStateWith("sap.m", "building", {buildHr: [0, 800e6]});
	const plain = renderInspectRegion(state, 80).map(stripAnsi).join("\n");
	t.regex(plain, /sap\.m\s+\(built 800 ms\)/,
		"the label distinguishes a build from other request activity");
});

test("renderInspectRegion: shows a dependency built for another reader", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(1000));
	recordRequestStart(state, {
		id: 1, path: "/resources/sap/ui/documentation/sdk/index.html",
		projects: [{name: "sap.ui.documentation", state: "building"}], hrtime: toHr(0),
	});
	recordBuildStart(state, toHr(100));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, toHr(900), [0, 800e6]);
	recordRequestEnd(state, {
		id: 1, hrtime: toHr(1000), resolvedProject: "sap.ui.documentation", found: true,
	});

	const plain = renderInspectRegion(state, 120).map(stripAnsi).join("\n");
	t.regex(plain, /sap\.ui\.documentation\s+\(cached\)\s+1 req/);
	t.regex(plain, /sap\.m\s+\(dependency built 800 ms\)/);
	t.notRegex(plain, /sap\.m.*0 req/, "a dependency build is not presented as a resource request");
});

test("renderInspectRegion: labels dependency builds without a duration", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(1000));
	recordRequestStart(state, {
		id: 1, path: "/resources/docs/x.html",
		projects: [{name: "docs", state: "building"}], hrtime: toHr(0),
	});
	recordBuildStart(state, toHr(100));
	recordBuildProject(state, "sap.m");

	let plain = renderInspectRegion(state, 100).map(stripAnsi).join("\n");
	t.regex(plain, /sap\.m\s+\(dependency building\)/);
	recordBuildDone(state, toHr(900));
	plain = renderInspectRegion(state, 100).map(stripAnsi).join("\n");
	t.regex(plain, /sap\.m\s+\(dependency built\)/);
});

test("renderInspectRegion: a reader served without a build reads as cached", (t) => {
	const state = inspectStateWith("my.app", "fresh");
	const plain = renderInspectRegion(state, 80).map(stripAnsi).join("\n");
	t.regex(plain, /my\.app\s+\(cached\)/, "a warm-cache hit (no build) reads as cached");
});

test("renderInspectRegion: a completed miss reads as not found", (t) => {
	const state = inspectStateWith("openui5-testsuite", "initial", {found: false});
	const lines = renderInspectRegion(state, 80);
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /openui5-testsuite\s+\(not found\)/);
	t.notRegex(plain, /openui5-testsuite\s+\(stale\)/);
	t.true(lines[2].includes(chalk.yellow("openui5-testsuite")),
		`expected the not-found reader name in yellow in ${JSON.stringify(lines[2])}`);
});

test("renderInspectRegion: a miss that rebuilt surfaces the build time in the label", (t) => {
	// A request that resolved no project still reports its expensive rebuild time in the label, in
	// the same place a served reader shows it.
	const state = inspectStateWith("sap.m", "building", {buildHr: [0, 800e6], found: false});
	const plain = renderInspectRegion(state, 80).map(stripAnsi).join("\n");
	t.regex(plain, /sap\.m\s+\(built 800 ms\)/, "the build time is in the label");
	t.notRegex(plain, /\(stale\)/, "the build time replaces the state word in the label");
});

test("renderInspectRegion: a reader built twice renders both durations in red", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: toHr(0)});
	recordBuildStart(state, toHr(0));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, toHr(300), [0, 300e6]);
	recordRequestEnd(state, {id: 1, hrtime: toHr(400), resolvedProject: "sap.m"});
	recordRequestStart(state, {id: 2, path: "/b", projects: [{name: "sap.m", state: "building"}], hrtime: toHr(4000)});
	recordBuildStart(state, toHr(4000));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, toHr(4500), [0, 500e6]);
	recordRequestEnd(state, {id: 2, hrtime: toHr(4600), resolvedProject: "sap.m"});
	const line = renderInspectRegion(state, 80)[2];
	t.regex(stripAnsi(line), /\(built 300 ms, 500 ms\)/, "both wave builds are listed in the label");
	t.true(line.includes(chalk.red("(built 300 ms, 500 ms)")),
		`expected the repeated-build durations in red in ${JSON.stringify(line)}`);
});

test("renderInspectRegion: the request count is rendered in front of the bar", (t) => {
	const plain = stripAnsi(renderInspectRegion(inspectStateWith("sap.m", "fresh"), 80)[2]);
	t.regex(plain, /1 req\b/);
	t.true(plain.indexOf("req") < plain.indexOf("█"), "the count precedes the bar");
});

test("renderInspectRegion: separated bursts render as several bar segments", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	for (const [id, at] of [[1, 0], [2, 4000], [3, 8000]]) {
		recordRequestStart(state, {
			id, path: "/a", projects: [{name: "sap.ui.core", state: "fresh"}], hrtime: toHr(at),
		});
		recordRequestEnd(state, {id, hrtime: toHr(at + 200), resolvedProject: "sap.ui.core"});
	}
	const bar = stripAnsi(renderInspectRegion(state, 160)[2]);
	t.regex(bar, /█+░+█/, "a gap between bursts shows as dim cells between active blocks");
});

test("renderInspectRegion: a stale reader is rendered in the brand (orange) color", (t) => {
	const state = inFlightStateWith("sap.m", "building");
	const line = renderInspectRegion(state, 80)[2];
	// The brand helper wraps the reader name; assert the colored span is present.
	t.true(line.includes(brand("sap.m")),
		`expected the stale reader name wrapped in the brand color in ${JSON.stringify(line)}`);
});

test("renderInspectRegion: a cached reader is rendered in dimmed grey", (t) => {
	const state = inspectStateWith("my.app", "fresh");
	const line = renderInspectRegion(state, 80)[2];
	t.true(line.includes(chalk.dim("my.app")),
		`expected the cached reader name dimmed in ${JSON.stringify(line)}`);
});

test("renderInspectRegion: bars scale to the terminal width", (t) => {
	const narrow = renderInspectRegion(inFlightStateWith("sap.m", "building"), 60)[2];
	const wide = renderInspectRegion(inFlightStateWith("sap.m", "building"), 160)[2];
	const activeChars = (line) => (stripAnsi(line).match(/█/g) || []).length;
	t.true(activeChars(wide) > activeChars(narrow),
		"a wider terminal produces a longer active bar for the same request span");
});

test("renderInspectRegion: an errored reader is rendered in red", (t) => {
	// A failed build leaves the request unresolved, so the reader keeps its errored start state.
	const state = inspectStateWith("broken.lib", "errored", {found: false});
	const line = renderInspectRegion(state, 80)[2];
	t.true(line.includes(chalk.red("broken.lib")),
		`expected the errored reader name in red in ${JSON.stringify(line)}`);
	t.regex(stripAnsi(line), /broken\.lib\s+\(error\)/);
});

test("renderInspectRegion: a long reader name is truncated to the name column", (t) => {
	const longName = "a.very.long.project.name.exceeding.the.cap";
	const plain = stripAnsi(renderInspectRegion(inspectStateWith(longName, "fresh"), 80)[2]);
	t.false(plain.includes(longName), "the full name does not fit");
	t.true(plain.includes(longName.slice(0, 24)), "the name is truncated to the cap");
});

test("renderInspectRegion: pluralizes the request count", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	for (const id of [1, 2, 3]) {
		recordRequestStart(state, {
			id, path: "/x", projects: [{name: "sap.m", state: "fresh"}], hrtime: toHr(0),
		});
		recordRequestEnd(state, {id, hrtime: toHr(100), resolvedProject: "sap.m"});
	}
	const plain = stripAnsi(renderInspectRegion(state, 80)[2]);
	t.regex(plain, /3 reqs/);
});

test("renderInspectRegion: falls back to a default width on a non-TTY (undefined columns)", (t) => {
	const plain = stripAnsi(renderInspectRegion(inFlightStateWith("sap.m", "building"), undefined)[2]);
	t.regex(plain, /█/, "still produces an active bar at the default width");
});

test("renderInspectRegion: collapses rows beyond maxRows into a '+N more readers' line", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	for (const name of ["lib.a", "lib.b", "lib.c", "lib.d", "lib.e"]) {
		recordRequestStart(state, {
			id: name, path: `/resources/${name}/x.js`,
			projects: [{name, state: "fresh"}], hrtime: toHr(0),
		});
		recordRequestEnd(state, {id: name, hrtime: toHr(10), resolvedProject: name});
	}
	// maxRows = 3: two reader rows plus a summary for the remaining three.
	const plain = renderInspectRegion(state, 80, 3).map(stripAnsi);
	const dataLines = plain.slice(2); // drop the blank + header
	t.is(dataLines.length, 3, "two reader rows and one summary line");
	t.regex(dataLines[2], /\+3 more readers/);
});

test("renderInspectRegion: uses the only available row for the overflow summary", (t) => {
	const state = createInspectState();
	setInspectNow(state, [10, 0]);
	for (const name of ["lib.a", "lib.b"]) {
		recordRequestStart(state, {
			id: name, path: `/resources/${name}/x.js`,
			projects: [{name, state: "fresh"}], hrtime: [0, 0],
		});
		recordRequestEnd(state, {id: name, hrtime: [0, 10e6], resolvedProject: name});
	}

	const dataLines = renderInspectRegion(state, 80, 1).map(stripAnsi).slice(2);
	t.deepEqual(dataLines, [" +2 more readers"]);
	t.deepEqual(renderInspectRegion(state, 80, 0), [], "the region stays hidden without row capacity");
});

test("renderInspectRegion: the overflow summary consumes one row from the budget", (t) => {
	const toHr = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];
	const state = createInspectState();
	setInspectNow(state, toHr(10000));
	for (const name of ["lib.a", "lib.b", "lib.c"]) {
		recordRequestStart(state, {
			id: name, path: `/resources/${name}/x.js`,
			projects: [{name, state: "fresh"}], hrtime: toHr(0),
		});
		recordRequestEnd(state, {id: name, hrtime: toHr(10), resolvedProject: name});
	}
	// A two-line budget shows one reader and summarizes the other two.
	const plain = renderInspectRegion(state, 80, 2).map(stripAnsi);
	t.regex(plain[plain.length - 1], /\+2 more readers\b/);
});
