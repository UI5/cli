import test from "ava";
import createErrorHandler from "../../../../lib/middleware/errorHandler.js";
import {INJECT_SCRIPT_TAG, CLIENT_SCRIPT_PATH} from "../../../../lib/liveReload/constants.js";

function mockRes() {
	const state = {
		statusCode: null,
		contentType: null,
		body: null,
		headersSent: false,
	};
	return {
		state,
		get headersSent() {
			return state.headersSent;
		},
		get statusCode() {
			return state.statusCode;
		},
		set statusCode(code) {
			state.statusCode = code;
		},
		setHeader(name, value) {
			if (name.toLowerCase() === "content-type") {
				state.contentType = value;
			}
		},
		end(body) {
			state.body = body;
		},
	};
}

// Minimal request with only the headers the error handler inspects (accept and
// sec-fetch-dest). Header names must be lower-case, matching Node's http parser.
function mockReq(headers = {}) {
	const normalized = {};
	for (const [k, v] of Object.entries(headers)) {
		normalized[k.toLowerCase()] = v;
	}
	return {headers: normalized};
}

test("Non-navigation request: plain-text stack response", (t) => {
	const handler = createErrorHandler();
	const err = new Error("boom");
	const res = mockRes();
	let nextCalled = false;

	handler(err, mockReq({accept: "application/json"}), res, () => {
		nextCalled = true;
	});

	t.is(res.state.statusCode, 500);
	t.is(res.state.contentType, "text/plain; charset=utf-8");
	t.is(res.state.body, err.stack, "Body contains the error stack");
	t.false(nextCalled, "next is not called on the normal path");
});

test("Falls back to the error message when no stack is present", (t) => {
	const handler = createErrorHandler();
	const err = {message: "just a message"};
	const res = mockRes();

	handler(err, mockReq({accept: "application/json"}), res, () => t.fail("next should not be called"));

	t.is(res.state.statusCode, 500);
	t.is(res.state.body, "just a message");
});

test("Falls back to String(err) when the error carries neither stack nor message", (t) => {
	const handler = createErrorHandler();
	const res = mockRes();

	handler("bare string", mockReq({accept: "application/json"}), res, () => t.fail("next should not be called"));

	t.is(res.state.statusCode, 500);
	t.is(res.state.body, "bare string");
});

test("Delegates to next(err) when headers were already sent", (t) => {
	const handler = createErrorHandler();
	const err = new Error("late failure");
	const res = mockRes();
	res.state.headersSent = true;
	let nextArg;

	handler(err, mockReq({accept: "text/html"}), res, (arg) => {
		nextArg = arg;
	});

	t.is(nextArg, err, "The error is forwarded to Express's default handler");
	t.is(res.state.statusCode, null, "Response state is left untouched once headers are out");
});

test("Sec-Fetch-Dest: document with live reload active — HTML page with script tag", (t) => {
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("build broke");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "document",
		"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
	}), res, () => t.fail("next"));

	t.is(res.state.statusCode, 500);
	t.is(res.state.contentType, "text/html; charset=utf-8");
	t.true(res.state.body.includes(INJECT_SCRIPT_TAG),
		"Body embeds the exact live-reload script tag");
	t.true(res.state.body.includes(CLIENT_SCRIPT_PATH),
		"Body references the live-reload client path");
	t.true(res.state.body.includes("build broke"), "Body contains the error message");
	t.true(res.state.body.includes("reload automatically"),
		"Body contains the auto-reload hint");
});

test("Sec-Fetch-Dest: document with live reload inactive — HTML page without script tag", (t) => {
	const handler = createErrorHandler({liveReload: {active: false, token: null}});
	const err = new Error("build broke");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "document",
		"accept": "text/html"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/html; charset=utf-8");
	t.false(res.state.body.includes(CLIENT_SCRIPT_PATH),
		"Body does not reference the live-reload client");
	t.false(res.state.body.includes("reload automatically"),
		"Body does not promise auto-reload");
	t.true(res.state.body.includes("build broke"), "Body contains the error message");
});

test("Sec-Fetch-Dest: document with no options passed — HTML page without script tag", (t) => {
	const handler = createErrorHandler();
	const err = new Error("build broke");
	const res = mockRes();

	handler(err, mockReq({"sec-fetch-dest": "document"}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/html; charset=utf-8");
	t.false(res.state.body.includes(CLIENT_SCRIPT_PATH));
});

test("HTML request escapes error content containing HTML metacharacters", (t) => {
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("Unexpected token <script>alert('xss')</script>");
	const res = mockRes();

	handler(err, mockReq({"sec-fetch-dest": "document"}), res, () => t.fail("next"));

	t.false(res.state.body.includes("<script>alert"),
		"Raw <script> from the error is not present in the DOM");
	t.true(res.state.body.includes("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"),
		"Angle brackets and quotes in the error are HTML-escaped");
	// The legitimate live-reload script tag is still present.
	t.true(res.state.body.includes(INJECT_SCRIPT_TAG));
});

test("Sec-Fetch-Dest: script — plain-text response even with live reload active", (t) => {
	// This is the critical case: browsers send Accept: */* AND
	// Sec-Fetch-Dest: script for <script src> requests. An HTML response here
	// would either execute as JS (garbage) or be silently discarded — either way
	// the app breaks in a way the developer wouldn't expect from an error page.
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "script",
		"accept": "*/*"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
	t.is(res.state.body, err.stack);
});

test("Sec-Fetch-Dest: style — plain-text response", (t) => {
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "style",
		"accept": "text/css,*/*;q=0.1"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
});

test("Sec-Fetch-Dest: image — plain-text response", (t) => {
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "image",
		"accept": "image/avif,image/webp,image/*,*/*;q=0.8"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
});

test("Sec-Fetch-Dest: empty (fetch/XHR) — plain-text response", (t) => {
	// fetch() and XMLHttpRequest send Sec-Fetch-Dest: empty by default. These
	// callers usually expect JSON or the raw resource; an HTML page would trip up
	// their JSON.parse or their response handling.
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "empty",
		"accept": "*/*"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
});

test("Non-navigation request with Accept: */* — plain-text response", (t) => {
	// Older browsers or non-browser clients that don't send Sec-Fetch-Dest and
	// use bare */* fall through to the plain-text path — we can't distinguish
	// them from a navigation, so we err on the side of not sending HTML.
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({accept: "*/*"}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
});

test("Accept: text/html without Sec-Fetch-Dest — HTML response", (t) => {
	// Clients that don't send Sec-Fetch-Dest but do send Accept: text/html
	// (older browsers, some curl invocations) are treated as navigations.
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({
		accept: "text/html,application/xhtml+xml,application/xml;q=0.9"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/html; charset=utf-8");
});

test("Sec-Fetch-Dest wins over Accept: text/html", (t) => {
	// Defensive: if an old prefetch mechanism ever sent Accept: text/html for a
	// subresource, Sec-Fetch-Dest still tells us the destination isn't a document.
	const handler = createErrorHandler({liveReload: {active: true, token: "abc"}});
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({
		"sec-fetch-dest": "empty",
		"accept": "text/html,*/*"
	}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
});

test("Request with no Accept header and no Sec-Fetch-Dest — plain-text response", (t) => {
	const handler = createErrorHandler();
	const err = new Error("boom");
	const res = mockRes();

	handler(err, mockReq({}), res, () => t.fail("next"));

	t.is(res.state.contentType, "text/plain; charset=utf-8");
});
