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
		"x-perf": false,
		"xPerf": false,
		"$0": "ui5"
	};
}

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.traverseBreadthFirst = sinon.stub();
	t.context.getAllExtensions = sinon.stub().returns([]);
	const fakeGraph = {
		traverseBreadthFirst: t.context.traverseBreadthFirst,
		getAllExtensions: t.context.getAllExtensions
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
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

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
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([{
				getName: sinon.stub().returns("dependency1")
			}, {
				getName: sinon.stub().returns("dependency2")
			}])
		});
		await fn({
			project: {
				getName: sinon.stub().returns("dependency2"),
				getNamespace: sinon.stub().returns("test/dependency2"),
				getVersion: sinon.stub().returns("2.0.0"),
				getType: sinon.stub().returns("library"),
				getPath: sinon.stub().returns("/home/dependency2")
			},
			getDependencies: sinon.stub().returns([{
				getName: sinon.stub().returns("dependency1")
			}])
		});
		await fn({
			project: {
				getName: sinon.stub().returns("dependency1"),
				getVersion: sinon.stub().returns("1.1.1"),
				getType: sinon.stub().returns("library"),
				getPath: sinon.stub().returns("/home/dependency1")
			},
			getDependencies: sinon.stub().returns([{
				getName: sinon.stub().returns("dependency3")
			}])
		});
		await fn({
			project: {
				getName: sinon.stub().returns("dependency3"),
				getVersion: sinon.stub().returns("3.3.3"),
				getType: sinon.stub().returns("library"),
				getPath: sinon.stub().returns("/home/dependency3")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

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
	const {argv, tree, traverseBreadthFirst, graph, getAllExtensions} = t.context;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	getAllExtensions.returns([{
		getName: sinon.stub().returns("extension1"),
		getVersion: sinon.stub().returns("3.0.0"),
		getType: sinon.stub().returns("task"),
		getPath: sinon.stub().returns("/home/extension1")
	}]);

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (1):")}
├─ extension1 ${chalk.dim("(3.0.0, task) ")}\
${chalk.dim.italic("/home/extension1")}
`);
});

test.serial("ui5 tree --x-perf", async (t) => {
	const {argv, tree, traverseBreadthFirst, graph} = t.context;

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	argv.xPerf = true;

	sinon.stub(process, "hrtime")
		.withArgs().returns([0, 0])
		.withArgs([0, 0]).returns([0, 1000000]);

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

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
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: "1.234.5"}
	]);

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

	argv.config = "/home/project1/config.yaml";

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromStaticFile.callCount, 0);
	t.is(graph.graphFromPackageDependencies.callCount, 1);
	t.deepEqual(graph.graphFromPackageDependencies.getCall(0).args, [
		{rootConfigPath: "/home/project1/config.yaml", versionOverride: undefined}
	]);

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

	argv.dependencyDefinition = "/home/project1/dependencies.yaml";

	traverseBreadthFirst.callsFake(async (fn) => {
		await fn({
			project: {
				getName: sinon.stub().returns("project1"),
				getNamespace: sinon.stub().returns("test/project1"),
				getVersion: sinon.stub().returns("1.0.0"),
				getType: sinon.stub().returns("application"),
				getPath: sinon.stub().returns("/home/project1")
			},
			getDependencies: sinon.stub().returns([])
		});
	});

	await tree.handler(argv);

	t.is(graph.graphFromPackageDependencies.callCount, 0);
	t.is(graph.graphFromStaticFile.callCount, 1);
	t.deepEqual(graph.graphFromStaticFile.getCall(0).args, [
		{filePath: "/home/project1/dependencies.yaml", versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`${chalk.bold.underline("Dependencies (1):")}
╰─ ${chalk.bold("project1")} ${chalk.inverse("test/project1")} ${chalk.dim("(1.0.0, application) ")}\
${chalk.dim.italic("/home/project1")}

${chalk.bold.underline("Extensions (0):")}
${chalk.italic("None")}
`);
});
