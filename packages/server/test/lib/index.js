const test = require("ava");
const index = require("../../index");

test("index.js exports all expected modules", (t) => {
	t.truthy(index.server, "Module exported");
	t.truthy(index.sslUtil, "Module exported");
	t.truthy(index.middlewareRepository, "Module exported");

	t.truthy(index.middleware.csp, "Module exported");
	t.truthy(index.middleware.discovery, "Module exported");
	t.truthy(index.middleware.nonReadRequests, "Module exported");
	t.truthy(index.middleware.serveIndex, "Module exported");
	t.truthy(index.middleware.serveResources, "Module exported");
	t.truthy(index.middleware.serveThemes, "Module exported");
	t.truthy(index.middleware.versionInfo, "Module exported");
});
