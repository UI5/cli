import path from "node:path";
import test from "ava";
import esmock from "esmock";
import AbstractResolver from "../../../../lib/ui5Framework/AbstractResolver.js";
import ProjectGraph from "../../../../lib/graph/ProjectGraph.js";
import Specification from "../../../../lib/specifications/Specification.js";
import ProjectBuildContext from "../../../../lib/build/helpers/ProjectBuildContext.js";
import TaskUtil from "../../../../lib/build/helpers/TaskUtil.js";
import MonitoredTaskUtil from "../../../../lib/build/helpers/MonitoredTaskUtil.js";
import TaskInputSet from "../../../../lib/build/cache/index/TaskInputSet.js";
import {createFrameworkProject} from "./__helper__/frameworkProject.js";

const linkedCore = {id: "@openui5/sap.ui.core", version: "1.129.1"};
const unusedSapui5 = {id: "@sapui5/sap.uxap", version: "1.140.0"};

// Exercise the actual workspace collector, resolver traversal and ProjectProcessor; only installation
// and loading an installed package from disk are replaced with local project specifications.
async function enrichGraph(t, {
	frameworkName = "OpenUI5", version = "1.130.0", versionOverride,
	referencedLibraries = ["sap.ui.core"], workspaceLibraries = {}, distributionLibraries = {},
} = {}) {
	const installedProjects = new Map();
	class LocalResolver extends AbstractResolver {
		static async resolveVersion(requestedVersion) {
			return requestedVersion;
		}
		async handleLibrary(name) {
			const metadata = {
				id: `@openui5/${name}`, version: this._version, dependencies: [], optionalDependencies: [],
				...distributionLibraries[name],
			};
			installedProjects.set(`${metadata.id}@${metadata.version}`, await createFrameworkProject(name, metadata));
			return {
				metadata: Promise.resolve(metadata),
				install: Promise.resolve({pkgPath: path.resolve(import.meta.dirname, "../../../fixtures/library.e")}),
			};
		}
	}
	class InstalledModule {
		constructor({id, version: packageVersion}) {
			this.project = installedProjects.get(`${id}@${packageVersion}`);
		}
		async getSpecifications() {
			return {project: this.project};
		}
	}
	const helper = await esmock.p("../../../../lib/graph/helpers/ui5Framework.js", {
		"../../../../lib/ui5Framework/Openui5Resolver.js": LocalResolver,
		"../../../../lib/ui5Framework/Sapui5Resolver.js": LocalResolver,
		"../../../../lib/ui5Framework/Sapui5MavenSnapshotResolver.js": LocalResolver,
		"../../../../lib/config/Configuration.js": {fromFile: async () => ({getUi5DataDir: () => undefined})},
		"../../../../lib/graph/Module.js": InstalledModule,
	});
	t.teardown(() => esmock.purge(helper));
	const modules = new Map();
	for (const [name, metadata] of Object.entries(workspaceLibraries)) {
		const project = await createFrameworkProject(name, metadata);
		modules.set(name, {
			getSpecifications: async () => ({project}),
			getVersion: () => project.getVersion(),
			getPath: () => project.getRootPath(),
		});
	}
	const workspace = {
		getName: () => "test",
		getModules: async () => [...modules.values()],
		getModuleByProjectName: async (name) => modules.get(name),
	};
	const root = await Specification.create({
		id: "test-app", version: "1.0.0",
		modulePath: path.resolve(import.meta.dirname, "../../../fixtures/application.a"),
		configuration: {
			specVersion: "3.1", kind: "project", type: "application", metadata: {name: "test-app"},
			framework: {
				name: frameworkName,
				...(version ? {version} : {}),
				libraries: referencedLibraries.map((name) => ({name})),
			},
		},
	});
	const graph = new ProjectGraph({rootProjectName: root.getName()});
	graph.addProject(root);
	const events = [];
	const listener = (event) => events.push(event);
	process.on("ui5.project-framework-resolved", listener);
	try {
		await helper.enrichProjectGraph(graph, {workspace, versionOverride});
	} finally {
		process.off("ui5.project-framework-resolved", listener);
	}
	return {graph, events};
}

for (const frameworkName of ["SAPUI5", "OpenUI5"]) {
	test.serial(`${frameworkName}: unused workspace libraries preserve the distribution version`, async (t) => {
		const {graph, events} = await enrichGraph(t, {
			frameworkName, workspaceLibraries: {"sap.uxap": unusedSapui5},
		});
		t.is(graph.getProject("sap.uxap"), undefined, "The available workspace project is not consumed");
		t.is(graph.getProject("sap.ui.core").getVersion(), "1.130.0");
		t.is(graph.getResolvedFrameworkInfo().version, "1.130.0");
		t.deepEqual(events, [{framework: {name: frameworkName, version: "1.130.0"}}]);
	});
}

for (const versionOverride of ["1.131.0", "1.131.0-SNAPSHOT"]) {
	test.serial(`Unused workspace libraries preserve the resolved override ${versionOverride}`, async (t) => {
		const {graph, events} = await enrichGraph(t, {
			frameworkName: "SAPUI5", versionOverride, workspaceLibraries: {"sap.uxap": unusedSapui5},
		});
		t.is(graph.getResolvedFrameworkInfo().version, versionOverride);
		t.deepEqual(events, [{framework: {name: "SAPUI5", version: versionOverride}}]);
	});
}

for (const frameworkName of ["SAPUI5", "OpenUI5"]) {
	test.serial(`${frameworkName}: mixed SAPUI5 graphs have no reliable distribution version`, async (t) => {
		const sapui5Library = {id: "@sapui5/sap.ui.comp", version: "1.130.0"};
		const {graph, events} = await enrichGraph(t, {
			frameworkName, referencedLibraries: ["sap.ui.core", "sap.ui.comp"],
			workspaceLibraries: {
				"sap.ui.core": linkedCore,
				...(frameworkName === "OpenUI5" ? {"sap.ui.comp": sapui5Library} : {}),
			},
			distributionLibraries: frameworkName === "SAPUI5" ? {"sap.ui.comp": sapui5Library} : {},
		});
		t.is(graph.getProject("sap.ui.core").getVersion(), "1.129.1");
		t.is(graph.getProject("sap.ui.comp").getId(), "@sapui5/sap.ui.comp");
		t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
		t.deepEqual(events, [{framework: {name: "SAPUI5", version: ""}}]);
	});
}

test.serial("SAPUI5: a workspace containing only OpenUI5 packages has no reliable distribution version", async (t) => {
	const {graph, events} = await enrichGraph(t, {
		frameworkName: "SAPUI5", workspaceLibraries: {"sap.ui.core": linkedCore},
	});
	t.is(graph.getProject("sap.ui.core").getId(), "@openui5/sap.ui.core");
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
	t.deepEqual(events, [{framework: {name: "SAPUI5", version: ""}}]);
});

test.serial("OpenUI5 configuration with a consumed SAPUI5 theme resolves and emits SAPUI5", async (t) => {
	const {graph, events} = await enrichGraph(t, {
		referencedLibraries: ["sap.ui.core", "themelib_sap_horizon"],
		workspaceLibraries: {
			"themelib_sap_horizon": {id: "@sapui5/themelib_sap_horizon", version: "1.140.0", type: "theme-library"},
		},
	});
	t.is(graph.getProject("themelib_sap_horizon").getType(), "theme-library");
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
	t.deepEqual(events, [{framework: {name: "SAPUI5", version: ""}}]);
});

test.serial("OpenUI5: unused SAPUI5 libraries do not override the linked core version", async (t) => {
	const {graph, events} = await enrichGraph(t, {
		workspaceLibraries: {"sap.ui.core": linkedCore, "sap.uxap": unusedSapui5},
	});
	t.is(graph.getProject("sap.uxap"), undefined);
	t.is(graph.getResolvedFrameworkInfo().version, "1.129.1");
	t.deepEqual(events, [{framework: {name: "OpenUI5", version: "1.129.1"}}]);
});

test.serial("OpenUI5: transitive workspace contribution reports the linked core version", async (t) => {
	const {graph, events} = await enrichGraph(t, {
		referencedLibraries: ["sap.m"], workspaceLibraries: {"sap.ui.core": linkedCore},
		distributionLibraries: {"sap.m": {dependencies: ["sap.ui.core"]}},
	});
	t.deepEqual(graph.getDependencies("sap.m"), ["sap.ui.core"]);
	t.is(graph.getResolvedFrameworkInfo().version, "1.129.1");
	t.deepEqual(events, [{framework: {name: "OpenUI5", version: "1.129.1"}}]);
});

for (const version of [null, "1.130.0"]) {
	test.serial(`OpenUI5: absent core falls back to ${version ?? "an empty version"}`, async (t) => {
		const {graph, events} = await enrichGraph(t, {
			version, referencedLibraries: ["sap.ui.lib1"],
			workspaceLibraries: {"sap.ui.lib1": {id: "@openui5/sap.ui.lib1", version: "1.129.1"}},
		});
		t.is(graph.getProject("sap.ui.core"), undefined);
		t.is(graph.getProject("sap.ui.lib1").getVersion(), "1.129.1");
		t.is(graph.getResolvedFrameworkInfo().version, version ?? "");
		t.deepEqual(events, [{framework: {name: "OpenUI5", version: version ?? ""}}]);
	});
}

function createProjectBuildContext(graph) {
	return new ProjectBuildContext({getGraph: () => graph, getTaskRepository: () => ({})}, graph.getRoot());
}

test.serial("Cached metadata inputs ignore unused workspace modules but track effective changes", async (t) => {
	const initial = await enrichGraph(t, {frameworkName: "SAPUI5"});
	const taskUtil = new MonitoredTaskUtil(new TaskUtil({
		projectBuildContext: createProjectBuildContext(initial.graph),
	}));
	t.is(taskUtil.getResolvedFrameworkInfo().version, "1.130.0");
	const recorded = new TaskInputSet(taskUtil.getInputRecording());
	const persisted = TaskInputSet.fromCache(JSON.parse(JSON.stringify(recorded.toCacheObject())));
	const currentSignature = (graph) => {
		const context = createProjectBuildContext(graph);
		return persisted.getSignatureWithCurrentValues((type, name) => context.resolveInputValue(type, name));
	};
	const unused = await enrichGraph(t, {
		frameworkName: "SAPUI5", workspaceLibraries: {"sap.uxap": unusedSapui5},
	});
	t.is(currentSignature(unused.graph), recorded.getSignature(), "Unused workspace modules keep the input signature");
	const overridden = await enrichGraph(t, {frameworkName: "SAPUI5", versionOverride: "1.131.0"});
	t.not(currentSignature(overridden.graph), recorded.getSignature(), "An effective override changes the signature");
	const linked = await enrichGraph(t, {
		frameworkName: "SAPUI5", workspaceLibraries: {"sap.ui.core": linkedCore},
	});
	t.deepEqual(linked.graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
	t.not(currentSignature(linked.graph), recorded.getSignature(), "Consumed workspace modules change the signature");
});
