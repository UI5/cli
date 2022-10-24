import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinonGlobal from "sinon";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("Application A", async (t) => {
	const projectGraph = await graphFromPackageDependencies({cwd: applicationAPath});
	const rootProject = projectGraph.getRoot();
	t.is(rootProject.getName(), "application.a", "Returned correct root project");
});

test("Application A: Traverse project graph breadth first", async (t) => {
	const projectGraph = await graphFromPackageDependencies({cwd: applicationAPath});
	const callbackStub = t.context.sinon.stub().resolves();
	await projectGraph.traverseBreadthFirst(callbackStub);

	t.is(callbackStub.callCount, 5, "Five projects have been visited");

	const callbackCalls = callbackStub.getCalls().map((call) => call.args[0].project.getName());

	t.deepEqual(callbackCalls, [
		"application.a",
		"library.d",
		"library.a",
		"library.b",
		"library.c"
	], "Traversed graph in correct order");
});

// More integration tests for package.json dependencies in graph/providers/NodePackageDependencies.integration.js
