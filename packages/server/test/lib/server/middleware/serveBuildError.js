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

test("Degraded: diverts a document navigation, a subresource, and an XHR alike", (t) => {
	// A degraded error means the whole graph is unresolvable; the surviving BuildServer would
	// block any read. So every request type is diverted, unlike the per-project ERROR gate.
	const degradedError = new Error("Cannot read ui5.yaml: no such file");
	const middleware = createMiddleware({getDegradedError: () => degradedError});

	for (const [label, headers] of [
		["document navigation", DOC_NAV],
		["subresource", {"sec-fetch-dest": "script", "accept": "*/*"}],
		["XHR/fetch", {"sec-fetch-dest": "empty", "accept": "*/*"}],
	]) {
		let nextArg = "unset";
		middleware(mockReq(headers), {}, (arg) => {
			nextArg = arg;
		});
		t.is(nextArg, degradedError, `${label} is diverted while degraded`);
	}
});

test("Degraded takes precedence over a per-project ERROR on a subresource", (t) => {
	// With both set, the degraded gate wins and diverts even a subresource, which the ERROR
	// gate alone would pass through.
	const degradedError = new Error("invalid ui5.yaml");
	const serveError = new Error("build broke");
	const middleware = createMiddleware({
		getServeError: () => serveError,
		getDegradedError: () => degradedError,
	});

	let nextArg = "unset";
	middleware(mockReq({"sec-fetch-dest": "script", "accept": "*/*"}), {}, (arg) => {
		nextArg = arg;
	});
	t.is(nextArg, degradedError, "the degraded error is forwarded, not the per-project error");
});

test("Not degraded: falls back to the per-project ERROR gate", (t) => {
	// getDegradedError returning falsy leaves the per-project behavior intact.
	const serveError = new Error("build broke");
	const middleware = createMiddleware({
		getServeError: () => serveError,
		getDegradedError: () => null,
	});

	let docNavArg = "unset";
	middleware(mockReq(DOC_NAV), {}, (arg) => {
		docNavArg = arg;
	});
	t.is(docNavArg, serveError, "a document navigation is diverted by the per-project gate");

	let subresourceArg = "unset";
	middleware(mockReq({"sec-fetch-dest": "script", "accept": "*/*"}), {}, (arg) => {
		subresourceArg = arg;
	});
	t.is(subresourceArg, undefined, "a subresource still passes through when only globally errored");
});
