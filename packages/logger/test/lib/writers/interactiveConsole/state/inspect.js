import test from "ava";

import {
	createInspectState,
	classifyState,
	setInspectNow,
	recordRequestStart,
	recordRequestEnd,
	recordBuildStart,
	recordBuildProject,
	recordBuildDone,
	hasInFlight,
	isNewWaveReady,
	needsInspectTick,
	buildInspectRows,
	MAX_REQUESTS,
	WAVE_GAP_MS,
	ALL_PROJECTS,
} from "../../../../../lib/writers/interactiveConsole/state/inspect.js";

// Helper: a [seconds, nanoseconds] hrtime tuple for a whole-millisecond value.
const ms = (value) => [Math.floor(value / 1000), (value % 1000) * 1e6];

// The active span of a row's bar as a fraction of the window: from the earliest segment start to the
// latest segment end.
const spanFrac = (row) => {
	if (row.segments.length === 0) {
		return 0;
	}
	const start = Math.min(...row.segments.map((s) => s.startFrac));
	const end = Math.max(...row.segments.map((s) => s.endFrac));
	return end - start;
};

test("createInspectState: starts empty", (t) => {
	const state = createInspectState();
	t.deepEqual(state.requests, []);
	t.deepEqual(state.builds, []);
	t.deepEqual({...state.projectStates}, {});
	t.is(state.nowMs, 0);
});

test("classifyState: maps project states to render classes", (t) => {
	t.is(classifyState("fresh"), "ready");
	t.is(classifyState("errored"), "error");
	t.is(classifyState("building"), "stale");
	t.is(classifyState("initial"), "stale");
	t.is(classifyState("invalidated"), "stale");
	t.is(classifyState("validating"), "stale");
	t.is(classifyState(null), "stale", "unknown state defaults to stale");
});

test("setInspectNow: stores the render clock in milliseconds", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(1234));
	t.is(state.nowMs, 1234);
});

test("recordRequestStart: appends an in-flight request and tracks project state", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {
		id: 1, path: "/resources/sap/m/Button.js",
		projects: [{name: "sap.m", state: "building"}], hrtime: ms(0),
	});
	t.is(state.requests.length, 1);
	const [req] = state.requests;
	t.is(req.id, 1);
	t.is(req.path, "/resources/sap/m/Button.js");
	t.deepEqual(req.projects, ["sap.m"]);
	t.is(req.primary, "sap.m");
	t.is(req.resolvedProject, null);
	t.false(req.notFound);
	t.is(req.startMs, 0);
	t.is(req.endMs, null);
	t.is(state.projectStates["sap.m"], "building");
	t.true(hasInFlight(state));
});

test("recordRequestEnd: closes the matching request", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 7, path: "/x", projects: [{name: "a", state: "fresh"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 7, hrtime: ms(500), resolvedProject: "a", found: true});
	const [req] = state.requests;
	t.is(req.endMs, 500);
	t.is(req.resolvedProject, "a");
	t.false(hasInFlight(state));
});

test("isNewWaveReady: becomes ready after a full quiet gap", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "a", state: "fresh"}], hrtime: ms(0)});
	t.false(isNewWaveReady(state), "an in-flight request keeps the wave active");
	t.true(needsInspectTick(state));

	recordRequestEnd(state, {id: 1, hrtime: ms(500), resolvedProject: "a", found: true});
	setInspectNow(state, ms(500 + WAVE_GAP_MS - 1));
	t.false(isNewWaveReady(state), "the quiet period has not elapsed");
	t.true(needsInspectTick(state), "the timer stays active until the indicator can render");

	setInspectNow(state, ms(500 + WAVE_GAP_MS));
	t.true(isNewWaveReady(state));
	t.false(needsInspectTick(state), "the timer can stop after the indicator renders");
});

test("recordRequestEnd: moves a failed request to the errored project", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(500));
	recordRequestStart(state, {
		id: 7, path: "/themes/x",
		projects: [{name: "sap.ui.core", state: "fresh"}, {name: "themelib_x", state: "building"}],
		hrtime: ms(0),
	});
	recordRequestEnd(state, {
		id: 7, hrtime: ms(500), error: true, erroredProject: "themelib_x",
	});

	const [row] = buildInspectRows(state);
	t.is(row.name, "themelib_x");
	t.is(row.klass, "error");
});

test("recordRequestEnd: falls back to the request group for an unspecified errored project", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {
		id: 1, path: "/resources/sap/m/x.js",
		projects: [{name: "sap.m", state: "building"}], hrtime: ms(0),
	});
	recordRequestEnd(state, {id: 1, hrtime: ms(10), error: true});
	recordRequestStart(state, {id: 2, path: "/unknown", projects: [], hrtime: ms(20)});
	recordRequestEnd(state, {id: 2, hrtime: ms(30), error: true});

	t.is(state.requests[0].erroredProject, "sap.m");
	t.is(state.requests[1].erroredProject, ALL_PROJECTS);
});

test("recordRequestEnd: unknown id is a no-op", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "a", state: "fresh"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 999, hrtime: ms(10), resolvedProject: "a"});
	t.is(state.requests[0].endMs, null, "the unmatched end leaves the open request untouched");
});

test("recordBuildStart / recordBuildDone: open then close one cycle", (t) => {
	const state = createInspectState();
	recordBuildStart(state, ms(100));
	t.is(state.builds.length, 1);
	t.is(state.builds[0].endMs, null);
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(900), [0, 800e6]);
	t.is(state.builds[0].startMs, 100);
	t.is(state.builds[0].endMs, 900);
	t.deepEqual(state.builds[0].durationHr, [0, 800e6]);
	t.deepEqual(state.builds[0].projects, ["sap.m"]);
});

test("recordBuildStart: a second start before done keeps the earliest open cycle", (t) => {
	const state = createInspectState();
	recordBuildStart(state, ms(100));
	recordBuildStart(state, ms(200));
	t.is(state.builds.length, 1);
	t.is(state.builds[0].startMs, 100);
});

test("recordBuildProject: records each project with task execution once", (t) => {
	const state = createInspectState();
	recordBuildProject(state, "before-start");
	recordBuildStart(state, ms(100));
	recordBuildProject(state, "sap.m");
	recordBuildProject(state, "sap.m");
	recordBuildProject(state, "sap.ui.fl");
	recordBuildProject(state);
	t.deepEqual(state.builds[0].projects, ["sap.m", "sap.ui.fl"]);
});

test("recordBuildDone: without a prior start derives the start from the duration", (t) => {
	const state = createInspectState();
	recordBuildDone(state, ms(900), [0, 800e6]);
	t.is(state.builds.length, 1);
	t.is(state.builds[0].endMs, 900);
	t.is(state.builds[0].startMs, 100, "900ms end minus 800ms duration");
});

test("recordRequestStart: caps a never-quiet wave at MAX_REQUESTS", (t) => {
	const state = createInspectState();
	// All requests stay in flight, so the wave never goes quiet and the buffer is bounded by the cap.
	for (let i = 0; i < MAX_REQUESTS + 50; i++) {
		recordRequestStart(state, {id: i, path: "/x", projects: [{name: "a", state: "building"}], hrtime: ms(0)});
	}
	t.is(state.requests.length, MAX_REQUESTS);
	t.is(state.requests[0].id, 50, "oldest ids are dropped first");
});

test("recordRequestStart: a request after a quiet gap wipes the previous wave", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordBuildStart(state, ms(0));
	recordBuildDone(state, ms(100), [0, 100e6]);
	recordRequestEnd(state, {id: 1, hrtime: ms(100), resolvedProject: "sap.m"});
	// A new request arriving a full gap after the last response starts a fresh wave.
	recordRequestStart(state, {
		id: 2, path: "/b", projects: [{name: "sap.ui.core", state: "fresh"}], hrtime: ms(100 + WAVE_GAP_MS),
	});
	t.deepEqual(state.requests.map((r) => r.id), [2], "only the new wave's request remains");
	t.deepEqual(state.builds, [], "the previous wave's builds are wiped");
	t.is(state.projectStates["sap.m"], undefined, "the previous wave's project states are wiped");
	t.is(state.projectStates["sap.ui.core"], "fresh", "the new wave's project state is tracked");
});

test("recordRequestStart: a request within the gap continues the wave", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 1, hrtime: ms(100), resolvedProject: "sap.m"});
	// One millisecond short of the gap: the same wave continues and accumulates.
	recordRequestStart(state, {
		id: 2, path: "/b", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(100 + WAVE_GAP_MS - 1),
	});
	t.deepEqual(state.requests.map((r) => r.id), [1, 2], "both requests belong to the same wave");
});

test("recordRequestStart: an in-flight request keeps the wave open across any gap", (t) => {
	const state = createInspectState();
	// A long-running (never-ended) request. A much later request must not wipe it: the wave is still
	// open while a request is in flight.
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordRequestStart(state, {
		id: 2, path: "/b", projects: [{name: "sap.m", state: "building"}], hrtime: ms(10 * WAVE_GAP_MS),
	});
	t.deepEqual(state.requests.map((r) => r.id), [1, 2], "the in-flight request keeps the wave alive");
});

test("buildInspectRows: empty when there are no requests", (t) => {
	t.deepEqual(buildInspectRows(createInspectState()), []);
});

test("buildInspectRows: one row per project group, segments span the wave", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 1, hrtime: ms(2000), resolvedProject: "sap.m"});
	const rows = buildInspectRows(state);
	t.is(rows.length, 1);
	const [row] = rows;
	t.is(row.name, "sap.m");
	t.is(row.klass, "ready", "a resolved request leaves the reader ready");
	t.is(row.segments.length, 1);
	t.is(row.segments[0].startFrac, 0);
	t.is(row.segments[0].endFrac, 1, "the lone request fills the wave's span");
	t.is(row.reqCount, 1);
	t.deepEqual(row.buildHrs, []);
});

test("buildInspectRows: overlapping requests to one reader merge into a single segment", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(1000)});
	recordRequestEnd(state, {id: 1, hrtime: ms(2000), resolvedProject: "sap.m"});
	recordRequestStart(state, {id: 2, path: "/b", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(1500)});
	recordRequestEnd(state, {id: 2, hrtime: ms(4000), resolvedProject: "sap.m"});
	const rows = buildInspectRows(state);
	t.is(rows.length, 1);
	t.is(rows[0].reqCount, 2);
	t.is(rows[0].klass, "ready");
	t.is(rows[0].segments.length, 1, "the two overlapping requests collapse into one block");
	// The wave spans its earliest start (1000ms) to its latest response (4000ms), so the merged block
	// fills the whole width.
	t.is(rows[0].segments[0].startFrac, 0, "the wave starts at the earliest request");
	t.is(Math.round(spanFrac(rows[0]) * 1000) / 1000, 1, "the merged block fills the wave span");
});

test("buildInspectRows: separated bursts to one reader render as several segments", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	// Three short, well-separated bursts to the same reader across the wave.
	for (const [id, at] of [[1, 0], [2, 4000], [3, 8000]]) {
		recordRequestStart(state, {
			id, path: "/a", projects: [{name: "sap.ui.core", state: "fresh"}], hrtime: ms(at),
		});
		recordRequestEnd(state, {id, hrtime: ms(at + 200), resolvedProject: "sap.ui.core"});
	}
	const [row] = buildInspectRows(state);
	t.is(row.segments.length, 3, "each separated burst keeps its own bar segment");
	t.is(row.reqCount, 3);
});

test("buildInspectRows: ordered by start time so waves read top-to-bottom", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "later", state: "fresh"}], hrtime: ms(5000)});
	recordRequestStart(state, {id: 2, path: "/b", projects: [{name: "earlier", state: "fresh"}], hrtime: ms(1000)});
	const rows = buildInspectRows(state);
	t.deepEqual(rows.map((r) => r.name), ["earlier", "later"]);
});

test("buildInspectRows: attributes an overlapping build cycle to the group", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordBuildStart(state, ms(0));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(800), [0, 800e6]);
	recordRequestEnd(state, {id: 1, hrtime: ms(900), resolvedProject: "sap.m"});
	const [row] = buildInspectRows(state);
	t.deepEqual(row.buildHrs, [[0, 800e6]], "the build its request triggered is attributed to the group");
});

test("buildInspectRows: a reader built twice in a wave collects both durations", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	// First request triggers a build; a mid-wave invalidation forces a second build for a later one.
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordBuildStart(state, ms(0));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(300), [0, 300e6]);
	recordRequestEnd(state, {id: 1, hrtime: ms(400), resolvedProject: "sap.m"});
	recordRequestStart(state, {id: 2, path: "/b", projects: [{name: "sap.m", state: "building"}], hrtime: ms(4000)});
	recordBuildStart(state, ms(4000));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(4500), [0, 500e6]);
	recordRequestEnd(state, {id: 2, hrtime: ms(4600), resolvedProject: "sap.m"});
	const [row] = buildInspectRows(state);
	t.deepEqual(row.buildHrs, [[0, 300e6], [0, 500e6]], "both of the wave's builds are attributed, oldest first");
});

test("buildInspectRows: attributes a build only to projects built in the cycle", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {
		id: 1, path: "/core", projects: [{name: "sap.ui.core", state: "fresh"}], hrtime: ms(0),
	});
	recordRequestStart(state, {
		id: 2, path: "/theme", projects: [{name: "themelib_x", state: "building"}], hrtime: ms(10),
	});
	recordBuildStart(state, ms(10));
	recordBuildProject(state, "themelib_x");
	recordBuildDone(state, ms(52), [0, 42e6]);
	recordRequestEnd(state, {id: 2, hrtime: ms(52), resolvedProject: "themelib_x"});
	recordRequestEnd(state, {id: 1, hrtime: ms(60), resolvedProject: "sap.ui.core"});

	const rows = buildInspectRows(state);
	t.deepEqual(rows.find((row) => row.name === "sap.ui.core").buildHrs, [],
		"an overlapping cache hit does not inherit another project's build");
	t.deepEqual(rows.find((row) => row.name === "themelib_x").buildHrs, [[0, 42e6]]);
});

test("buildInspectRows: shows build work for a dependency without a direct request", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(1000));
	recordRequestStart(state, {
		id: 1, path: "/resources/sap/ui/documentation/sdk/index.html",
		projects: [{name: "sap.ui.documentation", state: "building"}], hrtime: ms(0),
	});
	recordBuildStart(state, ms(100));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(900), [0, 800e6]);
	recordRequestEnd(state, {
		id: 1, hrtime: ms(1000), resolvedProject: "sap.ui.documentation", found: true,
	});

	const rows = buildInspectRows(state);
	t.deepEqual(rows.map((row) => row.name), ["sap.ui.documentation", "sap.m"]);
	const dependency = rows[1];
	t.true(dependency.dependency);
	t.is(dependency.reqCount, 0);
	t.deepEqual(dependency.buildHrs, [[0, 800e6]]);
	t.deepEqual(dependency.segments, [{startFrac: 0.1, endFrac: 0.9}],
		"the dependency bar uses the build cycle rather than the request interval");
});

test("buildInspectRows: shows an in-progress dependency build", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(1000));
	recordRequestStart(state, {
		id: 1, path: "/resources/docs/x.html",
		projects: [{name: "docs", state: "building"}], hrtime: ms(0),
	});
	recordBuildStart(state, ms(100));
	recordBuildProject(state, "sap.m");

	const dependency = buildInspectRows(state).find((row) => row.name === "sap.m");
	t.true(dependency.dependency);
	t.true(dependency.building);
	t.deepEqual(dependency.buildHrs, []);
	t.deepEqual(dependency.segments, [{startFrac: 0.1, endFrac: 1}]);
});

test("buildInspectRows: combines repeated dependency builds", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(1000));
	recordRequestStart(state, {
		id: 1, path: "/resources/docs/x.html",
		projects: [{name: "docs", state: "building"}], hrtime: ms(0),
	});
	for (const [start, end] of [[100, 200], [700, 900]]) {
		recordBuildStart(state, ms(start));
		recordBuildProject(state, "sap.m");
		recordBuildDone(state, ms(end), ms(end - start));
	}
	recordRequestEnd(state, {id: 1, hrtime: ms(1000), resolvedProject: "docs", found: true});

	const dependency = buildInspectRows(state).find((row) => row.name === "sap.m");
	t.deepEqual(dependency.buildHrs, [ms(100), ms(200)]);
	t.deepEqual(dependency.segments, [
		{startFrac: 0.1, endFrac: 0.2},
		{startFrac: 0.7, endFrac: 0.9},
	]);
});

test("buildInspectRows: uses resolvedProject over the start primary when known", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	// Namespace routing offered sap.ui.core first, but a theme library served the resource.
	recordRequestStart(state, {
		id: 1, path: "/resources/sap/ui/core/themes/x/library.css",
		projects: [{name: "sap.ui.core", state: "fresh"}], hrtime: ms(0),
	});
	recordRequestEnd(state, {id: 1, hrtime: ms(100), resolvedProject: "themelib_x"});
	const [row] = buildInspectRows(state);
	t.is(row.name, "themelib_x");
});

test("recordRequestStart: tolerates a missing projects list and hrtime", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 1, path: "/x"});
	const [req] = state.requests;
	t.deepEqual(req.projects, []);
	t.is(req.primary, null);
	t.is(req.startMs, 0, "a missing hrtime resolves to 0ms");
});

test("recordRequestEnd: a missing resolvedProject resolves to null", (t) => {
	const state = createInspectState();
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "a", state: "fresh"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 1, hrtime: ms(10)});
	t.is(state.requests[0].resolvedProject, null);
});

test("recordBuildDone: a closed cycle without a duration keeps a null durationHr", (t) => {
	const state = createInspectState();
	recordBuildStart(state, ms(0));
	recordBuildDone(state, ms(100));
	t.is(state.builds[0].durationHr, null);
});

test("recordBuildDone: derived cycle without a duration starts at the end time", (t) => {
	const state = createInspectState();
	recordBuildDone(state, ms(100));
	t.is(state.builds[0].startMs, 100, "no duration means a zero-length derived cycle");
	t.is(state.builds[0].durationHr, null);
});

test("buildInspectRows: an unresolved request is bucketed under the all-projects reader", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/resources/foo.js"}); // no projects -> no primary
	recordRequestEnd(state, {id: 1, hrtime: ms(500), resolvedProject: null, found: false});
	const rows = buildInspectRows(state);
	t.is(rows.length, 1);
	t.is(rows[0].name, ALL_PROJECTS, "the miss falls through to the all-projects reader row");
	t.is(rows[0].klass, "stale", "a miss never flips to ready");
	t.true(rows[0].notFound);
});

test("buildInspectRows: a completed miss keeps its primary candidate and not-found outcome", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {
		id: 1, path: "/favicon.ico",
		projects: [{name: "openui5-testsuite", state: "initial"}], hrtime: ms(0),
	});
	recordRequestEnd(state, {
		id: 1, hrtime: ms(500), resolvedProject: null, found: false, error: false,
	});

	const [row] = buildInspectRows(state);
	t.is(row.name, "openui5-testsuite");
	t.true(row.notFound);
});

test("buildInspectRows: an in-flight request without a primary is not shown under all-projects", (t) => {
	// A namespace-less path (e.g. /resources/sap-ui-core.js) has no primary and would land in the
	// all-projects bucket until it resolves. Suppressing it in flight avoids a flickering row; once
	// it resolves it appears under its real project.
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/resources/sap-ui-core.js"}); // in flight, no primary
	t.deepEqual(buildInspectRows(state), [], "no speculative all-projects row while in flight");
	recordRequestEnd(state, {id: 1, hrtime: ms(100), resolvedProject: "sap.ui.core"});
	const rows = buildInspectRows(state);
	t.is(rows.length, 1);
	t.is(rows[0].name, "sap.ui.core", "the resolved request appears under its real project");
});

test("buildInspectRows: an in-flight request runs its bar to the render clock", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	const [row] = buildInspectRows(state);
	t.is(row.segments.length, 1);
	t.is(row.segments[0].startFrac, 0);
	t.is(row.segments[0].endFrac, 1, "the open request's segment fills the wave up to now");
});

test("buildInspectRows: an open build cycle without a duration is not attributed", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordBuildStart(state, ms(0)); // open, no duration yet
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 1, hrtime: ms(500), resolvedProject: "sap.m"});
	t.deepEqual(buildInspectRows(state)[0].buildHrs, []);
});

test("buildInspectRows: attributes a non-overlapping build cycle from the same request wave", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 1, hrtime: ms(500), resolvedProject: "sap.m"});
	// A later request in the wave can cause a build whose project-specific requests already ended.
	recordBuildStart(state, ms(8000));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(9000), [1, 0]);
	t.deepEqual(buildInspectRows(state)[0].buildHrs, [[1, 0]]);
});

test("buildInspectRows: does not attribute a startup build to the first request wave", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordBuildStart(state, ms(0));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(1000), [1, 0]);
	recordRequestStart(state, {id: 1, path: "/x", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(2000)});
	recordRequestEnd(state, {id: 1, hrtime: ms(2500), resolvedProject: "sap.m"});
	t.deepEqual(buildInspectRows(state)[0].buildHrs, []);
});

test("buildInspectRows: a completed build is attributed to a still in-flight request", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(2000));
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordBuildStart(state, ms(0));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(100), [0, 100e6]);
	// The request is still running when the build it triggered finishes; the build is attributed to
	// its open interval, which runs to the render clock.
	const [row] = buildInspectRows(state);
	t.deepEqual(row.buildHrs, [[0, 100e6]]);
});

test("buildInspectRows: a wave persists until a new one replaces it", (t) => {
	const state = createInspectState();
	// Wave one: a single resolved request that triggered a build.
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "building"}], hrtime: ms(0)});
	recordBuildStart(state, ms(0));
	recordBuildProject(state, "sap.m");
	recordBuildDone(state, ms(100), [0, 100e6]);
	recordRequestEnd(state, {id: 1, hrtime: ms(100), resolvedProject: "sap.m"});
	// Long after the wave completed, it is still on screen with its own count and build time.
	setInspectNow(state, ms(100 + 5 * WAVE_GAP_MS));
	const [row] = buildInspectRows(state);
	t.is(row.name, "sap.m");
	t.is(row.reqCount, 1);
	t.deepEqual(row.buildHrs, [[0, 100e6]]);
	// A new request after the quiet gap starts a fresh wave, replacing the previous reader.
	recordRequestStart(state, {
		id: 2, path: "/b", projects: [{name: "sap.ui.core", state: "fresh"}], hrtime: ms(100 + 5 * WAVE_GAP_MS),
	});
	recordRequestEnd(state, {id: 2, hrtime: ms(100 + 5 * WAVE_GAP_MS + 50), resolvedProject: "sap.ui.core"});
	setInspectNow(state, ms(100 + 5 * WAVE_GAP_MS + 50));
	const rows = buildInspectRows(state);
	t.is(rows.length, 1, "the previous wave's reader is gone");
	t.is(rows[0].name, "sap.ui.core");
	t.deepEqual(rows[0].buildHrs, [], "the new wave starts with no attributed builds");
});

test("buildInspectRows: in-flight requests add to the wave's request count", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	// One completed request and one still in flight for the same reader.
	recordRequestStart(state, {id: 1, path: "/a", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(0)});
	recordRequestEnd(state, {id: 1, hrtime: ms(100), resolvedProject: "sap.m"});
	recordRequestStart(state, {id: 2, path: "/b", projects: [{name: "sap.m", state: "fresh"}], hrtime: ms(200)});
	const [row] = buildInspectRows(state);
	t.is(row.reqCount, 2, "one completed plus one in-flight request");
});

test("buildInspectRows: an unresolved request to an errored project keeps the error class", (t) => {
	const state = createInspectState();
	setInspectNow(state, ms(10000));
	recordRequestStart(state, {
		id: 1, path: "/resources/broken/x.js",
		projects: [{name: "broken.lib", state: "errored"}], hrtime: ms(0),
	});
	// The build failed, so the request resolves no project: the reader keeps its errored start state.
	recordRequestEnd(state, {id: 1, hrtime: ms(500), resolvedProject: null, found: false, error: true});
	const [row] = buildInspectRows(state);
	t.is(row.name, "broken.lib");
	t.is(row.klass, "error");
	t.false(row.notFound, "a failed request keeps its error outcome");
});
