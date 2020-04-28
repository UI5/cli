const test = require("ava");
const path = require("path");
const middlewareRepository = require("../../../../lib/middleware/middlewareRepository");

test("getMiddleware", async (t) => {
	const cspModule = require("../../../../lib/middleware/csp");
	const res = middlewareRepository.getMiddleware("csp");
	t.deepEqual(res, {
		middleware: cspModule,
		specVersion: undefined
	}, "Returned correct middleware module");
});

test("getMiddleware: Unknown middleware", async (t) => {
	const err = t.throws(() => {
		middlewareRepository.getMiddleware("🐬");
	});
	t.deepEqual(err.message, "middlewareRepository: Unknown Middleware 🐬",
		"Threw error with correct message");
});

test("addMiddleware", async (t) => {
	const cspModulePath = path.join(__dirname, "..", "..", "..", "..", "lib", "middleware", "csp");
	middlewareRepository.addMiddleware({
		name: "🐠",
		specVersion: "2.0",
		middlewarePath: cspModulePath
	});
	const res = middlewareRepository.getMiddleware("🐠");

	t.deepEqual(res, {
		middleware: require(cspModulePath),
		specVersion: "2.0",
	}, "Returned correct middleware module");
});

test("addMiddleware: Duplicate middleware", async (t) => {
	const err = t.throws(() => {
		middlewareRepository.addMiddleware({
			name: "cors"
		});
	});
	t.deepEqual(err.message,
		"middlewareRepository: A middleware with the name cors has already been registered",
		"Threw error with correct message");
});

test("addMiddleware: Middleware with invalid path", (t) => {
	middlewareRepository.addMiddleware({
		name: "🙅",
		specVersion: "2.0",
		middlewarePath: "/path/does/not/exist"
	});
	const error = t.throws(() => {
		middlewareRepository.getMiddleware("🙅");
	});
	t.regex(error.message,
		new RegExp("^middlewareRepository: Failed to require middleware module for 🙅: " +
			"Cannot find module '/path/does/not/exist'"),
		"Error message starts with expected text");
});
