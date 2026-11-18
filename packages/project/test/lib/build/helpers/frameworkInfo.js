import test from "ava";
import ProjectGraph from "../../../../lib/graph/ProjectGraph.js";
import ProjectBuildContext from "../../../../lib/build/helpers/ProjectBuildContext.js";
import TaskUtil from "../../../../lib/build/helpers/TaskUtil.js";
import MonitoredTaskUtil from "../../../../lib/build/helpers/MonitoredTaskUtil.js";
import TaskInputSet from "../../../../lib/build/cache/index/TaskInputSet.js";
import SpecificationVersion from "../../../../lib/specifications/SpecificationVersion.js";
import {createFrameworkProject} from "../../graph/helpers/__helper__/frameworkProject.js";

async function createGraph() {
	const root = await createFrameworkProject("root", {id: "test-root", version: "1.0.0"});
	const graph = new ProjectGraph({rootProjectName: root.getName()});
	graph.addProject(root);
	return graph;
}

function createContext(graph) {
	return new ProjectBuildContext({getGraph: () => graph, getTaskRepository: () => ({})}, graph.getRoot());
}

for (const readOnly of [false, true]) {
	test(`framework metadata delegates through ${readOnly ? "read-only" : "regular"} TaskUtil at specVersion 5.0`,
		async (t) => {
			const graph = await createGraph();
			graph.setFrameworkResolution({name: "SAPUI5", version: ""});
			const context = createContext(graph);
			const taskUtil = new TaskUtil({projectBuildContext: context});
			const expected = {name: "SAPUI5", version: ""};
			t.deepEqual(context.getResolvedFrameworkInfo(), expected);
			t.deepEqual(taskUtil.getResolvedFrameworkInfo(), expected);
			const method = readOnly ? "getReadOnlyInterface" : "getInterface";
			const getInterface = (version) => taskUtil[method](new SpecificationVersion(version));
			t.is(getInterface("3.0").getResolvedFrameworkInfo, undefined);
			t.deepEqual(getInterface("5.0").getResolvedFrameworkInfo(), expected);
			t.deepEqual(Object.keys(getInterface("5.0")).filter((name) => name.startsWith("getResolvedFramework")),
				["getResolvedFrameworkInfo"]);
		});
}

test("pair reads normalize and deduplicate as a single persisted input", async (t) => {
	const graph = await createGraph();
	graph.setFrameworkResolution({name: "OpenUI5", version: "1.130.0-SNAPSHOT"});
	const context = createContext(graph);
	const taskUtil = new TaskUtil({projectBuildContext: context});
	const monitored = new MonitoredTaskUtil(taskUtil.getInterface(new SpecificationVersion("5.0")));
	const info = monitored.getResolvedFrameworkInfo();
	info.name = "changed by caller";
	monitored.getResolvedFrameworkInfo();
	t.deepEqual(monitored.getInputRecording(), [{
		type: "resolvedFrameworkInfo", name: "", value: "{\"name\":\"OpenUI5\",\"version\":\"1.130.0-SNAPSHOT\"}",
	}]);
	t.is(context.resolveInputValue("resolvedFrameworkInfo", ""), monitored.getInputRecording()[0].value);
	const recorded = new TaskInputSet(monitored.getInputRecording());
	const persisted = TaskInputSet.fromCache(JSON.parse(JSON.stringify(recorded.toCacheObject())));
	t.is(persisted.getSignatureWithCurrentValues((type, name) => context.resolveInputValue(type, name)),
		recorded.getSignature());
	graph.setFrameworkResolution({name: "OpenUI5", version: "1.131.0-SNAPSHOT"});
	t.not(persisted.getSignatureWithCurrentValues((type, name) => context.resolveInputValue(type, name)),
		recorded.getSignature());
});

test("persisted pair inputs track identity changes even when both versions are empty", async (t) => {
	const graph = await createGraph();
	graph.setFrameworkResolution({name: "OpenUI5", version: ""});
	const context = createContext(graph);
	const monitored = new MonitoredTaskUtil(new TaskUtil({projectBuildContext: context}));
	monitored.getResolvedFrameworkInfo();
	const recorded = new TaskInputSet(monitored.getInputRecording());
	const persisted = TaskInputSet.fromCache(JSON.parse(JSON.stringify(recorded.toCacheObject())));
	graph.setFrameworkResolution({name: "SAPUI5", version: ""});
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
	t.not(persisted.getSignatureWithCurrentValues((type, name) => context.resolveInputValue(type, name)),
		recorded.getSignature());
});

test("unused workspace projects preserve the pair input signature; consumed projects change it", async (t) => {
	const graph = await createGraph();
	graph.addProject(await createFrameworkProject("sap.ui.core", {id: "@openui5/sap.ui.core", version: "1.129.1"}));
	graph.declareDependency("root", "sap.ui.core");
	// SAPUI5 with a workspace-offered framework library: consuming it collapses the (configured)
	// distribution version to "" (no reliable SAPUI5 version under a workspace contribution).
	graph.setFrameworkResolution({name: "SAPUI5", version: "1.130.0", workspaceProjectNames: ["sap.ui.comp"]});
	const context = createContext(graph);
	const monitored = new MonitoredTaskUtil(new TaskUtil({projectBuildContext: context}));
	monitored.getResolvedFrameworkInfo();
	const recorded = new TaskInputSet(monitored.getInputRecording());
	const persisted = TaskInputSet.fromCache(recorded.toCacheObject());
	const currentSignature = () => persisted.getSignatureWithCurrentValues((type, name) =>
		context.resolveInputValue(type, name));
	graph.addProject(await createFrameworkProject("sap.ui.comp", {id: "@sapui5/sap.ui.comp", version: "1.130.0"}));
	t.is(currentSignature(), recorded.getSignature());
	graph.declareDependency("sap.ui.core", "sap.ui.comp");
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
	t.not(currentSignature(), recorded.getSignature());
});

test("unknown metadata has a distinct signature from a known SAPUI5 identity with unknown version", async (t) => {
	const graph = await createGraph();
	graph.getRoot().getFrameworkName = () => undefined;
	const context = createContext(graph);
	const monitored = new MonitoredTaskUtil(new TaskUtil({projectBuildContext: context}));
	t.deepEqual(monitored.getResolvedFrameworkInfo(), {name: "", version: ""});
	const recorded = new TaskInputSet(monitored.getInputRecording());
	const persisted = TaskInputSet.fromCache(recorded.toCacheObject());
	graph.setFrameworkResolution({name: "SAPUI5", version: ""});
	t.not(persisted.getSignatureWithCurrentValues((type, name) => context.resolveInputValue(type, name)),
		recorded.getSignature());
});
