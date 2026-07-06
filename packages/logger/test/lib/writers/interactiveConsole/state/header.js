import test from "ava";

import {createHeaderState, setTool} from
	"../../../../../lib/writers/interactiveConsole/state/header.js";

test("createHeaderState: tool starts as null", (t) => {
	t.deepEqual(createHeaderState(), {tool: null});
});

test("setTool: stores a shallow copy of the incoming payload", (t) => {
	const state = createHeaderState();
	setTool(state, {name: "UI5 CLI", version: "1.0.0", extraNoise: "dropped"});
	t.deepEqual(state.tool, {name: "UI5 CLI", version: "1.0.0"},
		"only the two documented fields are retained");
});

test("setTool: clearing with a falsy value resets tool to null", (t) => {
	// The writer only ever calls setTool with a payload today, but the branch
	// exists so future callers can wipe the region if the tool identity changes.
	const state = createHeaderState();
	setTool(state, {name: "UI5 CLI", version: "1.0.0"});
	setTool(state, null);
	t.is(state.tool, null);
});
