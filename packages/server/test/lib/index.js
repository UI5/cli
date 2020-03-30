const test = require("ava");
const index = require("../../index");

test("index.js exports all expected modules", (t) => {
	t.truthy(index.server, "Module exported");
	t.truthy(index.sslUtil, "Module exported");
	t.truthy(index.middlewareRepository, "Module exported");
});
