import path from "node:path";
import test from "ava";
import ProjectGraph from "../../../../lib/graph/ProjectGraph.js";
import Specification from "../../../../lib/specifications/Specification.js";
import ui5Framework from "../../../../lib/graph/helpers/ui5Framework.js";
import {createFrameworkProject} from "./__helper__/frameworkProject.js";

const core = {id: "@openui5/sap.ui.core", version: "1.129.1-SNAPSHOT"};
const sapui5 = {id: "@sapui5/sap.ui.comp", version: "1.130.0"};
const theme = {id: "@sapui5/themelib_sap_horizon", version: "1.130.0", type: "theme-library"};

async function createGraph({frameworkName, version, libraries = {}} = {}) {
	const root = await Specification.create({
		id: "test-app", version: "2.3.4",
		modulePath: path.resolve(import.meta.dirname, "../../../fixtures/application.a"),
		configuration: {
			specVersion: "3.1", kind: "project", type: "application", metadata: {name: "test-app"},
			...(frameworkName ? {framework: {name: frameworkName, ...(version ? {version} : {})}} : {}),
		},
	});
	const graph = new ProjectGraph({rootProjectName: root.getName()});
	graph.addProject(root);
	for (const [name, metadata] of Object.entries(libraries)) {
		graph.addProject(await createFrameworkProject(name, metadata));
		graph.declareDependency(root.getName(), name);
	}
	return graph;
}

for (const [title, configuration, expected] of [
	["no evidence does not use the application version", {}, {name: "", version: ""}],
	["unconfigured OpenUI5 preserves core's snapshot suffix", {libraries: {"sap.ui.core": core}},
		{name: "OpenUI5", version: core.version}],
	["OpenUI5 without core has an unknown version",
		{libraries: {"sap.m": {id: "@openui5/sap.m", version: "1.129.1"}}}, {name: "OpenUI5", version: ""}],
	["unconfigured SAPUI5 has no distribution version", {libraries: {"sap.ui.comp": sapui5}},
		{name: "SAPUI5", version: ""}],
	["mixed libraries select SAPUI5", {libraries: {"sap.ui.core": core, "sap.ui.comp": sapui5}},
		{name: "SAPUI5", version: ""}],
	["SAPUI5 theme evidence needs no .library resource",
		{libraries: {"sap.ui.core": core, "themelib_sap_horizon": theme}}, {name: "SAPUI5", version: ""}],
	["a configured OpenUI5 name is kept even when SAPUI5 evidence is present (name is authoritative)",
		{frameworkName: "OpenUI5", version: "1.130.0", libraries: {"sap.ui.core": core, "sap.ui.comp": sapui5}},
		{name: "OpenUI5", version: core.version}],
	["configured distribution fallback keeps its version",
		{frameworkName: "SAPUI5", version: "1.130.0-SNAPSHOT", libraries: {"sap.ui.core": core}},
		{name: "SAPUI5", version: "1.130.0-SNAPSHOT"}],
	["name-only OpenUI5 config can use core", {frameworkName: "OpenUI5", libraries: {"sap.ui.core": core}},
		{name: "OpenUI5", version: core.version}],
	["known SAPUI5 name without version does not use OpenUI5 core",
		{frameworkName: "SAPUI5", libraries: {"sap.ui.core": core}}, {name: "SAPUI5", version: ""}],
]) {
	test(title, async (t) => {
		const graph = await createGraph(configuration);
		t.deepEqual(graph.getResolvedFrameworkInfo(), expected);
	});
}

test("root sap.ui.core is included in framework detection", async (t) => {
	const root = await createFrameworkProject("sap.ui.core", core);
	const graph = new ProjectGraph({rootProjectName: root.getName()});
	graph.addProject(root);
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version});
});

test("transitive framework projects count; disconnected and unresolved optional projects do not", async (t) => {
	const graph = await createGraph({libraries: {"plugin": {id: "plugin", version: "1.0.0"}}});
	graph.addProject(await createFrameworkProject("sap.ui.core", core));
	graph.declareDependency("plugin", "sap.ui.core");
	graph.addProject(await createFrameworkProject("sap.ui.comp", sapui5));
	graph.declareOptionalDependency("plugin", "sap.ui.comp");
	await graph.resolveOptionalDependencies();
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version});
	graph.declareDependency("sap.ui.core", "sap.ui.comp");
	await graph.resolveOptionalDependencies();
	t.true(graph.getDependencies("plugin").includes("sap.ui.comp"));
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
});

test("an early read is not memoized before graph construction finishes", async (t) => {
	const graph = await createGraph();
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "", version: ""});
	graph.addProject(await createFrameworkProject("sap.ui.core", core));
	graph.declareDependency(graph.getRoot().getName(), "sap.ui.core");
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version});
});

for (const name of ["OpenUI5", "SAPUI5"]) {
	test(`${name}: distribution context ignores unused workspace offerings`, async (t) => {
		// The reachable core matches the resolved distribution version, as it would after enrichment.
		const graph = await createGraph({
			libraries: {"sap.ui.core": {id: "@openui5/sap.ui.core", version: "1.131.0-SNAPSHOT"}},
		});
		graph.addProject(await createFrameworkProject("sap.ui.comp", sapui5));
		graph.setFrameworkResolution({name, version: "1.131.0-SNAPSHOT", workspaceProjectNames: ["sap.ui.comp"]});
		t.deepEqual(graph.getResolvedFrameworkInfo(), {name, version: "1.131.0-SNAPSHOT"});
	});
}

test("workspace OpenUI5 config keeps OpenUI5 even when SAPUI5 evidence is consumed", async (t) => {
	const graph = await createGraph({
		frameworkName: "OpenUI5", version: "1.130.0", libraries: {"sap.ui.core": core, "themelib_sap_horizon": theme},
	});
	graph.setFrameworkResolution({name: "OpenUI5", version: "1.130.0", workspaceProjectNames: ["sap.ui.core"]});
	// Configured name is authoritative; version comes from the reachable sap.ui.core.
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version});
});

test("SAPUI5 context with only OpenUI5 workspace projects retains SAPUI5 and an empty version", async (t) => {
	const graph = await createGraph({libraries: {"sap.ui.core": core}});
	graph.setFrameworkResolution({name: "SAPUI5", version: "1.130.0", workspaceProjectNames: ["sap.ui.core"]});
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
});

test("OpenUI5 workspace without core retains the established version fallback", async (t) => {
	const graph = await createGraph({libraries: {"sap.m": {id: "@openui5/sap.m", version: "1.129.1"}}});
	graph.setFrameworkResolution({name: "OpenUI5", version: "1.130.0", workspaceProjectNames: ["sap.m"]});
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: "1.130.0"});
});

test("enriched OpenUI5 without a resolved version recovers it from the reachable core", async (t) => {
	const graph = await createGraph({libraries: {"sap.ui.core": core}});
	// Enrichment ran but produced no distribution version (e.g. version omitted, no override) and no
	// workspace contribution. The version must come from the reachable sap.ui.core, not be dropped.
	graph.setFrameworkResolution({name: "OpenUI5"});
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version});
});

test("resolution inputs and returned metadata cannot be mutated by callers", async (t) => {
	const graph = await createGraph({libraries: {"sap.ui.core": core}});
	const resolution = {name: "OpenUI5", version: "1.130.0", workspaceProjectNames: ["sap.ui.core"]};
	graph.setFrameworkResolution(resolution);
	resolution.name = "SAPUI5";
	resolution.workspaceProjectNames.length = 0;
	const info = graph.getResolvedFrameworkInfo();
	info.name = "SAPUI5";
	info.version = "broken";
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version});
});

test("sealed graph returns detached metadata: caller mutation cannot corrupt the memo", async (t) => {
	const graph = await createGraph({libraries: {"sap.ui.core": core}});
	graph.setFrameworkResolution({name: "OpenUI5", version: "1.130.0", workspaceProjectNames: ["sap.ui.core"]});
	graph.seal();
	const first = graph.getResolvedFrameworkInfo();
	first.name = "SAPUI5";
	first.version = "broken";
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "OpenUI5", version: core.version},
		"memoized result stays intact after a caller mutates an earlier returned copy");
});

test("framework resolution rejects invalid identity/version and cannot change a sealed graph", async (t) => {
	const graph = await createGraph();
	t.throws(() => graph.setFrameworkResolution({name: "Other", version: "1.0.0"}), {instanceOf: TypeError});
	t.throws(() => graph.setFrameworkResolution({name: "OpenUI5", version: 123}), {instanceOf: TypeError});
	graph.setFrameworkResolution({name: "SAPUI5", version: "1.131.0-SNAPSHOT"});
	graph.seal();
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: "1.131.0-SNAPSHOT"});
	t.throws(() => graph.setFrameworkResolution({name: "OpenUI5", version: "1.129.1"}));
});

test("fallback traversal rejects cyclic dependencies instead of silently classifying an invalid graph", async (t) => {
	const graph = await createGraph({libraries: {"sap.ui.core": core, "sap.ui.comp": sapui5}});
	graph.declareDependency("sap.ui.core", "sap.ui.comp");
	graph.declareDependency("sap.ui.comp", "sap.ui.core");
	t.throws(() => graph.getResolvedFrameworkInfo(), {message: /Detected cyclic dependency chain/});
});

test("absent versions are empty strings, including name-only configuration", async (t) => {
	const graph = await createGraph();
	t.deepEqual(Object.getOwnPropertyNames(ProjectGraph.prototype)
		.filter((name) => name.startsWith("getResolvedFramework")), ["getResolvedFrameworkInfo"]);
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "", version: ""});
	const configured = await createGraph({frameworkName: "SAPUI5"});
	t.deepEqual(configured.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
	graph.setFrameworkResolution({name: "SAPUI5"});
	t.deepEqual(graph.getResolvedFrameworkInfo(), {name: "SAPUI5", version: ""});
});

for (const configuration of [
	{libraries: {"sap.ui.core": core}},
	{frameworkName: "OpenUI5", libraries: {"sap.ui.core": core}},
]) {
	test.serial(`early enrichment return emits known graph metadata (${configuration.frameworkName ?? "no config"})`,
		async (t) => {
			const graph = await createGraph(configuration);
			const events = [];
			const listener = (event) => events.push(event);
			process.on("ui5.project-framework-resolved", listener);
			try {
				await ui5Framework.enrichProjectGraph(graph);
			} finally {
				process.off("ui5.project-framework-resolved", listener);
			}
			t.deepEqual(events, [{framework: {name: "OpenUI5", version: core.version}}]);
			t.deepEqual(graph.getResolvedFrameworkInfo(), events[0].framework);
		});
}

test.serial("early framework-root return resolves and emits core's own version", async (t) => {
	const root = await createFrameworkProject("sap.ui.core", core);
	const graph = new ProjectGraph({rootProjectName: root.getName()});
	graph.addProject(root);
	const events = [];
	const listener = (event) => events.push(event);
	process.on("ui5.project-framework-resolved", listener);
	try {
		await ui5Framework.enrichProjectGraph(graph);
	} finally {
		process.off("ui5.project-framework-resolved", listener);
	}
	t.deepEqual(events, [{framework: {name: "OpenUI5", version: core.version}}]);
});
