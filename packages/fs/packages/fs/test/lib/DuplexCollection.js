const {test} = require("ava");
const sinon = require("sinon");
const DuplexCollection = require("../../lib/DuplexCollection");
const ReaderCollectionPrioritized = require("../../lib/ReaderCollectionPrioritized");
const Resource = require("../../lib/Resource");

test("DuplexCollection: constructor", (t) => {
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: {},
		writer: {}
	});

	t.deepEqual(duplexCollection._reader, {}, "reader assigned");
	t.deepEqual(duplexCollection._writer, {}, "writer assigned");
	t.true(duplexCollection._combo instanceof ReaderCollectionPrioritized, "prioritized reader collection created");
	t.deepEqual(duplexCollection._combo._name, "myCollection", "name assigned");
	t.deepEqual(duplexCollection._combo._readers, [{}, {}], "reader and writer assigned to readers");
});

test("DuplexCollection: constructor with setting default name of an empty string", (t) => {
	const duplexCollection = new DuplexCollection({
		reader: {},
		writer: {}
	});

	t.deepEqual(duplexCollection._reader, {}, "reader assigned");
	t.deepEqual(duplexCollection._writer, {}, "writer assigned");
	t.true(duplexCollection._combo instanceof ReaderCollectionPrioritized, "prioritized reader collection created");
	t.deepEqual(duplexCollection._combo._name, "", "name assigned");
	t.deepEqual(duplexCollection._combo._readers, [{}, {}], "reader and writer assigned to readers");
});

test("DuplexCollection: _byGlob w/o finding a resource", (t) => {
	t.plan(3);

	const abstractReader = {
		_byGlob: sinon.stub().returns(Promise.resolve([]))
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReader,
		writer: abstractReader
	});
	const trace = {
		collection: sinon.spy()
	};
	const comboSpy = sinon.spy(duplexCollection._combo, "_byGlob");

	return duplexCollection._byGlob("anyPattern", {someOption: true}, trace)
		.then(function(resources) {
			t.true(Array.isArray(resources), "Found resources are returned as an array");
			t.true(resources.length === 0, "No resources found");
			t.true(comboSpy.calledWithExactly("anyPattern", {someOption: true}, trace),
				"Delegated globbing task correctly to readers");
		});
});

test("DuplexCollection: _byGlob", (t) => {
	t.plan(5);

	const resource = new Resource({
		path: "my/path",
		buffer: Buffer.from("content")
	});
	const abstractReader = {
		_byGlob: sinon.stub().returns(Promise.resolve([resource]))
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReader,
		writer: abstractReader
	});
	const trace = {
		collection: sinon.spy()
	};
	const comboSpy = sinon.spy(duplexCollection._combo, "_byGlob");

	return duplexCollection._byGlob("anyPattern", {someOption: true}, trace)
		.then(function(resources) {
			t.true(Array.isArray(resources), "Found resources are returned as an array");
			t.true(resources.length === 1, "Resource found");
			t.deepEqual(resource.getPath(), "my/path", "Resource has expected path");
			t.true(comboSpy.calledWithExactly("anyPattern", {someOption: true}, trace),
				"Delegated globbing task correctly to readers");
			return resource.getString().then(function(content) {
				t.deepEqual(content, "content", "Resource has expected content");
			});
		});
});

test("DuplexCollection: _byGlobSource w/o found resources", (t) => {
	t.plan(3);

	const abstractReader = {
		byGlob: sinon.stub().returns(Promise.resolve([]))
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReader,
		writer: abstractReader
	});

	return duplexCollection.byGlobSource("anyPattern", {someOption: true})
		.then(function(resources) {
			t.true(Array.isArray(resources), "Found resources are returned as an array");
			t.true(resources.length === 0, "No resources found");
			t.true(abstractReader.byGlob.calledWithExactly("anyPattern", {someOption: true}),
				"Delegated globbing task correctly to readers");
		});
});

test("DuplexCollection: _byGlobSource with default options and a reader finding a resource", (t) => {
	t.plan(3);

	const resource = new Resource({
		path: "my/path",
		buffer: Buffer.from("content")
	});
	const abstractReader = {
		byGlob: sinon.stub().returns(Promise.resolve([resource]))
	};
	const abstractWriter = {
		byPath: sinon.stub().returns(Promise.resolve())
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReader,
		writer: abstractWriter
	});

	return duplexCollection.byGlobSource("anyPattern")
		.then(function(resources) {
			t.true(Array.isArray(resources), "Found resources are returned as an array");
			t.true(abstractReader.byGlob.calledWithExactly("anyPattern", {nodir: true}),
				"Delegated globbing task correctly to readers");
			t.true(abstractWriter.byPath.calledWithExactly("my/path"),
				"byPath called on writer");
		});
});

test("DuplexCollection: _byPath with reader finding a resource", (t) => {
	t.plan(4);

	const resource = new Resource({
		path: "path",
		buffer: Buffer.from("content")
	});
	const pushCollectionSpy = sinon.spy(resource, "pushCollection");
	const abstractReader = {
		_byPath: sinon.stub().returns(Promise.resolve(resource))
	};
	const trace = {
		collection: sinon.spy()
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReader,
		writer: abstractReader
	});
	const comboSpy = sinon.spy(duplexCollection._combo, "_byPath");

	return duplexCollection._byPath("anyVirtualPath", {someOption: true}, trace)
		.then(function(resource) {
			t.true(comboSpy.calledWithExactly("anyVirtualPath", {someOption: true}, trace),
				"Delegated globbing task correctly to readers");
			t.true(pushCollectionSpy.called, "pushCollection called on resource");
			t.deepEqual(resource.getPath(), "path", "Resource has expected path");
			return resource.getString().then(function(content) {
				t.deepEqual(content, "content", "Resource has expected content");
			});
		});
});

test("DuplexCollection: _byPath with two readers both finding no resource", (t) => {
	t.plan(3);

	const abstractReaderOne = {
		_byPath: sinon.stub().returns(Promise.resolve())
	};
	const abstractReaderTwo = {
		_byPath: sinon.stub().returns(Promise.resolve())
	};
	const trace = {
		collection: sinon.stub()
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReaderOne,
		writer: abstractReaderTwo
	});

	return duplexCollection._byPath("anyVirtualPath", {someOption: true}, trace)
		.then(function(resource) {
			t.true(abstractReaderOne._byPath.calledWithExactly("anyVirtualPath", {someOption: true}, trace),
				"Delegated globbing task correctly to reader one");
			t.true(abstractReaderTwo._byPath.calledWithExactly("anyVirtualPath", {someOption: true}, trace),
				"Delegated globbing task correctly to reader two");
			t.falsy(resource, "No resource found");
		});
});

test("DuplexCollection: _write successful", (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "my/path",
		buffer: Buffer.from("content")
	});
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		writer: {
			write: sinon.stub().returns(Promise.resolve())
		}
	});

	return duplexCollection._write(resource)
		.then(function(resource) {
			t.pass("write on writer called");
		});
});
