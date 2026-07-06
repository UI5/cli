// Region 4 — server. Populated by `ui5.server-listening`.
export function createServerState() {
	return {
		urls: null, // Array<{label, url}> | null
		acceptRemoteConnections: false,
		// When true, the region renders "binding…" placeholders in place of real
		// URLs. Enabled by `ui5.tool-mode` so the section is visible from the
		// first frame; `acceptRemoteConnections` fine-tunes what gets reserved.
		showPlaceholders: false,
	};
}

export function setListening(state, evt) {
	state.urls = Array.isArray(evt.urls) ? evt.urls.map((u) => ({label: u.label, url: u.url})) : [];
	state.acceptRemoteConnections = !!evt.acceptRemoteConnections;
}

export function enableServerPlaceholders(state, {acceptRemoteConnections} = {}) {
	state.showPlaceholders = true;
	if (typeof acceptRemoteConnections === "boolean") {
		state.acceptRemoteConnections = acceptRemoteConnections;
	}
}
