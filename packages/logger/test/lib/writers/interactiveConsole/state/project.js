import test from "ava";

import {createProjectState, setProject, setFramework, enableProjectPlaceholders, setVersionResolving,
	clearVersionResolving} from
	"../../../../../lib/writers/interactiveConsole/state/project.js";

test("createProjectState: fresh state has no project/framework and placeholders disabled", (t) => {
	t.deepEqual(createProjectState(), {
		project: null,
		framework: null,
		showPlaceholders: false,
		versionResolving: false,
	});
});

test("setProject: keeps only {name, type, version} from the incoming event", (t) => {
	const state = createProjectState();
	setProject(state, {
		name: "my.app",
		type: "application",
		version: "1.0.0",
		extraNoise: "dropped",
	});
	t.deepEqual(state.project, {name: "my.app", type: "application", version: "1.0.0"});
	t.is(state.framework, null);
});

test("setFramework: keeps known framework fields from the incoming event", (t) => {
	const state = createProjectState();
	setFramework(state, {
		name: "SAPUI5",
		version: "1.150.0",
		extraNoise: "dropped",
	});
	t.deepEqual(state.framework, {
		name: "SAPUI5",
		version: "1.150.0",
	});
});

test("setFramework: framework becomes null when the event omits one", (t) => {
	const state = createProjectState();
	setFramework(state, null);
	t.is(state.framework, null);
});

test("enableProjectPlaceholders: flips the showPlaceholders flag", (t) => {
	const state = createProjectState();
	enableProjectPlaceholders(state);
	t.true(state.showPlaceholders);
});

test("setVersionResolving: sets the versionResolving flag; clearVersionResolving releases it", (t) => {
	const state = createProjectState();
	setVersionResolving(state);
	t.true(state.versionResolving);
	clearVersionResolving(state);
	t.false(state.versionResolving);
});

test("setProject: clears a pending versionResolving flag", (t) => {
	const state = createProjectState();
	setVersionResolving(state);
	setProject(state, {name: "my.app", type: "application", version: "2.0.0"});
	t.false(state.versionResolving, "a completed resolve drops the placeholder");
});
