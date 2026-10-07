// Region 3 (inspect, opt-in via UI5_CLI_INSPECT). A per-wave list of the project readers the serve
// has resolved requests for, drawn as a waterfall color-coded by project state. Populated by
// `ui5.serve-request` events emitted from @ui5/project's BuildReader, plus build-cycle timing from
// `ui5.serve-status` and task execution from `ui5.project-build-status`.
//
// A "wave" is one burst of requests. The whole wave stays on screen (counts, bars, build durations)
// until the next wave starts: a request that arrives more than WAVE_GAP_MS after the previous wave's
// last response wipes the state and begins a fresh wave. So each wave shows self-contained
// information, the request count and the build durations for that wave only, not a running total
// since the serve started. This module is pure data, mutators, and a pure selector. The drawing
// lives in render.js (renderInspectRegion).

// Upper bound on retained requests within a single wave. The oldest are dropped first so a wave that
// never goes quiet (continuous traffic) can't grow the buffer without limit. Projects commonly serve
// 1k+ requests per wave, so this holds a large burst with headroom.
export const MAX_REQUESTS = 3000;

// Quiet gap, in milliseconds, that ends a wave. A request arriving at least this long after the
// previous wave's last response starts a fresh wave: the previous wave's readers are wiped and the
// waterfall is drawn anew. In-flight requests keep a wave open regardless of this gap.
export const WAVE_GAP_MS = 10000;

// Synthetic reader key for a request that resolves to no project: it fell through every candidate to
// the last-resort all-projects reader (a 404 that rebuilt everything). Grouping these under one row
// surfaces the expensive all-projects builds that would otherwise be dropped.
export const ALL_PROJECTS = "all projects";

export function createInspectState() {
	return {
		// Requests of the current wave, oldest first. Each: {id, path, projects, primary,
		// resolvedProject, erroredProject, notFound, startMs, endMs}. endMs is null while the request
		// is in flight.
		requests: [],
		// Build cycles of the current wave. Each: {startMs, endMs, durationHr, projects, requestWave}.
		// projects contains only projects that emitted task-start. requestWave excludes startup cycles
		// that began without a serve request. endMs is null while building.
		builds: [],
		// Latest lifecycle state (a PROJECT_STATES string) seen per project in the current wave, from
		// `start` payloads.
		projectStates: Object.create(null),
		// Render clock in milliseconds on the shared process.hrtime() scale. Set by the writer
		// before each compose via setInspectNow, so the selector and renderer stay pure.
		nowMs: 0,
	};
}

// Convert a process.hrtime() reading or duration ([seconds, nanoseconds]) to a millisecond scalar
// on the same monotonic clock. Request timestamps and the writer's build timestamps share the
// process clock, so their scalars are directly comparable.
function hrToMs(hr) {
	return Array.isArray(hr) ? hr[0] * 1000 + hr[1] / 1e6 : 0;
}

// Maps a @ui5/project PROJECT_STATES value to the three render classes. FRESH serves directly, so
// it is "ready" (grey). ERRORED is surfaced on its own. Everything else needs validation or a build
// and is "stale" (orange). An unknown or null state is treated as stale (work is likely pending).
export function classifyState(state) {
	if (state === "fresh") {
		return "ready";
	}
	if (state === "errored") {
		return "error";
	}
	return "stale";
}

export function setInspectNow(state, hrtime) {
	state.nowMs = hrToMs(hrtime);
}

export function recordRequestStart(state, evt) {
	const startMs = hrToMs(evt.hrtime);
	startNewWaveIfQuiet(state, startMs);
	const projects = Array.isArray(evt.projects) ? evt.projects : [];
	for (const p of projects) {
		state.projectStates[p.name] = p.state;
	}
	state.requests.push({
		id: evt.id,
		path: evt.path,
		projects: projects.map((p) => p.name),
		primary: projects[0]?.name ?? null,
		resolvedProject: null,
		erroredProject: null,
		notFound: false,
		startMs,
		endMs: null,
	});
	// Bound a never-quiet wave; the newest requests are the interesting ones, so drop the oldest.
	if (state.requests.length > MAX_REQUESTS) {
		state.requests = state.requests.slice(state.requests.length - MAX_REQUESTS);
	}
}

// Wipes the previous wave when a new request opens a fresh one. The wave is quiet only when every
// request has completed and the gap from the last response to this request reaches WAVE_GAP_MS; an
// in-flight request keeps the wave open no matter how long it runs.
function startNewWaveIfQuiet(state, startMs) {
	if (state.requests.length === 0) {
		return;
	}
	let lastEnd = -Infinity;
	for (const req of state.requests) {
		if (req.endMs === null) {
			return; // a request is still in flight: the wave is not quiet
		}
		if (req.endMs > lastEnd) {
			lastEnd = req.endMs;
		}
	}
	if (startMs - lastEnd >= WAVE_GAP_MS) {
		state.requests = [];
		state.builds = [];
		state.projectStates = Object.create(null);
	}
}

export function recordRequestEnd(state, evt) {
	// Scan from the back: the matching request is almost always one of the most recent.
	for (let i = state.requests.length - 1; i >= 0; i--) {
		const req = state.requests[i];
		if (req.id === evt.id) {
			req.endMs = hrToMs(evt.hrtime);
			req.resolvedProject = evt.resolvedProject ?? null;
			req.notFound = evt.found === false && !evt.error;
			if (evt.error) {
				req.erroredProject = evt.erroredProject ?? req.primary ?? ALL_PROJECTS;
				state.projectStates[req.erroredProject] = "errored";
			}
			break;
		}
	}
}

export function recordBuildStart(state, hrtime) {
	const open = state.builds.find((b) => b.endMs === null);
	if (open) {
		// A serve-building without an intervening serve-build-done: keep the earliest start.
		return;
	}
	state.builds.push({
		startMs: hrToMs(hrtime), endMs: null, durationHr: null, projects: [],
		requestWave: state.requests.length > 0,
	});
}

// Attribute the open cycle only after one of the project's tasks starts. ProjectBuilder can enter a
// dependency's build pipeline without executing work when all task stages are served from cache.
export function recordBuildProject(state, projectName) {
	if (!projectName) {
		return;
	}
	const open = state.builds.find((b) => b.endMs === null);
	if (open && !open.projects.includes(projectName)) {
		open.projects.push(projectName);
	}
}

export function recordBuildDone(state, hrtime, durationHr) {
	const endMs = hrToMs(hrtime);
	const open = state.builds.find((b) => b.endMs === null);
	if (open) {
		open.endMs = endMs;
		open.durationHr = durationHr ?? null;
		return;
	}
	// No matching serve-building was seen: derive the start from the reported duration so the cycle
	// still has an interval to overlap requests against.
	state.builds.push({
		startMs: endMs - hrToMs(durationHr), endMs, durationHr: durationHr ?? null, projects: [],
		requestWave: state.requests.length > 0,
	});
}

// True while at least one request of the current wave is still awaiting its reader. The writer uses
// this to keep the animation tick running so in-flight bars grow while a build is in progress; once
// a wave's requests all resolve the tick stops and the final frame stays until the next wave.
export function hasInFlight(state) {
	return state.requests.some((r) => r.endMs === null);
}

// True once every request has completed and the quiet period that separates request waves has
// elapsed. The current wave remains visible until another request replaces it.
export function isNewWaveReady(state) {
	if (state.requests.length === 0 || hasInFlight(state)) {
		return false;
	}
	const lastEnd = Math.max(...state.requests.map((request) => request.endMs));
	return state.nowMs - lastEnd >= WAVE_GAP_MS;
}

// Keep the inspect timer active while bars can change or while the ready indicator is pending.
export function needsInspectTick(state) {
	return hasInFlight(state) || state.requests.length > 0 && !isNewWaveReady(state);
}

// Pure selector: produce one row per project reader for the current wave, plus one row for each
// dependency that executed build work without receiving a direct request. Rows are ordered by their
// first request or build time. Time offsets are fractions of the wave's span so the renderer can
// scale them to any bar width.
export function buildInspectRows(state) {
	const now = state.nowMs;
	const {windowStart, span} = computeWindow(state, now);
	const groups = groupRequests(state);

	const rows = [];
	for (const [key, group] of groups) {
		// Don't speculatively show the all-projects bucket while its only requests are still in flight.
		// A namespace-less path (e.g. /resources/sap-ui-core.js) has no primary and lands here until it
		// resolves to its real project, which would make the "all projects" row flicker in and out. The
		// bucket renders only once a request has completed as a miss.
		if (key === ALL_PROJECTS && group.requests.every((r) => r.endMs === null)) {
			continue;
		}
		// A served resource (resolvedProject === key) means the reader is ready now, whatever state it
		// was in at request start. A normal miss retains the candidate as its row key but carries a
		// separate not-found outcome. An errored build retains its error class.
		const resolved = group.requests.some((r) => r.resolvedProject === key);
		const klass = resolved ? "ready" : classifyState(state.projectStates[key]);
		rows.push({
			name: key,
			klass,
			dependency: false,
			building: false,
			notFound: klass !== "error" && group.requests.every((r) => r.notFound),
			segments: mergeSegments(group.requests, windowStart, span, now),
			buildHrs: collectBuilds(state, key),
			reqCount: group.requests.length,
			firstSeenMs: group.firstSeenMs,
		});
	}

	// A request for one project can build a stale build-time dependency first. Such a dependency has
	// no request group, but its task-start event records it on the build cycle. Give that work its own
	// row so the reader row does not hide the cause of the request latency.
	const directProjects = new Set(groups.keys());
	const dependencyBuilds = new Map();
	for (const build of state.builds) {
		if (!build.requestWave) {
			continue;
		}
		for (const projectName of build.projects) {
			if (directProjects.has(projectName)) {
				continue;
			}
			let projectBuilds = dependencyBuilds.get(projectName);
			if (!projectBuilds) {
				projectBuilds = [];
				dependencyBuilds.set(projectName, projectBuilds);
			}
			projectBuilds.push(build);
		}
	}
	for (const [name, builds] of dependencyBuilds) {
		const building = builds.some((build) => build.endMs === null);
		rows.push({
			name,
			klass: building ? "stale" : "ready",
			dependency: true,
			building,
			notFound: false,
			segments: mergeBuildSegments(builds, windowStart, span, now),
			buildHrs: builds.filter((build) => build.durationHr).map((build) => build.durationHr),
			reqCount: 0,
			firstSeenMs: Math.min(...builds.map((build) => build.startMs)),
		});
	}
	rows.sort((a, b) => a.firstSeenMs - b.firstSeenMs);
	for (const row of rows) {
		delete row.firstSeenMs;
	}
	return rows;
}

// Convert build-cycle intervals to the same segment format as request intervals. The full cycle is
// shown because the event stream identifies participating projects, but does not expose per-project
// start and end times.
function mergeBuildSegments(builds, windowStart, span, now) {
	return mergeSegments(builds.map((build) => ({
		startMs: build.startMs,
		endMs: build.endMs,
	})), windowStart, span, now);
}

// The bar window spans the whole wave: from the earliest request start to the latest response, or to
// the render clock while any request is still in flight (so an open bar grows). A completed wave
// therefore keeps a stable geometry no matter how much later it is rendered, until the next wave
// replaces it.
function computeWindow(state, now) {
	let earliest = Infinity;
	let latestEnd = -Infinity;
	let anyInFlight = false;
	for (const r of state.requests) {
		if (r.startMs < earliest) {
			earliest = r.startMs;
		}
		if (r.endMs === null) {
			anyInFlight = true;
		} else if (r.endMs > latestEnd) {
			latestEnd = r.endMs;
		}
	}
	if (earliest === Infinity) {
		return {windowStart: now, span: 1};
	}
	// A request is either in flight (counted above) or completed with an endMs, so once there is a
	// request and no in-flight one, latestEnd is a real timestamp.
	const windowEnd = anyInFlight ? now : latestEnd;
	return {windowStart: earliest, span: Math.max(1, windowEnd - earliest)};
}

// Collapses the wave's requests into one group per reader key, carrying the requests themselves (for
// the per-request bar segments and the build attribution) and the earliest start (for stable
// ordering). The key mirrors BuildReader's routing: resolved project, else the first candidate
// probed, else the ALL_PROJECTS bucket.
function groupRequests(state) {
	const groups = new Map();
	for (const req of state.requests) {
		const key = req.resolvedProject ?? req.erroredProject ?? req.primary ?? ALL_PROJECTS;
		let group = groups.get(key);
		if (!group) {
			group = {requests: [], firstSeenMs: req.startMs};
			groups.set(key, group);
		}
		group.requests.push(req);
		group.firstSeenMs = Math.min(group.firstSeenMs, req.startMs);
	}
	return groups;
}

// One bar segment per contiguous run of a reader's requests, as {startFrac, endFrac} over the wave.
// Requests that overlap or touch in time merge into a single segment; requests separated by a gap
// stay distinct, so several bursts to the same reader within a wave render as several bar segments.
// An in-flight request runs to the render clock (`now`), so its segment keeps growing until it ends.
function mergeSegments(requests, windowStart, span, now) {
	const intervals = requests
		.map((req) => {
			const start = Math.max(req.startMs, windowStart);
			const end = Math.max(start, req.endMs ?? now);
			return {startFrac: (start - windowStart) / span, endFrac: (end - windowStart) / span};
		})
		.sort((a, b) => a.startFrac - b.startFrac);
	const merged = [];
	for (const interval of intervals) {
		const last = merged[merged.length - 1];
		if (last && interval.startFrac <= last.endFrac) {
			last.endFrac = Math.max(last.endFrac, interval.endFrac);
		} else {
			merged.push({...interval});
		}
	}
	return merged;
}

// The durations of the current request wave's distinct build cycles that executed work for the
// reader, oldest first. A project's direct requests can follow an earlier bootstrap request that
// caused its build, so project execution within the wave is the correlation boundary. A reader
// built more than once in a wave (expensive, worth flagging) yields more than one duration.
function collectBuilds(state, key) {
	const durations = [];
	for (const build of state.builds) {
		if (!build.durationHr || !build.requestWave) {
			continue;
		}
		if (key !== ALL_PROJECTS && !build.projects.includes(key)) {
			continue;
		}
		durations.push(build.durationHr);
	}
	return durations;
}
