import test from "ava";
import {
	getBaseSignature, getProjectSignature, getSignatureManifest
} from "../../../../lib/build/helpers/getBuildSignature.js";

function createProject() {
	return {
		getId: () => "my.project:1.2.3",
		getConfig: () => ({metadata: {name: "my.project"}}),
	};
}

function createTaskRepository() {
	return {
		getVersions: () => ({builderVersion: "5.0.0", fsVersion: "5.0.0"}),
	};
}

test("getBaseSignature: Deterministic for equal input", (t) => {
	const config = {selfContained: false, excludedTasks: []};
	t.is(getBaseSignature(config), getBaseSignature({...config}));
});

test("getBaseSignature: Differs when a config field differs", (t) => {
	const a = getBaseSignature({selfContained: false, excludedTasks: []});
	const b = getBaseSignature({selfContained: false, excludedTasks: ["generateVersionInfo"]});
	t.not(a, b);
});

test("getProjectSignature: Deterministic for equal inputs", (t) => {
	const project = createProject();
	const taskRepository = createTaskRepository();
	const a = getProjectSignature("base", "tasks", project, {}, taskRepository);
	const b = getProjectSignature("base", "tasks", project, {}, taskRepository);
	t.is(a, b);
});

test("getSignatureManifest: Captures the named inputs behind the signature", (t) => {
	const buildConfig = {selfContained: false, excludedTasks: ["generateVersionInfo"]};
	const project = createProject();
	const taskRepository = createTaskRepository();

	const manifest = getSignatureManifest(buildConfig, "task-sigs", project, taskRepository);

	t.is(manifest.manifestVersion, 1);
	t.deepEqual(manifest.buildConfig, buildConfig);
	t.is(manifest.taskSignatures, "task-sigs");
	t.is(manifest.projectId, "my.project:1.2.3");
	t.deepEqual(manifest.projectConfig, {metadata: {name: "my.project"}});
	t.deepEqual(manifest.toolVersions, {builderVersion: "5.0.0", fsVersion: "5.0.0"});
});

test("getSignatureManifest: Reflects the excludedTasks divergence between build and serve", (t) => {
	const project = createProject();
	const taskRepository = createTaskRepository();

	const buildManifest = getSignatureManifest(
		{excludedTasks: []}, "t", project, taskRepository);
	const serveManifest = getSignatureManifest(
		{excludedTasks: ["generateVersionInfo"]}, "t", project, taskRepository);

	t.notDeepEqual(buildManifest.buildConfig, serveManifest.buildConfig);
});
