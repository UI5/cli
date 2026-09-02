import test from "ava";
import esmock from "esmock";
import sinon from "sinon";

test.afterEach.always(() => {
	sinon.restore();
});

function createGraph(projectNames) {
	return {
		_getTaskRepository: sinon.stub().resolves({id: "task-repo"}),
		getProjectNames: () => projectNames,
		// build()/serve() (the graph sealers) are intentionally absent: the helper must not seal
	};
}

// Captures the arguments the helper passes to BuildContext and returns fake project contexts.
function createBuildContextStub() {
	const captured = {};
	class BuildContextStub {
		constructor(graph, taskRepository, buildConfig) {
			captured.graph = graph;
			captured.taskRepository = taskRepository;
			captured.buildConfig = buildConfig;
		}
		async getProjectContext(projectName) {
			return {
				getProject: () => ({getId: () => `${projectName}.id`}),
				getBuildSignature: () => `sig:${projectName}`,
			};
		}
	}
	return {BuildContextStub, captured};
}

async function importHelper(BuildContextStub) {
	return esmock("../../../../lib/build/helpers/getProjectBuildSignatures.js", {
		"../../../../lib/build/helpers/BuildContext.js": {default: BuildContextStub},
	});
}

test.serial("Returns a Map of project id to build signature for every project", async (t) => {
	const {BuildContextStub} = createBuildContextStub();
	const {getProjectBuildSignatures} = await importHelper(BuildContextStub);

	const result = await getProjectBuildSignatures(createGraph(["a", "b", "c"]));

	t.true(result instanceof Map);
	t.deepEqual([...result.entries()], [
		["a.id", "sig:a"],
		["b.id", "sig:b"],
		["c.id", "sig:c"],
	]);
});

test.serial("Forces cache mode Off and forwards build options", async (t) => {
	const {BuildContextStub, captured} = createBuildContextStub();
	const {getProjectBuildSignatures} = await importHelper(BuildContextStub);

	await getProjectBuildSignatures(createGraph(["a"]), {
		selfContained: true, jsdoc: false, includedTasks: ["x"], excludedTasks: ["y"],
	});

	t.is(captured.buildConfig.cache, "Off", "Cache is forced Off so no database opens");
	t.is(captured.buildConfig.selfContained, true);
	t.is(captured.buildConfig.jsdoc, false);
	t.deepEqual(captured.buildConfig.includedTasks, ["x"]);
	t.deepEqual(captured.buildConfig.excludedTasks, ["y"]);
});

test.serial("Obtains the task repository from the graph without sealing it", async (t) => {
	const {BuildContextStub, captured} = createBuildContextStub();
	const {getProjectBuildSignatures} = await importHelper(BuildContextStub);
	const graph = createGraph(["a"]);

	await getProjectBuildSignatures(graph);

	t.is(graph._getTaskRepository.callCount, 1, "Reuses the graph's task repository");
	t.deepEqual(captured.taskRepository, {id: "task-repo"}, "Passes the resolved task repository to BuildContext");
});

test.serial("Applies defaults when no build config is given", async (t) => {
	const {BuildContextStub, captured} = createBuildContextStub();
	const {getProjectBuildSignatures} = await importHelper(BuildContextStub);

	await getProjectBuildSignatures(createGraph(["a"]));

	t.is(captured.buildConfig.selfContained, false);
	t.is(captured.buildConfig.jsdoc, false);
	t.deepEqual(captured.buildConfig.includedTasks, []);
	t.deepEqual(captured.buildConfig.excludedTasks, []);
});
