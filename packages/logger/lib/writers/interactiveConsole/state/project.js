// Region 2 — root project. Populated by `ui5.project-resolved`.
export function createProjectState() {
	return {
		project: null, // {name, type, version}
		framework: null, // {name, version} | null
	};
}

export function setProject(state, evt) {
	state.project = {name: evt.name, type: evt.type, version: evt.version};
	state.framework = evt.framework ? {name: evt.framework.name, version: evt.framework.version} : null;
}

export function hasContent(state) {
	return state.project !== null;
}
