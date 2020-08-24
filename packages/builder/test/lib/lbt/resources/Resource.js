const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

let Resource = require("../../../../lib/lbt/resources/Resource");

test.serial("Resource: buffer", async (t) => {
	const readFileStub = sinon.stub().callsArg(1);
	mock("graceful-fs", {
		readFile: readFileStub
	});
	mock.reRequire("graceful-fs");

	// Re-require tested module
	Resource = mock.reRequire("../../../../lib/lbt/resources/Resource");
	const resource = new Resource({}, "name", "file");
	await resource.buffer();

	mock.stop("graceful-fs");

	t.is(readFileStub.callCount, 1, "called once");
	t.is(readFileStub.getCall(0).args[0], "file", "called with file parameter");
});

test.serial("Resource: constructor", async (t) => {
	const resource = new Resource({}, "name", "file");
	t.is(resource.fileSize, -1, "called once");
});

test.serial("Resource: constructor with stat", async (t) => {
	const resource = new Resource({}, "name", "file", {size: 47});
	t.is(resource.fileSize, 47, "called once");
});
