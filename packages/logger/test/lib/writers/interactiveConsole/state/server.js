import test from "ava";

import {createServerState, setListening, enableServerPlaceholders} from
	"../../../../../lib/writers/interactiveConsole/state/server.js";

test("createServerState: fresh state has no urls and placeholders disabled", (t) => {
	t.deepEqual(createServerState(), {
		urls: null,
		acceptRemoteConnections: false,
		showPlaceholders: false,
	});
});

test("setListening: retains only {label, url} and coerces acceptRemoteConnections to boolean", (t) => {
	const state = createServerState();
	setListening(state, {
		urls: [
			{label: "Local", url: "http://localhost:8080", extra: "dropped"},
			{label: "Network", url: "http://10.0.0.1:8080"},
		],
		acceptRemoteConnections: 1,
	});
	t.deepEqual(state.urls, [
		{label: "Local", url: "http://localhost:8080"},
		{label: "Network", url: "http://10.0.0.1:8080"},
	]);
	t.true(state.acceptRemoteConnections, "truthy value is coerced to true");
});

test("setListening: non-array urls fall back to an empty list", (t) => {
	// Defensive coercion — a broken caller must not leave the region in a
	// half-populated state that #renderServerRegion cannot iterate.
	const state = createServerState();
	setListening(state, {urls: undefined, acceptRemoteConnections: true});
	t.deepEqual(state.urls, []);
	t.true(state.acceptRemoteConnections);
});

test("enableServerPlaceholders: flips the flag without touching acceptRemoteConnections by default", (t) => {
	const state = createServerState();
	// Pre-existing value must survive when the caller doesn't supply one.
	state.acceptRemoteConnections = true;
	enableServerPlaceholders(state);
	t.true(state.showPlaceholders);
	t.true(state.acceptRemoteConnections, "existing flag survives when no override is passed");
});

test("enableServerPlaceholders: accepts a boolean override for acceptRemoteConnections", (t) => {
	const state = createServerState();
	enableServerPlaceholders(state, {acceptRemoteConnections: true});
	t.true(state.showPlaceholders);
	t.true(state.acceptRemoteConnections);
});

test("enableServerPlaceholders: non-boolean override is ignored", (t) => {
	// Only strict boolean overrides are honoured; anything else preserves the
	// state's own default so we don't accidentally paint the warning block for
	// e.g. `undefined` from a caller that forgot to pass the field.
	const state = createServerState();
	enableServerPlaceholders(state, {acceptRemoteConnections: "yes"});
	t.true(state.showPlaceholders);
	t.false(state.acceptRemoteConnections, "non-boolean override does not switch the flag");
});
