const test = require("ava");
const middlewareRepository = require("../../../../lib/middleware/middlewareRepository");

test("getMiddleware", async (t) => {
	const cspModule = require("../../../../lib/middleware/csp");
	const res = middlewareRepository.getMiddleware("csp");
	t.is(res, cspModule, "Returned correct middleware module");
});

test("getMiddleware: Unknown middleware", async (t) => {
	const err = t.throws(() => {
		middlewareRepository.getMiddleware("🐬");
	});
	t.deepEqual(err.message, "middlewareRepository: Unknown Middleware 🐬",
		"Threw error with correct message");
});

test("addMiddleware", async (t) => {
	const cspModule = require("../../../../lib/middleware/csp");
	middlewareRepository.addMiddleware("🐠", "./csp");
	const res = middlewareRepository.getMiddleware("🐠");

	t.is(res, cspModule, "Returned added middleware module");
});

test("addMiddleware: Duplicate middleware", async (t) => {
	const err = t.throws(() => {
		middlewareRepository.addMiddleware("cors");
	});
	t.deepEqual(err.message, "middlewareRepository: Middleware cors already registered",
		"Threw error with correct message");
});
