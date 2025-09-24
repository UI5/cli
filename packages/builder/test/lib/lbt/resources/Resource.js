import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.serial("Resource: buffer", async (t) => {
	const readFileStub = sinon.stub().callsArgWith(1, null, Buffer.from("content"));

	const Resource = await esmock("../../../../lib/lbt/resources/Resource.js", {
		"graceful-fs": {
			readFile: readFileStub,
		},
	});

	const resource = new Resource({}, "name", "file");
	const res = await resource.buffer();

	t.is(readFileStub.callCount, 1, "called once");
	t.is(readFileStub.getCall(0).args[0], "file", "called with file parameter");
	t.is(res.toString(), "content", "File content returned correctly");
});

test.serial("Resource: string", async (t) => {
	const readFileStub = sinon.stub().callsArgWith(1, null, Buffer.from("content"));
	const Resource = await esmock("../../../../lib/lbt/resources/Resource.js", {
		"graceful-fs": {
			readFile: readFileStub,
		},
	});

	const resource = new Resource({}, "name", "file");
	const res = await resource.string();

	t.is(readFileStub.callCount, 1, "called once");
	t.is(readFileStub.getCall(0).args[0], "file", "called with file parameter");
	t.is(res, "content", "File content returned correctly");
});

test.serial("Resource: constructor", async (t) => {
	const Resource = await esmock("../../../../lib/lbt/resources/Resource.js"); // Import unmocked
	const resource = new Resource({}, "name", "file");
	t.is(resource.fileSize, -1, "called once");
});

test.serial("Resource: constructor with stat", async (t) => {
	const Resource = await esmock("../../../../lib/lbt/resources/Resource.js"); // Import unmocked
	const resource = new Resource({}, "name", "file", {size: 47});
	t.is(resource.fileSize, 47, "called once");
});
