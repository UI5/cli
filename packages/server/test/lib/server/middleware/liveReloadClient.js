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
const clientScriptTemplate = readFileSync(CLIENT_SCRIPT_FILE, "utf8");

const TEST_TOKEN = "test-tkn-12";

function renderScript(token = TEST_TOKEN) {
	return clientScriptTemplate
		.replace("__UI5_LR_WS_PATH__", WS_PATH)
		.replace("__UI5_LR_WS_TOKEN__", token);
}

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

test("INJECT_SCRIPT_TAG points to client.js path (no token in HTML)", (t) => {
	t.is(INJECT_SCRIPT_TAG, `<script src="${CLIENT_SCRIPT_PATH}" async></script>\n`);
	t.notRegex(INJECT_SCRIPT_TAG, /token/i, "tag must not carry token");
});

test("Client script template: contains placeholders for WS_PATH and WS_TOKEN", (t) => {
	t.regex(clientScriptTemplate, /__UI5_LR_WS_PATH__/);
	t.regex(clientScriptTemplate, /__UI5_LR_WS_TOKEN__/);
});

test("Client script: hard-coded PING_INTERVAL_MS is 30000", (t) => {
	t.regex(clientScriptTemplate, /PING_INTERVAL_MS\s*=\s*30000/);
});

test("Client script: hard-coded RECONNECT_INTERVAL_MS is 1000", (t) => {
	t.regex(clientScriptTemplate, /RECONNECT_INTERVAL_MS\s*=\s*1000/);
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

test("active=true requires a token", async (t) => {
	await t.throwsAsync(createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true
	}), {message: /token is required/});
});

test("client.js: serves substituted WebSocket client script", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true,
		token: TEST_TOKEN
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
	t.is(body, renderScript(TEST_TOKEN), "Served body should be the substituted template");
	t.notRegex(body, /__UI5_LR_WS_PATH__/, "no leftover path placeholder");
	t.notRegex(body, /__UI5_LR_WS_TOKEN__/, "no leftover token placeholder");
	t.regex(body, new RegExp(`WS_PATH\\s*=\\s*"${WS_PATH}"`));
	t.regex(body, new RegExp(`WS_TOKEN\\s*=\\s*"${TEST_TOKEN}"`));
	t.regex(body, /new WebSocket\(/);
	t.regex(body, /location\.reload\(\)/);
	t.regex(body, /visibilitychange/);
	t.regex(body, /visibilityState/);
	t.regex(body, /beforeunload/);
});

test("client.js: returns 304 Not Modified when client cache is fresh", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true,
		token: TEST_TOKEN
	});
	const clientEtag = etag(renderScript(TEST_TOKEN));
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

test("Different tokens produce different ETags (no stale-token caching)", async (t) => {
	const m1 = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true,
		token: "tokenA-aaaa"
	});
	const m2 = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true,
		token: "tokenB-bbbb"
	});
	const next = sinon.stub();

	const res1 = createRes();
	m1(createReq({url: "/.ui5/liveReload/client.js"}), res1, next);
	const etag1 = res1.setHeader.getCalls().find((c) => c.args[0] === "ETag").args[1];

	const res2 = createRes();
	m2(createReq({url: "/.ui5/liveReload/client.js"}), res2, next);
	const etag2 = res2.setHeader.getCalls().find((c) => c.args[0] === "ETag").args[1];

	t.not(etag1, etag2, "etag changes with token");
});

test("Non-GET requests pass through to next", async (t) => {
	const middleware = await createLiveReloadClient({
		middlewareUtil: createMiddlewareUtil(),
		active: true,
		token: TEST_TOKEN
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
		active: true,
		token: TEST_TOKEN
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
		active: true,
		token: TEST_TOKEN
	});
	const res = createRes();
	const next = sinon.stub();

	middleware(createReq({url: "/some/other/path"}), res, next);

	t.is(next.callCount, 1);
	t.is(res.setHeader.callCount, 0);
});
