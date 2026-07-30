// Region 5 — build. Populated by `ui5.build-metadata`, `ui5.build-status`,
// `ui5.project-build-metadata`, `ui5.project-build-status`, `ui5.serve-status`.

export const STATES = Object.freeze({
	INITIAL: "initial",
	STARTING: "starting", // pre-populated placeholder before the first real state arrives
	READY: "ready",
	SETTLING: "settling", // changes seen, rebuild deferred until they quiesce
	BUILDING: "building",
	VALIDATING: "validating",
	ERROR: "error",
});

// States that animate a spinner. Consulted by both the tick scheduler in the
// interactive console writer and the status-line renderer, so a state either
// spins in both places or in neither.
export const SPINNING_STATES = new Set([STATES.SETTLING, STATES.BUILDING, STATES.VALIDATING]);

export function createBuildState() {
	return {
		state: STATES.INITIAL,
		// During `building`: current project counter (1-based) and total projects.
		// Both are reset by `ui5.build-metadata` and by `serve-building`.
		currentProjectIndex: 0,
		totalProjects: 0,
		currentProjectName: "",
		currentTaskName: "",
		// Names of projects currently stale, reported via `serve-stale`. The renderer surfaces
		// the count alongside the ready line.
		staleProjects: [],
		// Names of projects collected via `serve-validating` payloads — used to
		// label the validating state if/when the renderer wants to.
		validatingProjects: [],
		// Names of projects collected via `serve-settling` payloads — used to
		// label the settling state if/when the renderer wants to.
		pendingProjects: [],
		// Frame counter for the spinner (incremented by the tick loop).
		spinFrame: 0,
		// Most recent error captured by `serve-error`.
		errorMessage: "",
		// Duration of the most recent successful build, captured from the
		// `serve-build-done` event as a [seconds, nanoseconds] tuple — the same
		// shape that pretty-hrtime consumes, so the renderer can hand it
		// straight through.
		lastBuildHrtime: null,
		// Layout hints derived from build-metadata: pad the project/task columns
		// so status-line updates don't reflow.
		projectNameWidth: 0,
		taskNameWidth: 0,
		// Ordered list of projects announced by build-metadata. Used to compute
		// a stable 1-based `currentProjectIndex` when build-status events arrive.
		projectOrder: [],
		// True while the server is serving a last-good graph after a failed re-resolve (e.g. a
		// branch switch to a config the tooling can't resolve). The status line reuses the ERROR
		// rendering; this flag makes it sticky so the surviving BuildServer's `serve-ready` from
		// source churn can't repaint "ready" over it. Set by `ui5.project-resolve-failed`, cleared
		// by `ui5.project-resolve-succeeded`.
		degraded: false,
	};
}

// Zero the transient counters for a fresh build. Shared by `build-metadata`
// and the `serve-building` branch of `serve-status`; see doc item #7.
function resetBuildProgress(state) {
	state.currentProjectIndex = 0;
	state.currentProjectName = "";
	state.currentTaskName = "";
	state.spinFrame = 0;
}

export function beginBuild(state, projectOrder) {
	state.projectOrder = Array.from(projectOrder);
	state.totalProjects = state.projectOrder.length;
	state.projectNameWidth = state.projectOrder.reduce(
		(max, name) => Math.max(max, name.length), 0);
	resetBuildProgress(state);
}

export function advanceToProject(state, projectName) {
	const idx = state.projectOrder.indexOf(projectName);
	state.currentProjectIndex = idx >= 0 ?
		idx + 1 :
		state.currentProjectIndex + 1;
	state.currentProjectName = projectName;
	state.currentTaskName = "";
}

export function setTask(state, taskName) {
	state.currentTaskName = taskName;
	if (taskName.length > state.taskNameWidth) {
		state.taskNameWidth = taskName.length;
	}
}

export function transitionTo(state, newState) {
	state.state = newState;
	state.spinFrame = 0;
}

// Record the current stale-project set, reported via `serve-stale`. Does not touch the
// activity `state` or reset the spinner: the count updates in place beneath the current status.
export function setStale(state, staleProjects) {
	state.staleProjects = Array.isArray(staleProjects) ? staleProjects : [];
}

export function setError(state, message) {
	state.errorMessage = message || "";
	transitionTo(state, STATES.ERROR);
}

// Marks the server degraded after a failed re-resolve. The caller pairs this with `setError` to
// render the reason on the ERROR line; this flag keeps that line sticky against later `serve-ready`
// events from the surviving BuildServer until a successful re-resolve calls `clearDegraded`.
export function setDegraded(state) {
	state.degraded = true;
}

export function clearDegraded(state) {
	state.degraded = false;
}

// Advance the region into a "starting" placeholder state so the Status row is
// visible from the first frame. Called from `ui5.tool-mode`. Real state
// transitions (READY/BUILDING/…) replace it.
export function enableBuildPlaceholders(state) {
	if (state.state === STATES.INITIAL) {
		state.state = STATES.STARTING;
	}
}
