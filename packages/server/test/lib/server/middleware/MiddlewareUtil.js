import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import mime from "mime-types";
import MiddlewareUtil from "../../../../lib/middleware/MiddlewareUtil.js";

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("getPathname", async (t) => {
	const parseurlStub = sinon.stub().returns({pathname: "path%20name"});
	const MiddlewareUtil = await esmock("../../../../lib/middleware/MiddlewareUtil.js", {
		parseurl: parseurlStub
	});
	const middlewareUtil = new MiddlewareUtil();
	const pathname = middlewareUtil.getPathname("req");

	t.is(parseurlStub.callCount, 1, "parseurl got called once");
	t.is(parseurlStub.getCall(0).args[0], "req", "parseurl got called with correct argument");
	t.is(pathname, "path name", "Correct pathname returned");
});

test.serial("getMimeInfo", (t) => {
	const middlewareUtil = new MiddlewareUtil();
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

test.serial("getMimeInfo: unknown type", (t) => {
	const middlewareUtil = new MiddlewareUtil();
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

test("getInterface: specVersion 1.0", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("1.0");

	t.is(interfacedMiddlewareUtil, undefined, "no interface provided");
});

test("getInterface: specVersion 2.0", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.0");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.1", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.1");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.2", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.2");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.3", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.3");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.4", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.4");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.5", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.5");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion 2.6", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const interfacedMiddlewareUtil = middlewareUtil.getInterface("2.6");

	t.deepEqual(Object.keys(interfacedMiddlewareUtil), [
		"getPathname",
		"getMimeInfo"
	], "Correct methods are provided");

	t.is(typeof interfacedMiddlewareUtil.getPathname, "function", "function getPathname is provided");
	t.is(typeof interfacedMiddlewareUtil.getMimeInfo, "function", "function getMimeInfo is provided");
});

test("getInterface: specVersion undefined", (t) => {
	const middlewareUtil = new MiddlewareUtil();

	const err = t.throws(() => {
		middlewareUtil.getInterface();
	});

	t.is(err.message, "MiddlewareUtil: Unknown or unsupported Specification Version undefined",
		"Throw with correct error message");
});

test("getInterface: specVersion unknown", (t) => {
	const middlewareUtil = new MiddlewareUtil();
	const err = t.throws(() => {
		middlewareUtil.getInterface("1.5");
	});

	t.is(err.message, "MiddlewareUtil: Unknown or unsupported Specification Version 1.5",
		"Throw with correct error message");
});
