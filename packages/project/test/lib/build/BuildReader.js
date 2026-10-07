import test from "ava";
import sinon from "sinon";
import BuildReader from "../../../lib/build/BuildReader.js";

function createMockProject(name, namespace, type = "library") {
	return {
		getName: () => name,
		getNamespace: () => namespace,
		getType: () => type,
	};
}

test.afterEach.always(() => {
	sinon.restore();
});

test("constructor: throws when multiple projects share a namespace", (t) => {
	const projects = [
		createMockProject("proj-a", "my/namespace"),
		createMockProject("proj-b", "my/namespace"),
	];
	t.throws(() => new BuildReader("test", projects, {}), {
		message: /Multiple projects with namespace 'my\/namespace' found/
	});
});

test("byGlob: delegates to combined reader", async (t) => {
	const projects = [createMockProject("proj-a", "my/ns")];
	const mockReader = {byGlob: sinon.stub().resolves([{path: "/a.js"}])};
	const buildServerInterface = {
		getReaderForProjects: sinon.stub().resolves(mockReader),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byGlob("**/*.js");
	t.deepEqual(result, [{path: "/a.js"}]);
	t.is(buildServerInterface.getReaderForProjects.firstCall.args[0][0], "proj-a");
});

test("byPath: returns resource from primary reader", async (t) => {
	const projects = [createMockProject("proj-a", "my/ns")];
	const resource = {getPath: () => "/resources/my/ns/a.js"};
	const mockReader = {byPath: sinon.stub().resolves(resource)};
	const buildServerInterface = {
		getReaderForProject: sinon.stub().resolves(mockReader),
		getReaderForProjects: sinon.stub().resolves(mockReader),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byPath("/resources/my/ns/a.js");
	t.is(result, resource);
});

test("byPath: single project queries only its own reader", async (t) => {
	// For a single project, #getReaderForProjects short-circuits to the same reader as
	// #getReaderForProject, so byPath offers only the single project's reader and consults
	// nothing else when it returns null.
	const projects = [createMockProject("proj-a", "my/ns")];
	const primaryReader = {byPath: sinon.stub().resolves(null)};
	const buildServerInterface = {
		getReaderForProject: sinon.stub().resolves(primaryReader),
		getReaderForProjects: sinon.stub().resolves(primaryReader),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byPath("/resources/my/ns/a.js");
	t.is(result, null);
	t.is(buildServerInterface.getReaderForProject.callCount, 1);
	t.is(buildServerInterface.getReaderForProjects.callCount, 0);
});

test("byPath: final fallback when path doesn't match any namespace", async (t) => {
	const projects = [
		createMockProject("proj-a", "ns/a"),
		createMockProject("proj-b", "ns/b"),
	];
	const mockReader = {byPath: sinon.stub().resolves(null)};
	const buildServerInterface = {
		getReaderForProjects: sinon.stub().resolves(mockReader),
		getCachedReadersForProjects: sinon.stub().returns(null),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byPath("/resources/unknown/path.js");
	t.is(result, null);
	t.true(buildServerInterface.getReaderForProjects.called);
});

test("byPath: uses cached reader to identify project", async (t) => {
	const projects = [
		createMockProject("proj-a", "ns/a"),
		createMockProject("proj-b", "ns/b"),
	];
	const foundResource = {getProject: () => ({getName: () => "proj-a"})};
	const cachedReader = {byPath: sinon.stub().resolves(foundResource)};
	const projectReader = {byPath: sinon.stub().resolves(foundResource)};
	const buildServerInterface = {
		getReaderForProject: sinon.stub().resolves(projectReader),
		getReaderForProjects: sinon.stub().resolves(projectReader),
		getCachedReadersForProjects: sinon.stub().returns(cachedReader),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byPath("/resources/other/path.js");
	t.is(result, foundResource);
});

test("byPath: application fallback for non-resource paths", async (t) => {
	const projects = [
		createMockProject("my-app", "my/app", "application"),
		createMockProject("my-lib", "my/lib"),
	];
	const foundResource = {getPath: () => "/index.html"};
	const appReader = {byPath: sinon.stub().resolves(foundResource)};
	const cachedReader = {byPath: sinon.stub().resolves(null)};
	const buildServerInterface = {
		getReaderForProject: sinon.stub().resolves(appReader),
		getReaderForProjects: sinon.stub().resolves(appReader),
		getCachedReadersForProjects: sinon.stub().returns(cachedReader),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byPath("/index.html");
	t.is(result, foundResource);
});

// Integration-style harness modelling a realistic multi-project build server. Each project owns a
// set of virtual resource paths. Requesting a reader for a project (getReaderForProject /
// getReaderForProjects) records the project name in `builtProjects` to stand in for the build the
// BuildServer would trigger for a non-fresh project, so a test can assert which projects a single
// byPath request would (re)build.
function createBuildServerHarness(projectResources) {
	const builtProjects = new Set();
	const projects = [];

	function createProjectReader(name) {
		const paths = projectResources[name];
		const project = {getName: () => name};
		return {
			async byPath(virPath) {
				if (paths.has(virPath)) {
					return {getPath: () => virPath, getProject: () => project};
				}
				return null;
			},
			async byGlob() {
				return [];
			},
		};
	}

	function createCombinedReader(names) {
		const readers = names.map((name) => createProjectReader(name));
		return {
			async byPath(virPath) {
				for (const reader of readers) {
					const res = await reader.byPath(virPath);
					if (res) {
						return res;
					}
				}
				return null;
			},
			async byGlob() {
				return [];
			},
		};
	}

	const buildServerInterface = {
		async getReaderForProject(name) {
			builtProjects.add(name);
			return createProjectReader(name);
		},
		async getReaderForProjects(names) {
			for (const name of names) {
				builtProjects.add(name);
			}
			return createCombinedReader(names);
		},
		// Nothing is fresh in these cold-start scenarios, so no cached reader is available to
		// identify the owning project without a build.
		getCachedReadersForProjects() {
			return undefined;
		},
	};

	return {projects, builtProjects, buildServerInterface};
}

// Regression: a theme library contributes resources under a path that collides with another
// project's namespace. "themelib.horizon" has no namespace (theme libraries can serve multiple)
// and provides "/resources/sap/ui/core/themes/sap_horizon/library.css". Walking that path matches
// the "sap/ui/core" namespace of the sap.ui.core library, which does not own the resource. The
// request must still resolve from the theme library without requesting a reader for every project,
// which would (re)build unrelated stale projects such as the sap.m library.
test("byPath: routes colliding theme-library resource without building unrelated projects", async (t) => {
	const {builtProjects, buildServerInterface} = createBuildServerHarness({
		"app.a": new Set(["/index.html"]),
		"sap.ui.core": new Set([
			"/resources/sap/ui/core/library.js",
			// sap.ui.core ships the base theme itself
			"/resources/sap/ui/core/themes/base/library.css",
		]),
		"themelib.horizon": new Set([
			"/resources/sap/ui/core/themes/sap_horizon/library.css",
		]),
		"sap.m": new Set(["/resources/sap/m/library.js"]),
	});
	const projects = [
		createMockProject("app.a", "app/a", "application"),
		createMockProject("sap.ui.core", "sap/ui/core", "library"),
		createMockProject("themelib.horizon", null, "theme-library"),
		createMockProject("sap.m", "sap/m", "library"),
	];
	const reader = new BuildReader("test", projects, buildServerInterface);

	const res = await reader.byPath("/resources/sap/ui/core/themes/sap_horizon/library.css");

	t.truthy(res, "Resource is found");
	t.is(res.getProject().getName(), "themelib.horizon", "Resource resolves from the theme library");
	t.false(builtProjects.has("sap.m"), "Unrelated library sap.m is not built");
	t.false(builtProjects.has("app.a"), "Unrelated application is not built");
});

// The base theme lives in the sap.ui.core library itself, so a request for it must resolve from the
// namespace-matched library without building any theme library.
test("byPath: routes base-theme resource to owning library without building theme libraries", async (t) => {
	const {builtProjects, buildServerInterface} = createBuildServerHarness({
		"app.a": new Set(["/index.html"]),
		"sap.ui.core": new Set([
			"/resources/sap/ui/core/themes/base/library.css",
		]),
		"themelib.horizon": new Set([
			"/resources/sap/ui/core/themes/sap_horizon/library.css",
		]),
	});
	const projects = [
		createMockProject("app.a", "app/a", "application"),
		createMockProject("sap.ui.core", "sap/ui/core", "library"),
		createMockProject("themelib.horizon", null, "theme-library"),
	];
	const reader = new BuildReader("test", projects, buildServerInterface);

	const res = await reader.byPath("/resources/sap/ui/core/themes/base/library.css");

	t.truthy(res, "Resource is found");
	t.is(res.getProject().getName(), "sap.ui.core", "Resource resolves from the owning library");
	t.false(builtProjects.has("themelib.horizon"), "Theme library is not built for a base-theme request");
});

// A theme library whose resource path does not collide with any namespace (nothing in the path
// matches a namespace) must still route to the theme library rather than falling back to all
// projects.
test("byPath: routes non-colliding theme-library resource without building unrelated projects", async (t) => {
	const {builtProjects, buildServerInterface} = createBuildServerHarness({
		"app.a": new Set(["/index.html"]),
		"sap.ui.core": new Set(["/resources/sap/ui/core/library.js"]),
		"theme.library.e": new Set([
			"/resources/theme/library/e/themes/my_theme/library.css",
		]),
		"sap.m": new Set(["/resources/sap/m/library.js"]),
	});
	const projects = [
		createMockProject("app.a", "app/a", "application"),
		createMockProject("sap.ui.core", "sap/ui/core", "library"),
		createMockProject("theme.library.e", null, "theme-library"),
		createMockProject("sap.m", "sap/m", "library"),
	];
	const reader = new BuildReader("test", projects, buildServerInterface);

	const res = await reader.byPath("/resources/theme/library/e/themes/my_theme/library.css");

	t.truthy(res, "Resource is found");
	t.is(res.getProject().getName(), "theme.library.e", "Resource resolves from the theme library");
	t.false(builtProjects.has("sap.m"), "Unrelated library sap.m is not built");
	t.false(builtProjects.has("app.a"), "Unrelated application is not built");
});

// ---- inspect mode (UI5_CLI_INSPECT) -------------------------------------------
// BuildReader reads UI5_CLI_INSPECT in its constructor, so these tests toggle the env var before
// constructing. They collect the `ui5.serve-request` events the reader emits on the process bus.

function collectServeRequests() {
	const events = [];
	const listener = (evt) => events.push(evt);
	process.on("ui5.serve-request", listener);
	return {
		events,
		stop: () => process.off("ui5.serve-request", listener),
	};
}

function withInspect(enabled, fn) {
	const previous = process.env.UI5_CLI_INSPECT;
	if (enabled) {
		process.env.UI5_CLI_INSPECT = "true";
	} else {
		delete process.env.UI5_CLI_INSPECT;
	}
	try {
		return fn();
	} finally {
		if (previous === undefined) {
			delete process.env.UI5_CLI_INSPECT;
		} else {
			process.env.UI5_CLI_INSPECT = previous;
		}
	}
}

test.serial("byPath: emits ui5.serve-request start/end when inspect is enabled", async (t) => {
	const sink = collectServeRequests();
	try {
		const resource = {getProject: () => ({getName: () => "sap.m"})};
		const mockReader = {byPath: sinon.stub().resolves(resource)};
		const buildServerInterface = {
			getReaderForProject: sinon.stub().resolves(mockReader),
			getReaderForProjects: sinon.stub().resolves(mockReader),
			getCachedReadersForProjects: sinon.stub().returns(null),
			getProjectState: sinon.stub().returns("building"),
		};
		const projects = [
			createMockProject("sap.m", "sap/m"),
			createMockProject("sap.ui.core", "sap/ui/core"),
		];
		const reader = withInspect(true, () => new BuildReader("test", projects, buildServerInterface));

		const res = await reader.byPath("/resources/sap/m/Button.js");
		t.is(res, resource);

		t.is(sink.events.length, 2, "one start and one end event");
		const [start, end] = sink.events;
		t.is(start.phase, "start");
		t.is(start.path, "/resources/sap/m/Button.js");
		t.deepEqual(start.projects, [{name: "sap.m", state: "building"}],
			"the resolved candidate carries its current build-server state");
		t.true(Array.isArray(start.hrtime));
		t.is(end.phase, "end");
		t.is(end.id, start.id, "start and end share one correlation id");
		t.is(end.resolvedProject, "sap.m");
		t.is(end.found, true);
		t.is(end.error, false);
		t.is(end.erroredProject, null);
	} finally {
		sink.stop();
	}
});

test.serial("byPath: emits an end event with found=false on a miss", async (t) => {
	const sink = collectServeRequests();
	try {
		const mockReader = {byPath: sinon.stub().resolves(null)};
		const buildServerInterface = {
			getReaderForProject: sinon.stub().resolves(mockReader),
			getReaderForProjects: sinon.stub().resolves(mockReader),
			getCachedReadersForProjects: sinon.stub().returns(null),
			getProjectState: sinon.stub().returns("fresh"),
		};
		const projects = [
			createMockProject("sap.m", "sap/m"),
			createMockProject("sap.ui.core", "sap/ui/core"),
		];
		const reader = withInspect(true, () => new BuildReader("test", projects, buildServerInterface));

		const res = await reader.byPath("/resources/unknown/path.js");
		t.is(res, null);
		const end = sink.events.at(-1);
		t.is(end.phase, "end");
		t.is(end.resolvedProject, null);
		t.is(end.found, false);
		t.is(end.error, false);
	} finally {
		sink.stop();
	}
});

test.serial("byPath: identifies the project whose reader request failed", async (t) => {
	const sink = collectServeRequests();
	try {
		const error = new Error("Build failed");
		const getProjectState = sinon.stub();
		getProjectState.onFirstCall().returns("building");
		getProjectState.onSecondCall().returns("errored");
		const buildServerInterface = {
			getReaderForProject: sinon.stub().rejects(error),
			getReaderForProjects: sinon.stub(),
			getCachedReadersForProjects: sinon.stub().returns(null),
			getProjectState,
		};
		const projects = [createMockProject("sap.m", "sap/m")];
		const reader = withInspect(true, () => new BuildReader("test", projects, buildServerInterface));

		const thrown = await t.throwsAsync(() => reader.byPath("/resources/sap/m/Button.js"));
		t.is(thrown, error);
		const end = sink.events.at(-1);
		t.is(end.phase, "end");
		t.is(end.error, true);
		t.is(end.erroredProject, "sap.m");
	} finally {
		sink.stop();
	}
});

test.serial("byPath: emits nothing when inspect is disabled", async (t) => {
	const sink = collectServeRequests();
	try {
		const resource = {getProject: () => ({getName: () => "sap.m"})};
		const mockReader = {byPath: sinon.stub().resolves(resource)};
		const buildServerInterface = {
			getReaderForProject: sinon.stub().resolves(mockReader),
			getReaderForProjects: sinon.stub().resolves(mockReader),
			getCachedReadersForProjects: sinon.stub().returns(null),
			getProjectState: sinon.stub().returns("building"),
		};
		const projects = [createMockProject("sap.m", "sap/m"), createMockProject("sap.ui.core", "sap/ui/core")];
		const reader = withInspect(false, () => new BuildReader("test", projects, buildServerInterface));

		await reader.byPath("/resources/sap/m/Button.js");
		t.is(sink.events.length, 0, "no events and no getProjectState calls when disabled");
		t.is(buildServerInterface.getProjectState.callCount, 0);
	} finally {
		sink.stop();
	}
});

test("_getInspectProjectNames: namespace, theme-library, and application candidates", (t) => {
	const projects = [
		createMockProject("app.a", "app/a", "application"),
		createMockProject("sap.m", "sap/m", "library"),
		createMockProject("theme.lib", null, "theme-library"),
	];
	const reader = new BuildReader("test", projects, {});

	t.deepEqual(reader._getInspectProjectNames("/resources/sap/m/Button.js"), ["sap.m"]);
	t.deepEqual(reader._getInspectProjectNames("/index.html"), ["app.a"],
		"a non-/resources path falls back to the application project");
	t.true(reader._getInspectProjectNames("/resources/sap/ui/core/themes/x/library.css").includes("theme.lib"),
		"a theme resource path offers the theme library");
});
