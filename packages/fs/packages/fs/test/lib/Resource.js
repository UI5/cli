const {test} = require("ava");
const Stream = require("stream");
const fs = require("fs");
const path = require("path");
const Resource = require("../../lib/Resource");

function createBasicResource() {
	const fsPath = path.join("test", "fixtures", "application.a", "webapp", "index.html");
	const resource = new Resource({
		path: "/app/index.html",
		createStream: function() {
			return fs.createReadStream(fsPath);
		},
		project: {},
		statInfo: {},
		fsPath
	});
	return resource;
}

test("Resource: constructor with missing path parameter", (t) => {
	const error = t.throws(() => {
		new Resource({});
	}, Error);

	t.is(error.message, "Cannot create Resource: path parameter missing", "No path provided");
});

test("Resource: constructor with duplicated content parameter", (t) => {
	const error = t.throws(() => {
		new Resource({
			path: "my/path",
			buffer: Buffer.from("Content"),
			string: "Content"
		});
	}, Error);

	t.is(error.message, "Cannot create Resource: Please set only one content parameter. " +
		"Buffer, string, stream or createStream", "Duplicated content parameter");
});

test("Resource: getBuffer with throwing an error", (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "my/path/to/resource",
	});

	return resource.getBuffer().catch(function(error) {
		t.is(error.message, "Resource my/path/to/resource has no content",
			"getBuffer called w/o having a resource content provided");
	});
});

test("Resource: getStream", async (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	return new Promise(function(resolve, reject) {
		let streamedResult = "";
		const readableStream = resource.getStream();
		readableStream.on("data", (chunk) => {
			streamedResult += chunk;
		});
		readableStream.on("end", () => {
			resolve(streamedResult);
		});
	}).then((result) => {
		t.is(result, "Content", "Stream has been read correctly");
	});
});

test("Resource: getStream throwing an error", (t) => {
	const resource = new Resource({
		path: "my/path/to/resource"
	});

	const error = t.throws(() => {
		resource.getStream();
	}, Error);

	t.is(error.message, "Resource my/path/to/resource has no content");
});

test("Resource: setString", (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "my/path/to/resource",
	});

	resource.setString("Content");

	return resource.getString().then(function(value) {
		t.is(value, "Content", "String set");
	});
});

test("Resource: setStream", (t) => {
	t.plan(1);

	const resource = new Resource({
		path: "my/path/to/resource",
	});
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("I am a ");
	stream.push("readable ");
	stream.push("stream!");
	stream.push(null);

	resource.setStream(stream);

	return resource.getString().then(function(value) {
		t.is(value, "I am a readable stream!", "Stream set correctly");
	});
});

test("Resource: clone resource with buffer", (t) => {
	t.plan(2);

	const resource = new Resource({
		path: "my/path/to/resource",
		buffer: Buffer.from("Content")
	});

	return resource.clone().then(function(clonedResource) {
		t.pass("Resource cloned");
		return clonedResource.getString().then(function(value) {
			t.is(value, "Content", "Cloned resource has correct content string");
		});
	});
});

test("Resource: clone resource with stream", (t) => {
	t.plan(2);

	const resource = new Resource({
		path: "my/path/to/resource"
	});
	const stream = new Stream.Readable();
	stream._read = function() {};
	stream.push("Content");
	stream.push(null);

	resource.setStream(stream);

	return resource.clone().then(function(clonedResource) {
		t.pass("Resource cloned");
		return clonedResource.getString().then(function(value) {
			t.is(value, "Content", "Cloned resource has correct content string");
		});
	});
});

test("getStream with createStream callback content: Subsequent content requests should throw error due " +
		"to drained content", async (t) => {
	const resource = createBasicResource();
	resource.getStream();
	t.throws(() => {
		resource.getStream();
	}, /Content of Resource \/app\/index.html has been drained/);
	await t.throws(resource.getBuffer(), /Content of Resource \/app\/index.html has been drained/);
	await t.throws(resource.getString(), /Content of Resource \/app\/index.html has been drained/);
});

test("getStream with Buffer content: Subsequent content requests should throw error due to drained " +
		"content", async (t) => {
	const resource = createBasicResource();
	await resource.getBuffer();
	resource.getStream();
	t.throws(() => {
		resource.getStream();
	}, /Content of Resource \/app\/index.html has been drained/);
	await t.throws(resource.getBuffer(), /Content of Resource \/app\/index.html has been drained/);
	await t.throws(resource.getString(), /Content of Resource \/app\/index.html has been drained/);
});

test("getStream with Stream content: Subsequent content requests should throw error due to drained " +
		"content", async (t) => {
	const resource = createBasicResource();
	const {Transform} = require("stream");
	const tStream = new Transform({
		transform(chunk, encoding, callback) {
			this.push(chunk.toString());
			callback();
		}
	});
	const stream = resource.getStream();
	stream.pipe(tStream);
	resource.setStream(tStream);

	resource.getStream();
	t.throws(() => {
		resource.getStream();
	}, /Content of Resource \/app\/index.html has been drained/);
	await t.throws(resource.getBuffer(), /Content of Resource \/app\/index.html has been drained/);
	await t.throws(resource.getString(), /Content of Resource \/app\/index.html has been drained/);
});
