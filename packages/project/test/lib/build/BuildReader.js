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
