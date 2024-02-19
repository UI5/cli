import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading version (e.g. from @ui5/cli)
test("export of package.json", (t) => {
	t.truthy(require("@ui5/server/package.json").version);
});

// Check number of definied exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/server/package.json");
	t.is(Object.keys(packageJson.exports).length, 5);
});

// Public API contract (exported modules)
test("@ui5/server", async (t) => {
	const actual = await import("@ui5/server");
	const expected = await import("../../lib/server.js");
	t.is(actual, expected, "Correct module exported");
});

// Internal modules (only to be used by @ui5/* / SAP owned packages)
[
	// used by @ui5/cli
	{exportedSpecifier: "internal/sslUtil", mappedModule: "../../lib/sslUtil.js"},

	// used by SAP/openui5 (csp middleware)
	{exportedSpecifier: "internal/middlewareRepository", mappedModule: "../../lib/middleware/middlewareRepository.js"},

	// used by karma-ui5
	{exportedSpecifier: "internal/MiddlewareManager", mappedModule: "../../lib/middleware/MiddlewareManager.js"},
].forEach((v) => {
	let exportedSpecifier; let mappedModule;
	if (typeof v === "string") {
		exportedSpecifier = v;
	} else {
		exportedSpecifier = v.exportedSpecifier;
		mappedModule = v.mappedModule;
	}
	if (!mappedModule) {
		mappedModule = `../../lib/${exportedSpecifier}.js`;
	}
	const spec = `@ui5/server/${exportedSpecifier}`;
	test(`${spec}`, async (t) => {
		const actual = await import(spec);
		const expected = await import(mappedModule);
		t.is(actual, expected, "Correct module exported");
	});
});
