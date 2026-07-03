// Region 5 — build. Populated by `ui5.build-metadata`, `ui5.build-status`,
// `ui5.project-build-metadata`, `ui5.project-build-status`, `ui5.serve-status`.

export const STATES = Object.freeze({
	INITIAL: "initial",
	STARTING: "starting", // pre-populated placeholder before the first real state arrives
	READY: "ready",
	STALE: "stale",
	BUILDING: "building",
	ERROR: "error",
});

export function createBuildState() {
	return {
		state: STATES.INITIAL,
		// During `building`: current project counter (1-based) and total projects.
		// Both are reset by `ui5.build-metadata` and by `serve-building`.
		currentProjectIndex: 0,
		totalProjects: 0,
		currentProjectName: "",
		currentTaskName: "",
		// Names of projects collected via `serve-stale` payloads — used to label
		// the stale state if/when the renderer wants to.
		changedProjects: [],
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

export function setError(state, message) {
	state.errorMessage = message || "";
	transitionTo(state, STATES.ERROR);
}

// Advance the region into a "starting" placeholder state so the Status row is
// visible from the first frame. Called from `ui5.tool-mode`. Real state
// transitions (READY/BUILDING/…) replace it.
export function enablePlaceholders(state) {
	if (state.state === STATES.INITIAL) {
		state.state = STATES.STARTING;
	}
}
