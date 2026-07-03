// Region 4 — server. Populated by `ui5.server-listening`.
export function createServerState() {
	return {
		urls: null, // Array<{label, url}> | null
		acceptRemoteConnections: false,
		// When true, the region renders "binding…" placeholders in place of real
		// URLs. Enabled by `ui5.tool-mode` so the section is visible from the
		// first frame; `acceptRemoteConnections`/`placeholderNetworkRows` fine-
		// tune what gets reserved.
		showPlaceholders: false,
		// How many "Network:" rows the initial paint should reserve. Set from
		// `ui5.tool-mode` when the caller already knows the host's interface
		// count; the real URL list from `ui5.server-listening` replaces these.
		placeholderNetworkRows: 0,
	};
}

export function setListening(state, evt) {
	state.urls = Array.isArray(evt.urls) ? evt.urls.map((u) => ({label: u.label, url: u.url})) : [];
	state.acceptRemoteConnections = !!evt.acceptRemoteConnections;
}

export function enablePlaceholders(state, {acceptRemoteConnections, networkAddressCount} = {}) {
	state.showPlaceholders = true;
	if (typeof acceptRemoteConnections === "boolean") {
		state.acceptRemoteConnections = acceptRemoteConnections;
	}
	if (typeof networkAddressCount === "number") {
		state.placeholderNetworkRows = networkAddressCount;
	}
}

export function hasContent(state) {
	return state.urls !== null || state.showPlaceholders;
}
