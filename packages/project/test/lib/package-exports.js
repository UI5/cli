import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading version (e.g. from @ui5/cli)
test("export of package.json", (t) => {
	const packageJson = require("@ui5/project/package.json");
	t.truthy(packageJson.version);
});

// Check number of definied exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/project/package.json");
	t.is(Object.keys(packageJson.exports).length, 17);
});

// Public API contract (exported modules)
[
	"config/Configuration",
	"build/cache/Cache",
	{exportedSpecifier: "internal/build/cache/CacheManager", mappedModule: "../../lib/build/cache/CacheManager.js"},
	"specifications/Specification",
	"specifications/SpecificationVersion",
	"ui5Framework/Openui5Resolver",
	"ui5Framework/Sapui5Resolver",
	"ui5Framework/Sapui5MavenSnapshotResolver",
	"ui5Framework/maven/SnapshotCache",
	{exportedSpecifier: "internal/ui5Framework/cache", mappedModule: "../../lib/ui5Framework/cache.js"},
	"validation/validator",
	"validation/ValidationError",
	"graph/ProjectGraph",
	"graph/projectGraphBuilder",
	{exportedSpecifier: "graph", mappedModule: "../../lib/graph/graph.js"},
	// Internal modules (only to be used by @ui5/* / SAP owned packages)
	{
		exportedSpecifier: "internal/graph/ProjectDefinitionWatcher",
		mappedModule: "../../lib/graph/ProjectDefinitionWatcher.js",
	},
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
	const spec = `@ui5/project/${exportedSpecifier}`;
	test(`${spec}`, async (t) => {
		const actual = await import(spec);
		const expected = await import(mappedModule);
		t.is(actual, expected, "Correct module exported");
	});
});

test("internal/graph/ProjectDefinitionWatcher re-exports", async (t) => {
	const mod = await import("@ui5/project/internal/graph/ProjectDefinitionWatcher");
	t.is(typeof mod.default, "function", "ProjectDefinitionWatcher is the default export");
	t.is(typeof mod.DEFINITION_CHANGED_SETTLE_MS, "number", "DEFINITION_CHANGED_SETTLE_MS is exported");
	t.is(typeof mod.waitForProjectGraphSettled, "function", "waitForProjectGraphSettled is re-exported");
	t.is(typeof mod.RecoveryBudget, "function", "RecoveryBudget is re-exported");
});
