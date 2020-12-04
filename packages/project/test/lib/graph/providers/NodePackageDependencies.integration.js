const test = require("ava");
const path = require("path");
const sinonGlobal = require("sinon");
const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const applicationCPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.c");
const applicationC2Path = path.join(__dirname, "..", "..", "..", "fixtures", "application.c2");
const applicationC3Path = path.join(__dirname, "..", "..", "..", "fixtures", "application.c3");
const applicationDPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.d");
const applicationFPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.f");
const applicationGPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.g");
const errApplicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "err.application.a");
const cycleDepsBasePath = path.join(__dirname, "..", "..", "..", "fixtures", "cyclic-deps", "node_modules");

const projectGraphBuilder = require("../../../../lib/graph/projectGraphBuilder");
const NodePackageDependenciesProvider = require("../../../../lib/graph/providers/NodePackageDependencies");

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

function testGraphCreationBfs(...args) {
	return _testGraphCreation(...args, true);
}

function testGraphCreationDfs(...args) {
	return _testGraphCreation(...args, false);
}

async function _testGraphCreation(t, npmProvider, expectedOrder, bfs) {
	if (bfs === undefined) {
		throw new Error("Test error: Parameter 'bfs' must be specified");
	}
	const projectGraph = await projectGraphBuilder(npmProvider);
	const callbackStub = t.context.sinon.stub().resolves();
	if (bfs) {
		await projectGraph.traverseBreadthFirst(callbackStub);
	} else {
		await projectGraph.traverseDepthFirst(callbackStub);
	}

	t.is(callbackStub.callCount, expectedOrder.length, "Correct number of projects have been visited");

	const callbackCalls = callbackStub.getCalls().map((call) => call.args[0].project.getName());

	t.deepEqual(callbackCalls, expectedOrder, "Traversed graph in correct order");
	return projectGraph;
}

test("AppA: project with collection dependency", async (t) => {
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationAPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.d",
		"library.a",
		"library.b",
		"library.c",
		"application.a",
	]);
});

test("AppC: project with dependency with optional dependency resolved through root project", async (t) => {
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationCPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.d",
		"library.e",
		"application.c",
	]);
});

test("AppC2: project with dependency with optional dependency resolved through other project", async (t) => {
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationC2Path
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.d",
		"library.e",
		"library.d-depender",
		"application.c2"
	]);
});

test("AppC3: project with dependency with optional dependency resolved " +
	"through other project (but got hoisted)", async (t) => {
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationC3Path
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.d",
		"library.e",
		"library.d-depender",
		"application.c3"
	]);
});

test("AppD: project with dependency with unresolved optional dependency", async (t) => {
	// application.d`s dependency "library.e" has an optional dependency to "library.d"
	//	which is already present in the node_modules directory of library.e
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationDPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.e",
		"application.d"
	]);
});

test("AppF: UI5-dependencies in package.json are ignored", async (t) => {
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationFPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.d",
		"library.e",
		"application.f"
	]);
});

test("AppG: project with npm 'optionalDependencies' should not fail if optional dependency cannot be resolved",
	async (t) => {
		const npmProvider = new NodePackageDependenciesProvider({
			cwd: applicationGPath
		});
		await testGraphCreationDfs(t, npmProvider, [
			"library.d",
			"application.g"
		]);
	});

test("AppCycleA: cyclic dev deps", async (t) => {
	const applicationCycleAPath = path.join(cycleDepsBasePath, "application.cycle.a");

	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationCycleAPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"library.cycle.a",
		"library.cycle.b",
		"component.cycle.a",
		"application.cycle.a"
	]);
});

test("AppCycleB: cyclic npm deps - Cycle via devDependency on second level", async (t) => {
	const applicationCycleBPath = path.join(cycleDepsBasePath, "application.cycle.b");
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationCycleBPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"module.e",
		"module.d",
		"application.cycle.b"
	]);
});

test("AppCycleC: cyclic npm deps - Cycle on third level (one indirection)", async (t) => {
	const applicationCycleCPath = path.join(cycleDepsBasePath, "application.cycle.c");
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationCycleCPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"module.f",
		"module.g",
		"application.cycle.c"
	]);
	await testGraphCreationBfs(t, npmProvider, [
		"application.cycle.c",
		"module.f",
		"module.g",
	]);
});

test("AppCycleD: cyclic npm deps - Cycles everywhere", async (t) => {
	const applicationCycleDPath = path.join(cycleDepsBasePath, "application.cycle.d");
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationCycleDPath
	});

	const error = await t.throwsAsync(testGraphCreationDfs(t, npmProvider, []));
	t.is(error.message,
		`Detected cyclic dependency chain: application.cycle.d -> module.h* -> module.i -> module.k -> module.h*`);
});

test("AppCycleE: cyclic npm deps - Cycle via devDependency", async (t) => {
	const applicationCycleEPath = path.join(cycleDepsBasePath, "application.cycle.e");
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: applicationCycleEPath
	});
	await testGraphCreationDfs(t, npmProvider, [
		"module.l",
		"module.m",
		"application.cycle.e"
	]);
});

test("Error: missing package.json", async (t) => {
	const dir = path.parse(__dirname).root;
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: dir
	});
	const error = await t.throwsAsync(testGraphCreationDfs(t, npmProvider, []));
	t.is(error.message, `Failed to locate package.json for directory ${dir}`);
});

test("Error: missing dependency", async (t) => {
	const npmProvider = new NodePackageDependenciesProvider({
		cwd: errApplicationAPath
	});
	const error = await t.throwsAsync(testGraphCreationDfs(t, npmProvider, []));
	t.is(error.message,
		`Unable to locate module library.xx via resolve logic: Cannot find module 'library.xx/package.json' from ` +
		`'${errApplicationAPath}'`);
});
