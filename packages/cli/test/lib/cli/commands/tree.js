const test = require("ava");
const sinon = require("sinon");

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

test.beforeEach((t) => {
	const project = require("@ui5/project");

	t.context.argv = getDefaultArgv();

	sinon.stub(project.generateProjectGraph, "usingStaticFile").resolves();
	sinon.stub(project.generateProjectGraph, "usingNodePackageDependencies").resolves();
	t.context.generateProjectGraph = project.generateProjectGraph;

	// Create basic mocking objects
	t.context.traverseBreadthFirst = sinon.stub();
	t.context.getAllExtensions = sinon.stub().returns([]);
	const fakeGraph = {
		traverseBreadthFirst: t.context.traverseBreadthFirst,
		getAllExtensions: t.context.getAllExtensions
	};
	t.context.generateProjectGraph.usingStaticFile.resolves(fakeGraph);
	t.context.generateProjectGraph.usingNodePackageDependencies.resolves(fakeGraph);

	t.context.consoleOutput = "";
	t.context.consoleLog = sinon.stub(console, "log").callsFake((message) => {
		// NOTE: This fake impl only supports one string arg passed to console.log
		t.context.consoleOutput += message + "\n";
	});

	t.context.tree = require("../../../../lib/cli/commands/tree");
});
test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("ui5 tree (Without dependencies)", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph} = t.context;

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

	t.is(generateProjectGraph.usingStaticFile.callCount, 0);
	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 1);
	t.deepEqual(generateProjectGraph.usingNodePackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (1):
╰─ project1 test/project1 (1.0.0, application) /home/project1

Extensions (0):
None
`);
});

test.serial("ui5 tree", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph} = t.context;

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

	t.is(generateProjectGraph.usingStaticFile.callCount, 0);
	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 1);
	t.deepEqual(generateProjectGraph.usingNodePackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (4):
╰─ project1 test/project1 (1.0.0, application) /home/project1
    ├─ dependency1 (1.1.1, library) /home/dependency1
    │   ╰─ dependency3 (3.3.3, library) /home/dependency3
    ╰─ dependency2 test/dependency2 (2.0.0, library) /home/dependency2
        ╰─ dependency1 (1.1.1, library) /home/dependency1
            ╰─ dependency3 (3.3.3, library) /home/dependency3

Extensions (0):
None
`);
});

test.serial("ui5 tree (With extensions)", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph, getAllExtensions} = t.context;

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

	t.is(generateProjectGraph.usingStaticFile.callCount, 0);
	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 1);
	t.deepEqual(generateProjectGraph.usingNodePackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (1):
╰─ project1 test/project1 (1.0.0, application) /home/project1

Extensions (1):
├─ extension1 (3.0.0, task) /home/extension1
`);
});

test.serial("ui5 tree --x-perf", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph} = t.context;

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

	t.is(generateProjectGraph.usingStaticFile.callCount, 0);
	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 1);
	t.deepEqual(generateProjectGraph.usingNodePackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (1):
╰─ project1 test/project1 (1.0.0, application) /home/project1

Extensions (0):
None

Dependency graph generation took 1 ms
`);
});

test.serial("ui5 tree --framework-version", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph} = t.context;

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

	t.is(generateProjectGraph.usingStaticFile.callCount, 0);
	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 1);
	t.deepEqual(generateProjectGraph.usingNodePackageDependencies.getCall(0).args, [
		{rootConfigPath: undefined, versionOverride: "1.234.5"}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (1):
╰─ project1 test/project1 (1.0.0, application) /home/project1

Extensions (0):
None
`);
});

test.serial("ui5 tree --config", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph} = t.context;

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

	t.is(generateProjectGraph.usingStaticFile.callCount, 0);
	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 1);
	t.deepEqual(generateProjectGraph.usingNodePackageDependencies.getCall(0).args, [
		{rootConfigPath: "/home/project1/config.yaml", versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (1):
╰─ project1 test/project1 (1.0.0, application) /home/project1

Extensions (0):
None
`);
});

test.serial("ui5 tree --dependency-definition", async (t) => {
	const {argv, tree, traverseBreadthFirst, generateProjectGraph} = t.context;

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

	t.is(generateProjectGraph.usingNodePackageDependencies.callCount, 0);
	t.is(generateProjectGraph.usingStaticFile.callCount, 1);
	t.deepEqual(generateProjectGraph.usingStaticFile.getCall(0).args, [
		{filePath: "/home/project1/dependencies.yaml", versionOverride: undefined}
	]);

	t.is(t.context.consoleOutput,
		`Dependencies (1):
╰─ project1 test/project1 (1.0.0, application) /home/project1

Extensions (0):
None
`);
});
