import test from "ava";

import {
	createBuildState,
	beginBuild,
	advanceToProject,
	setTask,
	transitionTo,
	setError,
	setStale,
	enableBuildPlaceholders,
	STATES,
} from "../../../../../lib/writers/interactiveConsole/state/build.js";

test("createBuildState: starts in INITIAL with empty counters", (t) => {
	const state = createBuildState();
	t.is(state.state, STATES.INITIAL);
	t.is(state.currentProjectIndex, 0);
	t.is(state.totalProjects, 0);
	t.deepEqual(state.projectOrder, []);
	t.deepEqual(state.staleProjects, []);
	t.deepEqual(state.validatingProjects, []);
	t.is(state.spinFrame, 0);
	t.is(state.errorMessage, "");
	t.is(state.lastBuildHrtime, null);
});

test("beginBuild: sets projectOrder, totalProjects, and projectNameWidth", (t) => {
	const state = createBuildState();
	beginBuild(state, ["a", "longer-name", "b"]);
	t.deepEqual(state.projectOrder, ["a", "longer-name", "b"]);
	t.is(state.totalProjects, 3);
	t.is(state.projectNameWidth, "longer-name".length,
		"width matches the longest known project so status-line updates don't reflow");
	// Transient counters are reset.
	t.is(state.currentProjectIndex, 0);
	t.is(state.currentProjectName, "");
	t.is(state.currentTaskName, "");
	t.is(state.spinFrame, 0);
});

test("beginBuild: accepts an iterable and materialises it into an array", (t) => {
	const state = createBuildState();
	beginBuild(state, new Set(["a", "b"]));
	t.deepEqual(state.projectOrder, ["a", "b"]);
	t.is(state.totalProjects, 2);
});

test("advanceToProject: maps a known project to its 1-based index", (t) => {
	const state = createBuildState();
	beginBuild(state, ["a", "b", "c"]);
	advanceToProject(state, "b");
	t.is(state.currentProjectIndex, 2);
	t.is(state.currentProjectName, "b");
});

test("advanceToProject: unknown projects increment the counter as a fallback", (t) => {
	const state = createBuildState();
	beginBuild(state, ["known"]);
	// A build-start for a project not announced via build-metadata falls
	// back to ++currentProjectIndex so the counter still moves forward.
	advanceToProject(state, "surprise");
	t.is(state.currentProjectIndex, 1);
	t.is(state.currentProjectName, "surprise");
});

test("advanceToProject: clears the currentTaskName", (t) => {
	const state = createBuildState();
	beginBuild(state, ["a", "b"]);
	advanceToProject(state, "a");
	setTask(state, "minify");
	advanceToProject(state, "b");
	t.is(state.currentTaskName, "", "task name is cleared for the next project");
});

test("setTask: taskNameWidth never shrinks", (t) => {
	const state = createBuildState();
	setTask(state, "minifyAndBundle");
	t.is(state.taskNameWidth, "minifyAndBundle".length);
	setTask(state, "css");
	// The column width holds at the widest name seen, so a re-render doesn't
	// leave stray characters from the previous longer name behind.
	t.is(state.taskNameWidth, "minifyAndBundle".length,
		"width holds when a shorter task follows");
	t.is(state.currentTaskName, "css");
});

test("transitionTo: sets the state and resets the spinner frame", (t) => {
	const state = createBuildState();
	state.spinFrame = 5;
	transitionTo(state, STATES.BUILDING);
	t.is(state.state, STATES.BUILDING);
	t.is(state.spinFrame, 0, "spinner restarts when the state changes");
});

test("setError: transitions to ERROR and stores the message", (t) => {
	const state = createBuildState();
	setError(state, "boom");
	t.is(state.state, STATES.ERROR);
	t.is(state.errorMessage, "boom");
});

test("setError: falsy message resolves to an empty string", (t) => {
	const state = createBuildState();
	setError(state, undefined);
	t.is(state.state, STATES.ERROR);
	t.is(state.errorMessage, "");
});

test("setStale: records the stale set without touching the activity state", (t) => {
	const state = createBuildState();
	transitionTo(state, STATES.READY);
	state.spinFrame = 3;
	setStale(state, ["library.a", "library.b"]);
	t.deepEqual(state.staleProjects, ["library.a", "library.b"]);
	t.is(state.state, STATES.READY, "activity state is unchanged");
	t.is(state.spinFrame, 3, "spinner frame is not reset");
});

test("setStale: a non-array resolves to an empty set", (t) => {
	const state = createBuildState();
	state.staleProjects = ["stale"];
	setStale(state, undefined);
	t.deepEqual(state.staleProjects, []);
});

test("enableBuildPlaceholders: promotes INITIAL to STARTING", (t) => {
	const state = createBuildState();
	enableBuildPlaceholders(state);
	t.is(state.state, STATES.STARTING);
});

test("enableBuildPlaceholders: leaves non-INITIAL states alone", (t) => {
	// Real state must win: if a build has already reported progress, the
	// placeholder is stale and must not overwrite it.
	const state = createBuildState();
	transitionTo(state, STATES.BUILDING);
	enableBuildPlaceholders(state);
	t.is(state.state, STATES.BUILDING);
});
