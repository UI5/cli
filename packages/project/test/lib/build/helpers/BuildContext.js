import test from "ava";
import sinon from "sinon";

test.afterEach.always((t) => {
	sinon.restore();
});

import BuildContext from "../../../../lib/build/helpers/BuildContext.js";

test("Missing parameters", (t) => {
	const error1 = t.throws(() => {
		new BuildContext();
	});

	t.is(error1.message, `Missing parameter 'graph'`, "Threw with expected error message");

	const error2 = t.throws(() => {
		new BuildContext("graph");
	});

	t.is(error2.message, `Missing parameter 'taskRepository'`, "Threw with expected error message");
});

test("getRootProject", (t) => {
	const buildContext = new BuildContext({
		getRoot: () => "pony"
	}, "taskRepository");

	t.is(buildContext.getRootProject(), "pony", "Returned correct value");
});

test("getGraph", (t) => {
	const buildContext = new BuildContext("graph", "taskRepository");

	t.is(buildContext.getGraph(), "graph", "Returned correct value");
});

test("getTaskRepository", (t) => {
	const buildContext = new BuildContext("graph", "taskRepository");

	t.is(buildContext.getTaskRepository(), "taskRepository", "Returned correct value");
});

test("getBuildConfig: Default values", (t) => {
	const buildContext = new BuildContext("graph", "taskRepository");

	t.deepEqual(buildContext.getBuildConfig(), {
		selfContained: false,
		cssVariables: false,
		jsdoc: false,
		createBuildManifest: false,
		includedTasks: [],
		excludedTasks: [],
	}, "Returned correct value");
});

test("getBuildConfig: Custom values", (t) => {
	const buildContext = new BuildContext({
		getRoot: () => {
			return {
				getType: () => "library"
			};
		}
	}, "taskRepository", {
		selfContained: true,
		cssVariables: true,
		jsdoc: true,
		createBuildManifest: true,
		includedTasks: ["included tasks"],
		excludedTasks: ["excluded tasks"],
	});

	t.deepEqual(buildContext.getBuildConfig(), {
		selfContained: true,
		cssVariables: true,
		jsdoc: true,
		createBuildManifest: true,
		includedTasks: ["included tasks"],
		excludedTasks: ["excluded tasks"],
	}, "Returned correct value");
});

test("createBuildManifest not supported", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "pony"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true
		});
	});
	t.is(err.message,
		"Build manifest creation is currently not supported for projects of type pony",
		"Threw with expected error message");
});

test("getBuildOption", (t) => {
	const buildContext = new BuildContext("graph", "taskRepository", {
		cssVariables: "value",
	});

	t.is(buildContext.getOption("cssVariables"), "value",
		"Returned correct value for build configuration 'cssVariables'");
	t.is(buildContext.getOption("selfContained"), undefined,
		"Returned undefined for build configuration 'selfContained' " +
		"(not exposed as buold option)");
});

test("createProjectContext", async (t) => {
	const buildContext = new BuildContext("graph", "taskRepository");
	const projectBuildContext = await buildContext.createProjectContext({
		project: "project",
		log: "log"
	});

	t.deepEqual(buildContext._projectBuildContexts, [projectBuildContext],
		"Project build context has been added to internal array");
});

test("executeCleanupTasks", async (t) => {
	const buildContext = new BuildContext("graph", "taskRepository");

	const executeCleanupTasks = sinon.stub().resolves();

	buildContext._projectBuildContexts.push({
		executeCleanupTasks
	});
	buildContext._projectBuildContexts.push({
		executeCleanupTasks
	});

	await buildContext.executeCleanupTasks();

	t.is(executeCleanupTasks.callCount, 2,
		"Project context executeCleanupTasks got called twice");
});
