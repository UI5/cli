import test from "ava";
import sinon from "sinon";
import DuplexCollection from "../../lib/DuplexCollection.js";
import ReaderCollectionPrioritized from "../../lib/ReaderCollectionPrioritized.js";
import Resource from "../../lib/Resource.js";

test("DuplexCollection: constructor", (t) => {
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: {},
		writer: {}
	});

	t.deepEqual(duplexCollection._reader, {}, "reader assigned");
	t.deepEqual(duplexCollection._writer, {}, "writer assigned");
	t.true(duplexCollection._combo instanceof ReaderCollectionPrioritized, "prioritized reader collection created");
	t.is(duplexCollection._combo.getName(), "myCollection - ReaderCollectionPrioritized", "name assigned");
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
	t.is(duplexCollection._combo.getName(), " - ReaderCollectionPrioritized", "name assigned");
	t.deepEqual(duplexCollection._combo._readers, [{}, {}], "reader and writer assigned to readers");
});

test("DuplexCollection: _byGlob w/o finding a resource", async (t) => {
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

	const resources = await duplexCollection._byGlob("anyPattern", {someOption: true}, trace);

	t.true(Array.isArray(resources), "Found resources are returned as an array");
	t.true(resources.length === 0, "No resources found");
	t.true(comboSpy.calledWithExactly("anyPattern", {someOption: true}, trace),
		"Delegated globbing task correctly to readers");
});

test("DuplexCollection: _byGlob", async (t) => {
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
	const resources = await duplexCollection._byGlob("anyPattern", {someOption: true}, trace);
	const resourceContent = await resource.getString();

	t.true(Array.isArray(resources), "Found resources are returned as an array");
	t.true(resources.length === 1, "Resource found");
	t.is(resource.getPath(), "my/path", "Resource has expected path");
	t.true(comboSpy.calledWithExactly("anyPattern", {someOption: true}, trace),
		"Delegated globbing task correctly to readers");
	t.is(resourceContent, "content", "Resource has expected content");
});

test("DuplexCollection: _byGlobSource w/o found resources", async (t) => {
	t.plan(3);

	const abstractReader = {
		byGlob: sinon.stub().returns(Promise.resolve([]))
	};
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: abstractReader,
		writer: abstractReader
	});
	const resources = await duplexCollection.byGlobSource("anyPattern", {someOption: true});

	t.true(Array.isArray(resources), "Found resources are returned as an array");
	t.true(resources.length === 0, "No resources found");
	t.true(abstractReader.byGlob.calledWithExactly("anyPattern", {someOption: true}),
		"Delegated globbing task correctly to readers");
});

test("DuplexCollection: _byGlobSource with default options and a reader finding a resource", async (t) => {
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
	const resources = await duplexCollection.byGlobSource("anyPattern");

	t.true(Array.isArray(resources), "Found resources are returned as an array");
	t.true(abstractReader.byGlob.calledWithExactly("anyPattern", {nodir: true}),
		"Delegated globbing task correctly to readers");
	t.true(abstractWriter.byPath.calledWithExactly("my/path"),
		"byPath called on writer");
});

test("DuplexCollection: _byPath with reader finding a resource", async (t) => {
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
	const readResource = await duplexCollection._byPath("anyVirtualPath", {someOption: true}, trace);
	const readResourceContent = await readResource.getString();

	t.true(comboSpy.calledWithExactly("anyVirtualPath", {someOption: true}, trace),
		"Delegated globbing task correctly to readers");
	t.true(pushCollectionSpy.called, "pushCollection called on resource");
	t.is(readResource.getPath(), "path", "Resource has expected path");
	t.is(readResourceContent, "content", "Resource has expected content");
});

test("DuplexCollection: _byPath with two readers both finding no resource", async (t) => {
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
	const readResource = await duplexCollection._byPath("anyVirtualPath", {someOption: true}, trace);

	t.true(abstractReaderOne._byPath.calledWithExactly("anyVirtualPath", {someOption: true}, trace),
		"Delegated globbing task correctly to reader one");
	t.true(abstractReaderTwo._byPath.calledWithExactly("anyVirtualPath", {someOption: true}, trace),
		"Delegated globbing task correctly to reader two");
	t.falsy(readResource, "No resource found");
});

test("DuplexCollection: _write successful", async (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "my/path",
		buffer: Buffer.from("content")
	});
	const duplexCollection = new DuplexCollection({
		name: "myCollection",
		reader: {},
		writer: {
			write: sinon.stub().returns(Promise.resolve())
		}
	});
	await duplexCollection._write(resource);

	t.pass("write on writer called");
});

test("DuplexCollection: Throws for empty reader", (t) => {
	t.throws(() => {
		new DuplexCollection({
			name: "myReader",
			writer: {}
		});
	}, {
		message: "Cannot create DuplexCollection myReader: No reader provided"
	});
});

test("DuplexCollection: Throws for empty writer", (t) => {
	t.throws(() => {
		new DuplexCollection({
			name: "myReader",
			reader: {}
		});
	}, {
		message: "Cannot create DuplexCollection myReader: No writer provided"
	});
});
