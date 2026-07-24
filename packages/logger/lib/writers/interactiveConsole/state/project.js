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
		// When true, the version slot(s) render a dim "resolving…" placeholder while the
		// project name and type keep showing. Enabled by `ui5.project-resolve-started` once a
		// definition change is known to be coming (a `git checkout`, a ui5.yaml edit) and the
		// resolved version is about to change. `setProject` clears it; a failed re-resolve
		// releases it via `clearVersionResolving`.
		versionResolving: false,
	};
}

export function setProject(state, evt) {
	state.project = {name: evt.name, type: evt.type, version: evt.version};
	// A resolve completed: drop the placeholder in favour of the new version.
	state.versionResolving = false;
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

// Blanks the version slot(s) to a "resolving…" placeholder: a re-resolve is coming.
export function setVersionResolving(state) {
	state.versionResolving = true;
}

// Releases the placeholder back to the last-known version: a re-resolve was abandoned or failed
// without a completing `ui5.project-resolved`.
export function clearVersionResolving(state) {
	state.versionResolving = false;
}
