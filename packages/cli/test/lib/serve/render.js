import test from "ava";
import stripAnsi from "strip-ansi";
import chalk from "chalk";
import figures from "figures";

import {
	renderHeader,
	renderStatusLine,
} from "../../../lib/serve/render.js";
import {REMOTE_CONNECTIONS_WARNING_LINES} from "../../../lib/serve/remoteConnectionsWarning.js";
import {createInitialState, STATES} from "../../../lib/serve/state.js";

// chalk auto-detects "no color" in non-TTY subprocesses (e.g. the AVA worker), which would strip
// every color code from renderStatusLine and defeat the color-per-state assertions below. Force
// truecolor for this file. All other tests here run through stripAnsi and tolerate either mode.
chalk.level = 3;

const baseHeaderOpts = {
	brand: {name: "UI5 CLI", version: "1.0.0"},
	urls: {local: "http://localhost:8080"},
	acceptRemoteConnections: false,
	project: {name: "my.app", type: "application", version: "1.0.0"},
	framework: {name: "SAPUI5", version: "1.0.0"},
};

test("renderHeader: includes brand, urls, project, framework", (t) => {
	const lines = renderHeader(baseHeaderOpts);
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /UI5 CLI v1\.0\.0/);
	t.regex(plain, /Local:\s+http:\/\/localhost:8080/);
	t.regex(plain, /Network:\s+use --accept-remote-connections/);
	t.regex(plain, /Project\s+my\.app\s+\(application\)\s+v1\.0\.0/);
	t.regex(plain, /Framework\s+SAPUI5 1\.0\.0/);
});

test("renderHeader: omits warning block when acceptRemoteConnections=false", (t) => {
	const lines = renderHeader(baseHeaderOpts);
	const plain = lines.map(stripAnsi).join("\n");
	t.false(plain.includes("accepting connections from all hosts"),
		"warning sub-block is omitted when remote connections are not accepted");
});

test("renderHeader: emits the full warning block when acceptRemoteConnections=true", (t) => {
	const lines = renderHeader({...baseHeaderOpts, acceptRemoteConnections: true});
	const plain = lines.map(stripAnsi).join("\n");
	for (const line of REMOTE_CONNECTIONS_WARNING_LINES) {
		t.true(plain.includes(stripAnsi(line)),
			`expected warning line to be present: ${stripAnsi(line)}`);
	}
});

test("renderHeader: shows a dim '(none)' framework row when project has no framework", (t) => {
	// The Framework row is always rendered so the live region's height stays
	// constant once the project resolves — otherwise the status line would
	// shift down when a framework appears between frames.
	const lines = renderHeader({...baseHeaderOpts, framework: undefined});
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /Framework\s+\(none\)/);
});

test("renderHeader: renders placeholders when urls + project are unknown", (t) => {
	const lines = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: null,
		project: null,
		framework: null,
		acceptRemoteConnections: false,
	});
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /UI5 CLI v1\.0\.0/);
	t.regex(plain, /Local:\s+binding…/);
	t.regex(plain, /Network:\s+use --accept-remote-connections to expose/);
	t.regex(plain, /Project\s+resolving…/);
	t.regex(plain, /Framework\s+resolving…/,
		"framework row reserved with a placeholder while the project is unknown");
});

test("renderHeader: shows remote-connections warning as soon as the flag is set", (t) => {
	// `acceptRemoteConnections` reflects user intent — the renderer paints the
	// warning from the first frame, well before the server has actually bound.
	const lines = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: null,
		project: null,
		framework: null,
		acceptRemoteConnections: true,
	});
	const plain = lines.map(stripAnsi).join("\n");
	t.true(plain.includes("accepting connections from all hosts"),
		"warning surfaces with the placeholder header");
});

test("renderHeader: network placeholder reserves one line per expected address", (t) => {
	// The CLI hands `networkAddressCount` to Banner.observe so the skeleton
	// pre-reserves the exact number of rows that setUrls() will later fill —
	// the live region must not re-flow when the real URLs arrive.
	const skeleton = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: null,
		project: null,
		framework: null,
		acceptRemoteConnections: true,
		networkAddressCount: 3,
	});
	const skeletonNetworkLines = skeleton.map(stripAnsi)
		.filter((l) => /^\s*(\S+\s+)?Network:|^\s+binding…$/.test(l) ||
			/^\s+binding…$/.test(l));
	// One labelled row + two continuation rows under the same indent.
	t.is(skeletonNetworkLines.length, 3, "placeholder reserves 3 network rows");

	const filled = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: {
			local: "http://localhost:8080",
			network: [
				"http://0.0.0.0:8080",
				"http://0.0.0.0:8081",
				"http://0.0.0.0:8082",
			],
		},
		project: null,
		framework: null,
		acceptRemoteConnections: true,
		networkAddressCount: 3,
	});

	// The total number of header lines must be identical before and after
	// setUrls() — that's what keeps the live region from re-flowing.
	t.is(filled.length, skeleton.length,
		"setUrls() preserves the header's line count");
});

test("renderHeader: network placeholder defaults to a single line when count is zero", (t) => {
	// `acceptRemoteConnections=true` but no addresses found yet (count=0): the
	// section still needs a visible placeholder so the user sees the row even
	// before the host's interfaces are inspected.
	const lines = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: null,
		project: null,
		framework: null,
		acceptRemoteConnections: true,
		networkAddressCount: 0,
	});
	const plain = lines.map(stripAnsi).join("\n");
	const matches = plain.match(/Network:\s+binding…/g) || [];
	t.is(matches.length, 1, "exactly one placeholder Network: row is rendered");
});

test("renderHeader: row count is stable across project resolution (with framework)", (t) => {
	// The live region must not change height once the project resolves —
	// otherwise log-update's diff path leaves trailing rows (notably the
	// status line) where they were and the user sees a duplicate.
	const skeleton = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: null,
		project: null,
		framework: null,
		acceptRemoteConnections: false,
	});
	const withFramework = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: {local: "http://localhost:8080"},
		project: {name: "my.app", type: "application", version: "1.0.0"},
		framework: {name: "SAPUI5", version: "1.0.0"},
		acceptRemoteConnections: false,
	});
	const withoutFramework = renderHeader({
		brand: {name: "UI5 CLI", version: "1.0.0"},
		urls: {local: "http://localhost:8080"},
		project: {name: "my.app", type: "application", version: "1.0.0"},
		framework: null,
		acceptRemoteConnections: false,
	});
	t.is(withFramework.length, skeleton.length,
		"frame with a framework matches the skeleton's height");
	t.is(withoutFramework.length, skeleton.length,
		"frame without a framework matches the skeleton's height");
});

test("renderStatusLine: ready state", (t) => {
	const state = {...createInitialState(), state: STATES.READY};
	const plain = stripAnsi(renderStatusLine(state));
	t.regex(plain, /Status\s+\S+\s+ready/);
});

test("renderStatusLine: stale state", (t) => {
	const state = {...createInitialState(), state: STATES.STALE};
	const plain = stripAnsi(renderStatusLine(state));
	t.regex(plain, /Status\s+\S+\s+stale\s+·\s+files changed/);
});

test("renderStatusLine: building state with project + task", (t) => {
	const state = {
		...createInitialState(),
		state: STATES.BUILDING,
		totalProjects: 3,
		currentProjectIndex: 2,
		currentProjectName: "my.app",
		currentTaskName: "minify",
	};
	const plain = stripAnsi(renderStatusLine(state));
	t.regex(plain, /building/);
	t.regex(plain, /2\/3 projects/);
	t.regex(plain, /my\.app/);
	t.regex(plain, /minify/);
});

test("renderStatusLine: error state shows message", (t) => {
	const state = {
		...createInitialState(),
		state: STATES.ERROR,
		errorMessage: "Build failed",
	};
	const plain = stripAnsi(renderStatusLine(state));
	t.regex(plain, /\S+\s+error\s+·\s+Build failed/);
});

test("renderStatusLine: building spinner cycles through frames", (t) => {
	const seen = new Set();
	for (let frame = 0; frame < 8; frame++) {
		const state = {
			...createInitialState(),
			state: STATES.BUILDING,
			spinFrame: frame,
		};
		// extract the spinner glyph: first non-space, non-bracket char after the
		// label whitespace
		const plain = stripAnsi(renderStatusLine(state));
		const match = plain.match(/Status\s+(\S)/);
		t.truthy(match, "expected to find a spinner glyph");
		seen.add(match[1]);
	}
	t.true(seen.size > 1, "spinner glyph rotates across frames");
});

test("renderStatusLine: unknown state falls back to a bare label", (t) => {
	// Defensive default case in the state switch — guards against future
	// callers passing a state value the renderer doesn't recognise yet.
	const plain = stripAnsi(renderStatusLine({state: "totally-new-state"}));
	t.regex(plain, /Status/);
});

test("renderStatusLine: error state without message omits the dot separator", (t) => {
	const state = {...createInitialState(), state: STATES.ERROR, errorMessage: ""};
	const plain = stripAnsi(renderStatusLine(state));
	t.regex(plain, /\S+\s+error\s*$/, "error state renders without a message tail");
});

test("renderHeader: lists every network URL when several addresses are supplied", (t) => {
	const lines = renderHeader({
		...baseHeaderOpts,
		acceptRemoteConnections: true,
		urls: {
			local: "http://localhost:8080",
			network: [
				"http://10.0.0.1:8080",
				"http://10.0.0.2:8080",
				"http://10.0.0.3:8080",
			],
		},
	});
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /Network:\s+http:\/\/10\.0\.0\.1:8080/);
	t.regex(plain, /http:\/\/10\.0\.0\.2:8080/);
	t.regex(plain, /http:\/\/10\.0\.0\.3:8080/);
});

test("renderHeader: project rendered without type/version still includes the name", (t) => {
	const lines = renderHeader({
		...baseHeaderOpts,
		project: {name: "bare.project"},
		framework: null,
	});
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /Project\s+bare\.project/);
	t.notRegex(plain, /bare\.project\s+\(/, "no type marker is rendered when type is absent");
});

test("renderHeader: framework name without a version still renders", (t) => {
	const lines = renderHeader({
		...baseHeaderOpts,
		framework: {name: "OpenUI5"},
	});
	const plain = lines.map(stripAnsi).join("\n");
	t.regex(plain, /Framework\s+OpenUI5/);
});

// Locks the glyph chosen per state. Complements the shape-only regex tests above: those verify
// "some glyph is followed by the state word"; these verify "it's specifically THIS glyph". A swap
// (e.g. bullet ↔ circle) would still look plausible but would break the design contract.
const GLYPH_BY_STATE = [
	{state: STATES.INITIAL, glyph: figures.circle, name: "circle"},
	{state: STATES.READY, glyph: figures.bullet, name: "bullet"},
	{state: STATES.STALE, glyph: figures.circle, name: "circle"},
	{state: STATES.ERROR, glyph: figures.cross, name: "cross"},
];
for (const {state, glyph, name} of GLYPH_BY_STATE) {
	test(`renderStatusLine: ${state} uses the ${name} glyph`, (t) => {
		const plain = stripAnsi(renderStatusLine({...createInitialState(), state}));
		t.true(plain.includes(glyph),
			`expected output to contain ${JSON.stringify(glyph)}, got ${JSON.stringify(plain)}`);
	});
}

// Locks the color chosen per state. Color is the primary semantic signal to a human reader
// (green=healthy, yellow=attention, red=error) and stripAnsi throws it away — so the plain-text
// tests above would happily accept a swap. Build the expected wrapped-word substring with the
// same chalk instance the renderer uses; matching it in the output proves the state word is
// wrapped in exactly that color span (not merely that the code appears somewhere on the line).
const WIDTH = "building".length;
const COLOR_BY_STATE = [
	{state: STATES.INITIAL, wrap: (x) => chalk.dim(x), word: "starting", name: "dim"},
	{state: STATES.READY, wrap: (x) => chalk.green(x), word: "ready", name: "green"},
	{state: STATES.STALE, wrap: (x) => chalk.yellow(x), word: "stale", name: "yellow"},
	{state: STATES.BUILDING, wrap: (x) => chalk.yellow(x), word: "building", name: "yellow"},
	{state: STATES.ERROR, wrap: (x) => chalk.red(x), word: "error", name: "red"},
];
for (const {state, wrap, word, name} of COLOR_BY_STATE) {
	test(`renderStatusLine: ${state} state is rendered in ${name}`, (t) => {
		const out = renderStatusLine({...createInitialState(), state});
		const expected = wrap(word.padEnd(WIDTH));
		t.true(out.includes(expected),
			`expected the "${word}" label to be wrapped in ${name}; ` +
			`looked for ${JSON.stringify(expected)} in ${JSON.stringify(out)}`);
	});
}
