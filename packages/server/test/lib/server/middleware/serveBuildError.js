import test from "ava";
import createMiddleware from "../../../../lib/middleware/serveBuildError.js";

// Header names must be lower-case, matching Node's http parser.
function mockReq(headers = {}) {
	const normalized = {};
	for (const [k, v] of Object.entries(headers)) {
		normalized[k.toLowerCase()] = v;
	}
	return {headers: normalized};
}

const DOC_NAV = {
	"sec-fetch-dest": "document",
	"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

test("Diverts a document navigation to next(err) while errored", (t) => {
	const err = new Error("build broke");
	const middleware = createMiddleware({getServeError: () => err});
	let nextArg;
	let nextCallCount = 0;

	middleware(mockReq(DOC_NAV), {}, (arg) => {
		nextArg = arg;
		nextCallCount++;
	});

	t.is(nextCallCount, 1, "next was called once");
	t.is(nextArg, err, "The captured server error is forwarded to the error handler");
});

test("Passes a document navigation through when not errored", (t) => {
	const middleware = createMiddleware({getServeError: () => null});
	let nextArg = "unset";

	middleware(mockReq(DOC_NAV), {}, (arg) => {
		nextArg = arg;
	});

	t.is(nextArg, undefined, "next() is called without an error");
});

test("Passes a subresource request through even while errored", (t) => {
	const err = new Error("build broke");
	const middleware = createMiddleware({getServeError: () => err});
	let nextArg = "unset";

	// Sec-Fetch-Dest: script — a failing subresource keeps its per-project behavior
	// so the browser never receives an HTML error page for a script/style/fetch load.
	middleware(mockReq({"sec-fetch-dest": "script", "accept": "*/*"}), {}, (arg) => {
		nextArg = arg;
	});

	t.is(nextArg, undefined, "Subresource loads are not diverted");
});

test("Passes an XHR/fetch request through even while errored", (t) => {
	const err = new Error("build broke");
	const middleware = createMiddleware({getServeError: () => err});
	let nextArg = "unset";

	middleware(mockReq({"sec-fetch-dest": "empty", "accept": "*/*"}), {}, (arg) => {
		nextArg = arg;
	});

	t.is(nextArg, undefined, "fetch/XHR loads are not diverted");
});

test("Passes everything through when no accessor is supplied", (t) => {
	const middleware = createMiddleware();
	let nextArg = "unset";

	middleware(mockReq(DOC_NAV), {}, (arg) => {
		nextArg = arg;
	});

	t.is(nextArg, undefined, "Without getServeError the gate is inert");
});
