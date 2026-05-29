import test from "ava";
import sinon from "sinon";
import etag from "etag";
import serveResourcesMiddleware from "../../../../lib/middleware/serveResources.js";
import MiddlewareUtil from "../../../../lib/middleware/MiddlewareUtil.js";

test.afterEach.always(() => {
	sinon.restore();
});

function createMockResource({path = "/foo.js", buffer = Buffer.from("content"), integrity = "sha256-abc123"} = {}) {
	return {
		getPath: sinon.stub().returns(path),
		getBuffer: sinon.stub().resolves(buffer),
		getIntegrity: sinon.stub().resolves(integrity),
	};
}

function createMockResponse() {
	return {
		getHeader: sinon.stub().returns(undefined),
		setHeader: sinon.stub(),
		send: sinon.stub(),
		end: sinon.stub(),
		statusCode: 200,
	};
}

test.serial("Serves resource with correct Content-Type and ETag", async (t) => {
	const buffer = Buffer.from("hello world");
	const resource = createMockResource({path: "/app/index.html", buffer, integrity: "sha256-xyz"});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/app/index.html", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(next.callCount, 0);
	t.is(res.setHeader.getCall(0).args[0], "Content-Type");
	t.regex(res.setHeader.getCall(0).args[1], /html/);
	t.is(res.setHeader.getCall(1).args[0], "ETag");
	t.is(res.setHeader.getCall(1).args[1], etag("sha256-xyz"));
	t.is(res.send.callCount, 1);
	t.is(res.send.getCall(0).args[0], buffer);
});

test.serial("Calls next() when resource is not found", async (t) => {
	const resources = {all: {byPath: sinon.stub().resolves(null)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/not-found.js", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(next.callCount, 1);
	t.is(next.getCall(0).args.length, 0);
	t.is(res.send.callCount, 0);
});

test.serial("Returns 304 Not Modified when client cache is fresh", async (t) => {
	const integrity = "sha256-fresh";
	const etagValue = etag(integrity);
	const resource = createMockResource({integrity});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/foo.js", headers: {"if-none-match": etagValue}};
	const res = createMockResponse();
	res.getHeader.withArgs("ETag").returns(etagValue);
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(res.statusCode, 304);
	t.is(res.end.callCount, 1);
	t.is(res.send.callCount, 0);
	t.is(next.callCount, 0);
});

test.serial("Passes errors to next()", async (t) => {
	const error = new Error("read failure");
	const resources = {all: {byPath: sinon.stub().rejects(error)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/foo.js", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(next.callCount, 1);
	t.is(next.getCall(0).args[0], error);
});

test.serial("Does not override existing Content-Type header", async (t) => {
	const resource = createMockResource({path: "/data.json"});
	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/data.json", headers: {}};
	const res = createMockResponse();
	res.getHeader.withArgs("Content-Type").returns("application/xml");
	const next = sinon.stub();

	await middleware(req, res, next);

	const contentTypeSetCalls = res.setHeader.getCalls().filter((c) => c.args[0] === "Content-Type");
	t.is(contentTypeSetCalls.length, 0);
	t.is(res.send.callCount, 1);
});

test.serial("Uses resource integrity for ETag generation", async (t) => {
	const integrity = "sha512-uniqueHash";
	const resource = createMockResource({integrity});
	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/foo.js", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	const etagCall = res.setHeader.getCalls().find((c) => c.args[0] === "ETag");
	t.truthy(etagCall);
	t.is(etagCall.args[1], etag("sha512-uniqueHash"));
});
