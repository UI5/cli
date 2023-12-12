import test from "ava";
import sinon from "sinon";
import OutputStyleEnum from "../../../../lib/build/helpers/ProjectBuilderOutputStyle.js";

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
	const rootProjectStub = sinon.stub()
		.onFirstCall().returns({getType: () => "library"})
		.returns("pony");
	const graph = {getRoot: rootProjectStub};
	const buildContext = new BuildContext(graph, "taskRepository");

	t.is(buildContext.getRootProject(), "pony", "Returned correct value");
});

test("getGraph", (t) => {
	const graph = {
		getRoot: () => ({getType: () => "library"}),
	};
	const buildContext = new BuildContext(graph, "taskRepository");

	t.deepEqual(buildContext.getGraph(), graph, "Returned correct value");
});

test("getTaskRepository", (t) => {
	const graph = {
		getRoot: () => ({getType: () => "library"}),
	};
	const buildContext = new BuildContext(graph, "taskRepository");

	t.is(buildContext.getTaskRepository(), "taskRepository", "Returned correct value");
});

test("getBuildConfig: Default values", (t) => {
	const graph = {
		getRoot: () => ({getType: () => "library"}),
	};
	const buildContext = new BuildContext(graph, "taskRepository");

	t.deepEqual(buildContext.getBuildConfig(), {
		selfContained: false,
		outputStyle: OutputStyleEnum.Default,
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
		outputStyle: OutputStyleEnum.Namespace,
		cssVariables: true,
		jsdoc: true,
		createBuildManifest: false,
		includedTasks: ["included tasks"],
		excludedTasks: ["excluded tasks"],
	});

	t.deepEqual(buildContext.getBuildConfig(), {
		selfContained: true,
		outputStyle: OutputStyleEnum.Namespace,
		cssVariables: true,
		jsdoc: true,
		createBuildManifest: false,
		includedTasks: ["included tasks"],
		excludedTasks: ["excluded tasks"],
	}, "Returned correct value");
});

test("createBuildManifest not supported for type application", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "application"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true
		});
	});
	t.is(err.message,
		"Build manifest creation is currently not supported for projects of type application",
		"Threw with expected error message");
});

test("createBuildManifest not supported for type module", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "module"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true
		});
	});
	t.is(err.message,
		"Build manifest creation is currently not supported for projects of type module",
		"Threw with expected error message");
});

test("createBuildManifest not supported for self-contained build", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "library"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true,
			selfContained: true
		});
	});
	t.is(err.message,
		"Build manifest creation is currently not supported for self-contained builds",
		"Threw with expected error message");
});

test("createBuildManifest supported for css-variables build", (t) => {
	t.notThrows(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "library"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true,
			cssVariables: true
		});
	});
});

test("createBuildManifest supported for jsdoc build", (t) => {
	t.notThrows(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "library"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true,
			jsdoc: true
		});
	});
});

test("outputStyle='Namespace' supported for type application", (t) => {
	t.notThrows(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "application"
				};
			}
		}, "taskRepository", {
			outputStyle: OutputStyleEnum.Namespace
		});
	});
});

test("outputStyle='Flat' not supported for type theme-library", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "theme-library"
				};
			}
		}, "taskRepository", {
			outputStyle: OutputStyleEnum.Flat
		});
	});
	t.is(err.message,
		"Flat build output style is currently not supported for projects of typetheme-library since they" +
		" commonly have more than one namespace. Currently only the Default output style is supported" +
		" for this project type.");
});

test("outputStyle='Flat' not supported for type module", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "module"
				};
			}
		}, "taskRepository", {
			outputStyle: OutputStyleEnum.Flat
		});
	});
	t.is(err.message,
		"Flat build output style is currently not supported for projects of typemodule. " +
		"Their path mappings configuration can't be mapped to any namespace.Currently only the " +
		"Default output style is supported for this project type.");
});

test("outputStyle='Flat' not supported for createBuildManifest build", (t) => {
	const err = t.throws(() => {
		new BuildContext({
			getRoot: () => {
				return {
					getType: () => "library"
				};
			}
		}, "taskRepository", {
			createBuildManifest: true,
			outputStyle: OutputStyleEnum.Flat
		});
	});
	t.is(err.message,
		"Build manifest creation is not supported in conjunction with flat build output",
		"Threw with expected error message");
});

test("getOption", (t) => {
	const graph = {
		getRoot: () => ({getType: () => "library"}),
	};
	const buildContext = new BuildContext(graph, "taskRepository", {
		cssVariables: "value",
	});

	t.is(buildContext.getOption("cssVariables"), "value",
		"Returned correct value for build configuration 'cssVariables'");
	t.is(buildContext.getOption("selfContained"), undefined,
		"Returned undefined for build configuration 'selfContained' " +
		"(not exposed as build option)");
});

test("createProjectContext", async (t) => {
	const graph = {
		getRoot: () => ({getType: () => "library"}),
	};
	const buildContext = new BuildContext(graph, "taskRepository");
	const projectBuildContext = await buildContext.createProjectContext({
		project: {
			getName: () => "project",
			getType: () => "type",
		},
	});

	t.deepEqual(buildContext._projectBuildContexts, [projectBuildContext],
		"Project build context has been added to internal array");
});

test("executeCleanupTasks", async (t) => {
	const graph = {
		getRoot: () => ({getType: () => "library"}),
	};
	const buildContext = new BuildContext(graph, "taskRepository");

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
	t.is(executeCleanupTasks.getCall(0).firstArg, false,
		"Project context executeCleanupTasks got called with expected arguments");


	executeCleanupTasks.reset();
	await buildContext.executeCleanupTasks(true);

	t.is(executeCleanupTasks.callCount, 2,
		"Project context executeCleanupTasks got called twice");
	t.is(executeCleanupTasks.getCall(0).firstArg, true,
		"Project context executeCleanupTasks got called with expected arguments");
});
