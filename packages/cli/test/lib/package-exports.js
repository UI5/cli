import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading the version
test("export of package.json", (t) => {
	t.truthy(require("@ui5/cli/package.json").version);
});

test("export of bin/ui5.cjs", (t) => {
	t.truthy(import.meta.resolve("@ui5/cli/bin/ui5.cjs"));
});

test("export of bin/ui5.js (for compatibility with CLI v2 that might invoke a newer local installation", (t) => {
	t.truthy(import.meta.resolve("@ui5/cli/bin/ui5.js"));
});

// Check number of definied exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/cli/package.json");
	t.is(Object.keys(packageJson.exports).length, 3);
});
