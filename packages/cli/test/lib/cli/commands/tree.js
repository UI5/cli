import path from "node:path";
import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import chalk from "chalk";

function getDefaultArgv() {
	// This has been taken from the actual argv object yargs provides
	return {
		"_": ["tree"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
		"$0": "ui5"
	};
}

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.traverseBreadthFirst = sinon.stub();
	t.context.getExtensionNames = sinon.stub().returns([]);
	t.context.getExtension = sinon.stub().returns();
	const fakeGraph = {
		traverseBreadthFirst: t.context.traverseBreadthFirst,
		getExtensionNames: t.context.getExtensionNames,
		getExtension: t.context.getExtension,
	};
	t.context.graph = {
		graphFromStaticFile: sinon.stub().resolves(fakeGraph),
		graphFromPackageDependencies: sinon.stub().resolves(fakeGraph)
	};

	t.context.consoleOutput = "";
	t.context.consoleLog = sinon.stub(console, "log").callsFake((message) => {
		// NOTE: This fake impl only supports one string arg passed to console.log
		t.context.consoleOutput += message + "\n";
	});

	t.context.tree = await esmock.p("../../../../lib/cli/commands/tree.js", {
		"@ui5/project/graph": t.context.graph
	});
});
test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.tree);
});

test.serial("ui5 tree (Without dependencies)", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: ["dependency1", "dependency2"]
		});
		await fn({
			project: {
				getName: sinon.stub().returns("dependency2"),
				getNamespace: sinon.stub().returns("test/dependency2"),
				getVersion: sinon.stub().returns("2.0.0"),
				getType: sinon.stub().returns("library"),
				getRootPath: sinon.stub().returns("/home/dependency2")
			},
			dependencies: ["dependency1"]
		});
		await fn({
			project: {
				getName: sinon.stub().returns("dependency1"),
				getNamespace: sinon.stub().returns(null),
				getVersion: sinon.stub().returns("1.1.1"),
				getType: sinon.stub().returns("library"),
				getRootPath: sinon.stub().returns("/home/dependency1")
			},
			dependencies: ["dependency3"]
		});
		await fn({
			project: {
				getName: sinon.stub().returns("dependency3"),
				getNamespace: sinon.stub().returns(null),
				getVersion: sinon.stub().returns("3.3.3"),
				getType: sinon.stub().returns("library"),
				getRootPath: sinon.stub().returns("/home/dependency3")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (4):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}
    ├─ ${chalk.bold("dependency1")} ${chalk.dim("(1.1.1, library) ")}\
${chalk.dim.italic("/home/dependency1")}
    │   ╰─ ${chalk.bold("dependency3")} ${chalk.dim("(3.3.3, library) ")}\
${chalk.dim.italic("/home/dependency3")}
    ╰─ ${chalk.bold("dependency2")} ${chalk.inverse("test/dependency2")} \
${chalk.dim("(2.0.0, library) ")}${chalk.dim.italic("/home/dependency2")}
        ╰─ ${chalk.bold("dependency1")} ${chalk.dim("(1.1.1, library) ")}${chalk.dim.italic("/home/dependency1")}
            ╰─ ${chalk.bold("dependency3")} ${chalk.dim("(3.3.3, library) ")}${chalk.dim.italic("/home/dependency3")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree (With extensions)", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph, getExtension, getExtensionNames} = t.context;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});
	getExtensionNames.returns(["extension1", "extension2"]);

	getExtension.onFirstCall().returns({
		getName: sinon.stub().returns("extension1"),
		getVersion: sinon.stub().returns("3.0.0"),
		getType: sinon.stub().returns("task"),
		getRootPath: sinon.stub().returns("/home/extension1")
	}).onSecondCall().returns({
		getName: sinon.stub().returns("extension2"),
		getVersion: sinon.stub().returns("5.0.0"),
		getType: sinon.stub().returns("middleware"),
		getRootPath: sinon.stub().returns("/home/extension2")
	});

	await tree.handler(argv);

	t.is(getExtensionNames.callCount, 1,
		"getExtensionNames got called once");
	t.is(getExtension.callCount, 2,
		"getExtension got called once");
	t.is(getExtension.getCall(0).args[0], "extension1",
		"getExtension called with expected extension name");
	t.is(getExtension.getCall(1).args[0], "extension2",
		"getExtension called with expected extension name");
	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (2):")}
├─ extension1 ${chalk.dim("(3.0.0, task) ")}\
${chalk.dim.italic("/home/extension1")}
╰─ extension2 ${chalk.dim("(5.0.0, middleware) ")}\
${chalk.dim.italic("/home/extension2")}
`);
});

test.serial("ui5 tree --perf", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	argv.perf = true;

	sinon.stub(process, "hrtime")
		.withArgs().returns([0, 0])
		.withArgs([0, 0]).returns([0, 1000000]);

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}

${chalk.blue(`Dependency graph generation took ${chalk.bold("1 ms")}`)}
`);
});

test.serial("ui5 tree --framework-version", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	argv.frameworkVersion = "1.234.5";

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: "1.234.5",
		workspaceConfigPath: undefined, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree --config", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	const fakePath = path.join("/", "path", "to", "ui5.yaml");
	argv.config = fakePath;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: fakePath, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree --workspace", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	argv.workspace = "dolphin";

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: "dolphin",
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree --no-workspace", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	argv.workspace = false;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: undefined, workspaceName: null,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree --workspace-config", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	const fakePath = path.join("/", "path", "to", "ui5-workspace.yaml");
	argv.workspaceConfig = fakePath;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [{
		rootConfigPath: undefined, versionOverride: undefined,
		workspaceConfigPath: fakePath, workspaceName: undefined,
	}]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});

test.serial("ui5 tree --dependency-definition", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	const fakePath = path.join("/", "path", "to", "dependencies.yaml");
	argv.dependencyDefinition = fakePath;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getRootPath: sinon.stub().returns("/home/project1")
			},
			dependencies: []
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromPackageDependencies.callCount, 0);
	t.is(graph.graphFromStaticFile.callCount, 1);
	t.deepEqual(graph.graphFromStaticFile.getCall(0).args, [
		{filePath: fakePath, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});
