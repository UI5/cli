import test from "ava";
import createErrorHandler from "../../../../lib/middleware/errorHandler.js";

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
		status(code) {
			state.statusCode = code;
			return this;
		},
		type(t) {
			state.contentType = t;
			return this;
		},
		send(body) {
			state.body = body;
			return this;
		},
	};
}

test("Responds with 500 and the error stack as plain text", (t) => {
	const handler = createErrorHandler();
	const err = new Error("boom");
	const res = mockRes();
	let nextCalled = false;

	handler(err, {}, res, () => {
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

	handler(err, {}, res, () => t.fail("next should not be called"));

	t.is(res.state.statusCode, 500);
	t.is(res.state.body, "just a message");
});

test("Falls back to String(err) when the error carries neither stack nor message", (t) => {
	const handler = createErrorHandler();
	const res = mockRes();

	handler("bare string", {}, res, () => t.fail("next should not be called"));

	t.is(res.state.statusCode, 500);
	t.is(res.state.body, "bare string");
});

test("Delegates to next(err) when headers were already sent", (t) => {
	const handler = createErrorHandler();
	const err = new Error("late failure");
	const res = mockRes();
	res.state.headersSent = true;
	let nextArg;

	handler(err, {}, res, (arg) => {
		nextArg = arg;
	});

	t.is(nextArg, err, "The error is forwarded to Express's default handler");
	t.is(res.state.statusCode, null, "Response state is left untouched once headers are out");
});
