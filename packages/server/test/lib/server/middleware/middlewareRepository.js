const test = require("ava");
const middlewareRepository = require("../../../../lib/middleware/middlewareRepository");

test("getMiddleware", (t) => {
	const cspModule = require("../../../../lib/middleware/csp");
	const res = middlewareRepository.getMiddleware("csp");
	t.deepEqual(res, {
		middleware: cspModule
	}, "Returned correct middleware module");
});

test("getMiddleware: Unknown middleware", (t) => {
	const err = t.throws(() => {
		middlewareRepository.getMiddleware("🐬");
	});
	t.is(err.message, "middlewareRepository: Unknown Middleware 🐬",
		"Threw error with correct message");
});
