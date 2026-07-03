// Region 4 — server. Populated by `ui5.server-listening`.
export function createServerState() {
	return {
		urls: null, // Array<{label, url}> | null
		acceptRemoteConnections: false,
	};
}

export function setListening(state, evt) {
	state.urls = Array.isArray(evt.urls) ? evt.urls.map((u) => ({label: u.label, url: u.url})) : [];
	state.acceptRemoteConnections = !!evt.acceptRemoteConnections;
}

export function hasContent(state) {
	return state.urls !== null;
}
