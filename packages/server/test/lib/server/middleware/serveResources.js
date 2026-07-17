import test from "ava";
import sinon from "sinon";
import etag from "etag";
import esmock from "esmock";
import serveResourcesMiddleware from "../../../../lib/middleware/serveResources.js";
import {INJECT_SCRIPT_TAG} from "../../../../lib/liveReload/constants.js";
import MiddlewareUtil from "../../../../lib/middleware/MiddlewareUtil.js";

test.afterEach.always(() => {
	sinon.restore();
});

function createMockResource({path = "/foo.js", buffer = Buffer.from("content"), integrity = "sha256-abc123"} = {}) {
	return {
		getPath: sinon.stub().returns(path),
		getBuffer: sinon.stub().resolves(buffer),
		getString: sinon.stub().resolves(buffer.toString()),
		getIntegrity: sinon.stub().resolves(integrity),
	};
}

function createMockResponse({headers = {}} = {}) {
	return {
		getHeader: sinon.stub().callsFake((name) => headers[name]),
		setHeader: sinon.stub().callsFake((name, value) => {
			headers[name] = value;
		}),
		end: sinon.stub(),
		statusCode: 200,
	};
}

test.serial("Serves resource with correct Content-Type and ETag", async (t) => {
	const buffer = Buffer.from("hello world");
	const resource = createMockResource({path: "/app/script.js", buffer, integrity: "sha256-xyz"});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources
	});

	const req = {url: "/app/script.js", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(next.callCount, 0);
	t.is(res.setHeader.getCall(0).args[0], "Content-Type");
	t.regex(res.setHeader.getCall(0).args[1], /javascript/);
	t.is(res.setHeader.getCall(1).args[0], "ETag");
	t.is(res.setHeader.getCall(1).args[1], etag("sha256-xyz"));
	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args[0], buffer);
	const contentLengthCall = res.setHeader.getCalls().find((c) => c.args[0] === "Content-Length");
	t.is(contentLengthCall.args[1], buffer.length);
});

test.serial("Injects liveReload tag into HTML right after <head>", async (t) => {
	const html = "<html><head><title>x</title></head><body><p>hi</p></body></html>";
	const buffer = Buffer.from(html);
	const integrity = "sha256-xyz";
	const resource = createMockResource({path: "/app/index.html", buffer, integrity});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources,
		injectLiveReloadClient: true
	});

	const req = {url: "/app/index.html", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	const etagCall = res.setHeader.getCalls().find((c) => c.args[0] === "ETag");
	t.truthy(etagCall);
	t.is(etagCall.args[1], etag(integrity + ":" + INJECT_SCRIPT_TAG));
	t.is(res.end.callCount, 1);
	const expectedBody = html.replace("<head>", "<head>\n" + INJECT_SCRIPT_TAG);
	t.is(res.end.getCall(0).args[0], expectedBody);
	const contentLengthCall = res.setHeader.getCalls().find((c) => c.args[0] === "Content-Length");
	t.is(contentLengthCall.args[1], Buffer.byteLength(expectedBody));
});

test.serial("Injects liveReload tag after <head> with attributes", async (t) => {
	const html = `<html><head lang="en"><title>x</title></head><body></body></html>`;
	const buffer = Buffer.from(html);
	const resource = createMockResource({path: "/index.html", buffer, integrity: "sha256-xyz"});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources,
		injectLiveReloadClient: true
	});

	const req = {url: "/index.html", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args[0], html.replace(`<head lang="en">`, `<head lang="en">\n` + INJECT_SCRIPT_TAG));
});

test.serial("Injects liveReload tag after <html> when <head> is missing", async (t) => {
	const html = "<html><body><p>no head</p></body></html>";
	const buffer = Buffer.from(html);
	const resource = createMockResource({path: "/page.html", buffer, integrity: "sha256-xyz"});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources,
		injectLiveReloadClient: true
	});

	const req = {url: "/page.html", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args[0], html.replace("<html>", "<html>\n" + INJECT_SCRIPT_TAG));
});

test.serial("Prepends liveReload tag to HTML without <head> or <html>", async (t) => {
	const html = "<p>fragment</p>";
	const buffer = Buffer.from(html);
	const resource = createMockResource({path: "/page.html", buffer, integrity: "sha256-xyz"});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources,
		injectLiveReloadClient: true
	});

	const req = {url: "/page.html", headers: {}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args[0], INJECT_SCRIPT_TAG + html);
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
	t.is(res.end.callCount, 0);
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
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(res.statusCode, 304);
	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args.length, 0);
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
	const res = createMockResponse({headers: {"Content-Type": "application/xml"}});
	const next = sinon.stub();

	await middleware(req, res, next);

	const contentTypeSetCalls = res.setHeader.getCalls().filter((c) => c.args[0] === "Content-Type");
	t.is(contentTypeSetCalls.length, 0);
	t.is(res.end.callCount, 1);
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

test.serial("HTML: 304 when ETag matches injected ETag", async (t) => {
	const integrity = "sha256-html-fresh";
	const clientEtag = etag(integrity + ":" + INJECT_SCRIPT_TAG);
	const html = "<html><body></body></html>";
	const resource = createMockResource({path: "/index.html", buffer: Buffer.from(html), integrity});

	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = serveResourcesMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources,
		injectLiveReloadClient: true
	});

	const req = {url: "/index.html", headers: {"if-none-match": clientEtag}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.is(res.statusCode, 304);
	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args.length, 0);
});

test.serial("HTML: 200 when INJECT_SCRIPT_TAG changes invalidates client ETag", async (t) => {
	const integrity = "sha256-stable";
	const newInjectTag = "<script src=\"/.ui5/liveReload/v2/client.js\"></script>\n";
	const html = "<html><body></body></html>";

	const {default: mockedMiddleware} = await esmock("../../../../lib/middleware/serveResources.js", {
		"../../../../lib/liveReload/constants.js": {INJECT_SCRIPT_TAG: newInjectTag}
	});

	const resource = createMockResource({path: "/index.html", buffer: Buffer.from(html), integrity});
	const resources = {all: {byPath: sinon.stub().resolves(resource)}};
	const middleware = mockedMiddleware({
		middlewareUtil: new MiddlewareUtil({graph: "graph", project: "project"}),
		resources,
		injectLiveReloadClient: true
	});

	// Client cached ETag derived from the previous INJECT_SCRIPT_TAG
	const staleClientEtag = etag(integrity + ":" + INJECT_SCRIPT_TAG);
	const expectedServerEtag = etag(integrity + ":" + newInjectTag);

	const req = {url: "/index.html", headers: {"if-none-match": staleClientEtag}};
	const res = createMockResponse();
	const next = sinon.stub();

	await middleware(req, res, next);

	t.not(res.statusCode, 304);
	t.is(res.end.callCount, 1);
	t.true(res.end.getCall(0).args[0].includes(newInjectTag));
	const etagCall = res.setHeader.getCalls().find((c) => c.args[0] === "ETag");
	t.is(etagCall.args[1], expectedServerEtag);
});
