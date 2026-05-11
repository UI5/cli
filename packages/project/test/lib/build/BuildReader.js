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

test("byPath: falls back to all projects when primary reader returns null", async (t) => {
	const projects = [createMockProject("proj-a", "my/ns")];
	const resource = {getPath: () => "/resources/my/ns/a.js"};
	const primaryReader = {byPath: sinon.stub().resolves(null)};
	const fallbackReader = {byPath: sinon.stub().resolves(resource)};
	const buildServerInterface = {
		getReaderForProject: sinon.stub().resolves(primaryReader),
		getReaderForProjects: sinon.stub().resolves(fallbackReader),
	};
	const reader = new BuildReader("test", projects, buildServerInterface);
	const result = await reader.byPath("/resources/my/ns/a.js");
	t.is(result, resource);
});

test("_getReaderForResource: final fallback when path doesn't match any namespace", async (t) => {
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

test("_getReaderForResource: uses cached reader to identify project", async (t) => {
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

test("_getReaderForResource: application fallback for non-resource paths", async (t) => {
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
