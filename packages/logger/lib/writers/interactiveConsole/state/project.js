// Region 2 — root project. Populated by `ui5.project-resolved` and, when
// framework usage is actually resolved for the current run, by
// `ui5.project-framework-resolved`.
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
}

export function setFramework(state, framework) {
	state.framework = framework ? {
		name: framework.name,
		version: framework.version,
	} : null;
}

export function enableProjectPlaceholders(state) {
	state.showPlaceholders = true;
}
