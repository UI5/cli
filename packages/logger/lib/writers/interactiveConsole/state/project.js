// Region 2 — root project. Populated by `ui5.project-resolved`.
export function createProjectState() {
	return {
		project: null, // {name, type, version}
		framework: null, // {name, version} | null
		// When true, the region renders dim "resolving…" placeholders in place
		// of real data. Enabled by `ui5.tool-mode` before the graph is built so
		// the layout is stable from the very first frame.
		showPlaceholders: false,
	};
}

export function setProject(state, evt) {
	state.project = {name: evt.name, type: evt.type, version: evt.version};
	state.framework = evt.framework ? {name: evt.framework.name, version: evt.framework.version} : null;
}

export function enablePlaceholders(state) {
	state.showPlaceholders = true;
}
