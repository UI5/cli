import test from "ava";
import sinon from "sinon";
import Proxy from "../../../lib/readers/Proxy.js";
import Resource from "../../../lib/Resource.js";

test("Proxy: constructor with valid parameters", (t) => {
	const proxy = new Proxy({
		name: "myProxy",
		getResource: sinon.stub(),
		listResourcePaths: sinon.stub()
	});

	t.is(proxy.getName(), "myProxy");
});

test("Proxy: constructor throws for missing getResource", (t) => {
	t.throws(() => {
		new Proxy({
			name: "myProxy",
			listResourcePaths: sinon.stub()
		});
	}, {message: "Proxy adapter: Missing or invalid parameter 'getResource'"});
});

test("Proxy: constructor throws for invalid getResource", (t) => {
	t.throws(() => {
		new Proxy({
			name: "myProxy",
			getResource: "notAFunction",
			listResourcePaths: sinon.stub()
		});
	}, {message: "Proxy adapter: Missing or invalid parameter 'getResource'"});
});

test("Proxy: constructor throws for missing listResourcePaths", (t) => {
	t.throws(() => {
		new Proxy({
			name: "myProxy",
			getResource: sinon.stub()
		});
	}, {message: "Proxy adapter: Missing or invalid parameter 'listResourcePaths'"});
});

test("Proxy: constructor throws for invalid listResourcePaths", (t) => {
	t.throws(() => {
		new Proxy({
			name: "myProxy",
			getResource: sinon.stub(),
			listResourcePaths: 123
		});
	}, {message: "Proxy adapter: Missing or invalid parameter 'listResourcePaths'"});
});

test("Proxy: _byGlob returns matching resources", async (t) => {
	const resource1 = new Resource({path: "/resources/file1.js", buffer: Buffer.from("a")});
	const resource2 = new Resource({path: "/resources/file2.js", buffer: Buffer.from("b")});

	const getResource = sinon.stub();
	getResource.withArgs("/resources/file1.js").resolves(resource1);
	getResource.withArgs("/resources/file2.js").resolves(resource2);

	const listResourcePaths = sinon.stub().resolves([
		"/resources/file1.js",
		"/resources/file2.js",
		"/resources/other.xml"
	]);

	const proxy = new Proxy({
		name: "myProxy",
		getResource,
		listResourcePaths
	});

	const trace = {collection: sinon.spy()};
	const resources = await proxy._byGlob("/resources/**/*.js", {nodir: true}, trace);

	t.is(resources.length, 2);
	t.is(resources[0].getPath(), "/resources/file1.js");
	t.is(resources[1].getPath(), "/resources/file2.js");
});

test("Proxy: _byGlob with array pattern", async (t) => {
	const resource1 = new Resource({path: "/resources/file1.js", buffer: Buffer.from("a")});

	const getResource = sinon.stub();
	getResource.withArgs("/resources/file1.js").resolves(resource1);

	const listResourcePaths = sinon.stub().resolves([
		"/resources/file1.js",
		"/resources/file2.xml"
	]);

	const proxy = new Proxy({
		name: "myProxy",
		getResource,
		listResourcePaths
	});

	const trace = {collection: sinon.spy()};
	const resources = await proxy._byGlob(["/resources/**/*.js"], {nodir: true}, trace);

	t.is(resources.length, 1);
	t.is(resources[0].getPath(), "/resources/file1.js");
});

test("Proxy: _byPath returns resource", async (t) => {
	const resource = new Resource({path: "/resources/file1.js", buffer: Buffer.from("content")});

	const getResource = sinon.stub().resolves(resource);
	const listResourcePaths = sinon.stub().resolves([]);

	const proxy = new Proxy({
		name: "myProxy",
		getResource,
		listResourcePaths
	});

	const trace = {pathCall: sinon.spy()};
	const result = await proxy._byPath("/resources/file1.js", {nodir: true}, trace);

	t.is(result.getPath(), "/resources/file1.js");
	t.true(trace.pathCall.calledOnce);
});

test("Proxy: _byPath returns null when resource not found", async (t) => {
	const getResource = sinon.stub().resolves(null);
	const listResourcePaths = sinon.stub().resolves([]);

	const proxy = new Proxy({
		name: "myProxy",
		getResource,
		listResourcePaths
	});

	const trace = {pathCall: sinon.spy()};
	const result = await proxy._byPath("/resources/missing.js", {nodir: true}, trace);

	t.is(result, null);
});

test("Proxy: _byPath returns null for directory when nodir is true", async (t) => {
	const dirResource = new Resource({path: "/resources/dir", isDirectory: true});

	const getResource = sinon.stub().resolves(dirResource);
	const listResourcePaths = sinon.stub().resolves([]);

	const proxy = new Proxy({
		name: "myProxy",
		getResource,
		listResourcePaths
	});

	const trace = {pathCall: sinon.spy()};
	const result = await proxy._byPath("/resources/dir", {nodir: true}, trace);

	t.is(result, null);
});

test("Proxy: _byPath returns directory when nodir is false", async (t) => {
	const dirResource = new Resource({path: "/resources/dir", isDirectory: true});

	const getResource = sinon.stub().resolves(dirResource);
	const listResourcePaths = sinon.stub().resolves([]);

	const proxy = new Proxy({
		name: "myProxy",
		getResource,
		listResourcePaths
	});

	const trace = {pathCall: sinon.spy()};
	const result = await proxy._byPath("/resources/dir", {nodir: false}, trace);

	t.is(result.getPath(), "/resources/dir");
});
