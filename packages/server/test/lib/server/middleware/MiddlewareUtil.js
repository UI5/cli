const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const MiddlewareUtil = require("../../../../lib/middleware/MiddlewareUtil");

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("getPathname", async (t) => {
	const middlewareUtil = new MiddlewareUtil();
	const parseurlStub = sinon.stub().returns({pathname: "path%20name"});
	mock("parseurl", parseurlStub);
	const pathname = middlewareUtil.getPathname("req");

	t.is(parseurlStub.callCount, 1, "parseurl got called once");
	t.is(parseurlStub.getCall(0).args[0], "req", "parseurl got called with correct argument");
	t.is(pathname, "path name", "Correct pathname returned");
});

test.serial("getMimeInfo", async (t) => {
	const middlewareUtil = new MiddlewareUtil();
	const mime = require("mime-types");
	const lookupStub = sinon.stub(mime, "lookup").returns("mytype");
	const charsetStub = sinon.stub(mime, "charset").returns("mycharset");

	const mimeInfo = middlewareUtil.getMimeInfo("resourcePath");

	t.is(lookupStub.callCount, 1, "mime.lookup got called once");
	t.is(lookupStub.getCall(0).args[0], "resourcePath", "mime.lookup got called with correct argument");
	t.is(charsetStub.callCount, 1, "mime.charset got called once");
	t.is(charsetStub.getCall(0).args[0], "mytype", "mime.charset got called with correct argument");
	t.deepEqual(mimeInfo, {
		type: "mytype",
		charset: "mycharset",
		contentType: "mytype; charset=mycharset"
	}, "Correct pathname returned");
});

test.serial("getMimeInfo: unknown type", async (t) => {
	const middlewareUtil = new MiddlewareUtil();
	const mime = require("mime-types");
	const lookupStub = sinon.stub(mime, "lookup");
	const charsetStub = sinon.stub(mime, "charset");

	const mimeInfo = middlewareUtil.getMimeInfo("resourcePath");

	t.is(lookupStub.callCount, 1, "mime.lookup got called once");
	t.is(lookupStub.getCall(0).args[0], "resourcePath", "mime.lookup got called with correct argument");
	t.is(charsetStub.callCount, 1, "mime.charset got called once");
	t.is(charsetStub.getCall(0).args[0], "application/octet-stream", "mime.charset got called with correct argument");
	t.deepEqual(mimeInfo, {
		type: "application/octet-stream",
		charset: undefined,
		contentType: "application/octet-stream"
	}, "Correct pathname returned");
});

test("getInterface: specVersion 1.0", async (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("1.0");

	t.is(interfacedMiddlewareUtil, undefined, "no interface provided");
});

test("getInterface: specVersion 2.0", async (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.0");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion undefined", async (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const err = t.throws(() => {
		middlewareUtil.getInterface();
	});

	t.is(err.message, "MiddlewareUtil: Unknown or unsupported specification version undefined",
		"Throw with correct error message");
});

test("getInterface: specVersion unknown", async (t) => {
	const middlewareUtil = new MiddlewareUtil();
	const err = t.throws(() => {
		middlewareUtil.getInterface("1.5");
	});

	t.is(err.message, "MiddlewareUtil: Unknown or unsupported specification version 1.5",
		"Throw with correct error message");
});
