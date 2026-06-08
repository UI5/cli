import test from "ava";
import sinon from "sinon";
import etag from "etag";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import createLiveReloadClient from "../../../../lib/middleware/liveReloadClient.js";
import {
	INJECT_SCRIPT_TAG,
	CLIENT_SCRIPT_PATH,
	WS_PATH,
} from "../../../../lib/liveReload/constants.js";

const CLIENT_SCRIPT_FILE = fileURLToPath(
	new URL("../../../../lib/liveReload/client.js", import.meta.url)
);
const clientScript = readFileSync(CLIENT_SCRIPT_FILE, "utf8");

test.afterEach.always(() => {
	sinon.restore();
});

function createMiddlewareUtil() {
	return {
		getPathname: sinon.stub().callsFake((req) => req.url)
	};
}

function createReq({url = "/", method = "GET", headers = {}} = {}) {
	return {method, url, headers};
}

function createRes() {
	const headers = {};
	return {
		setHeader: sinon.stub().callsFake((name, value) => {
			headers[name] = value;
		}),
		getHeader: sinon.stub().callsFake((name) => headers[name]),
		end: sinon.stub(),
		write: sinon.stub()
	};
}

test("INJECT_SCRIPT_TAG points to client.js path", (t) => {
	t.is(INJECT_SCRIPT_TAG, `<script src="${CLIENT_SCRIPT_PATH}" async></script>\n`);
});

test("Client script: hard-coded WS_PATH matches constants", (t) => {
	t.regex(clientScript, /WS_PATH\s*=\s*"\/\.ui5\/liveReload\/ws"/,
		`Expected client script to contain hard-coded WS_PATH "${WS_PATH}"`
	);
});

test("Client script: hard-coded PING_INTERVAL_MS is 30000", (t) => {
	t.regex(clientScript, /PING_INTERVAL_MS\s*=\s*30000/);
});

test("Client script: hard-coded RECONNECT_INTERVAL_MS is 1000", (t) => {
	t.regex(clientScript, /RECONNECT_INTERVAL_MS\s*=\s*1000/);
});

test("active=false: returns pass-through middleware", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: false
	});
	const next = sinon.stub();
	const res = createRes();

	middleware(createReq({url: "/.ui5/liveReload/client.js"}), res, next);
	middleware(createReq({url: "/anything"}), res, next);

	t.is(next.callCount, 2);
	t.is(res.setHeader.callCount, 0);
});

test("client.js: serves WebSocket client script", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true
	});
	const req = createReq({url: "/.ui5/liveReload/client.js"});
	const res = createRes();
	const next = sinon.stub();

	middleware(req, res, next);

	t.is(next.callCount, 0);
	t.true(res.setHeader.calledWith("Content-Type", "application/javascript"));
	t.true(res.setHeader.calledWith("ETag", sinon.match.string));
	t.is(res.end.callCount, 1);
	const body = res.end.getCall(0).args[0];
	t.is(body, clientScript, "Served body should match the client.js file contents");
	t.regex(body, /new WebSocket\(/);
	t.regex(body, /location\.reload\(\)/);
	// Reconnect logic
	t.regex(body, /visibilitychange/);
	t.regex(body, /visibilityState/);
	t.regex(body, /beforeunload/);
});

test("client.js: returns 304 Not Modified when client cache is fresh", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true
	});
	const clientEtag = etag(clientScript);
	const req = createReq({
		url: "/.ui5/liveReload/client.js",
		headers: {"if-none-match": clientEtag}
	});
	const res = createRes();
	const next = sinon.stub();

	middleware(req, res, next);

	t.is(next.callCount, 0);
	t.is(res.statusCode, 304);
	t.is(res.end.callCount, 1);
	t.is(res.end.getCall(0).args.length, 0, "end() called without a body");
	t.true(res.setHeader.calledWith("ETag", clientEtag));
});

test("Non-GET requests pass through to next", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true
	});
	const res = createRes();
	const next = sinon.stub();

	middleware(createReq({method: "POST", url: "/.ui5/liveReload/client.js"}), res, next);

	t.is(next.callCount, 1);
	t.is(res.setHeader.callCount, 0);
	t.is(res.end.callCount, 0);
});

test("Errors thrown in middleware are propagated to next(err)", async (t) => {
	const middlewareUtil = createMiddlewareUtil();
	const error = new Error("boom");
	middlewareUtil.getPathname = sinon.stub().throws(error);

	const middleware = await createLiveReloadClient({
		middlewareUtil,
		active: true
	});
	const res = createRes();
	const next = sinon.stub();

	middleware(createReq({url: "/.ui5/liveReload/client.js"}), res, next);

	t.is(next.callCount, 1);
	t.is(next.getCall(0).args[0], error);
	t.is(res.setHeader.callCount, 0);
});

test("Unknown path passes through to next", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true
	});
	const res = createRes();
	const next = sinon.stub();

	middleware(createReq({url: "/some/other/path"}), res, next);

	t.is(next.callCount, 1);
	t.is(res.setHeader.callCount, 0);
});
