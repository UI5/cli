import test from "ava";
import middlewareRepository from "../../../../lib/middleware/middlewareRepository.js";
import cspModule from "../../../../lib/middleware/csp.js";

test("getMiddleware", async (t) => {
	const res = await middlewareRepository.getMiddleware("csp");
	t.deepEqual(res, {
		middleware: cspModule
	}, "Returned correct middleware module");
});

test("getMiddleware: Unknown middleware", async (t) => {
	const err = await t.throwsAsync(middlewareRepository.getMiddleware("🐬"));
	t.is(err.message, "middlewareRepository: Unknown Middleware 🐬",
		"Threw error with correct message");
});
