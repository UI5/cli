// Pure state holder for the live banner. Mutated directly by Banner setters
// and event handlers, each of which calls `Banner.prototype.#render` after
// updating the fields it owns.

export const STATES = Object.freeze({
	INITIAL: "initial",
	READY: "ready",
	STALE: "stale",
	BUILDING: "building",
	ERROR: "error",
});

export function createInitialState() {
	return {
		state: STATES.INITIAL,
		// Header sections — filled in incrementally by Banner setters so the
		// header can paint a skeleton (with placeholders) before all the data
		// is known. `null` means "not yet known"; the renderer shows a
		// placeholder in that case.
		brand: null,
		urls: null,
		project: null,
		framework: null,
		acceptRemoteConnections: false,
		// Expected number of network address lines, supplied up front by the
		// CLI so the initial paint reserves the same number of rows that
		// setUrls() will later fill in. Keeps the live region from re-flowing
		// when the real URLs arrive.
		networkAddressCount: 0,
		// During `building`: current project counter (1-based) and total projects.
		// Both are reset by `ui5.build-metadata`.
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
	};
}
