// Region 1 — header. Populated by `ui5.tool-info`. Set once, never changes.
export function createHeaderState() {
	return {
		tool: null, // {name, version} — null while unknown
	};
}

export function setTool(state, tool) {
	state.tool = tool ? {name: tool.name, version: tool.version} : null;
}

export function hasContent(state) {
	return state.tool !== null;
}
