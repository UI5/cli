import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require as importing json files causes an ExperimentalWarning
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading version (e.g. from @ui5/cli)
test("export of package.json", (t) => {
	const packageJson = require("@ui5/project/package.json");
	t.truthy(packageJson.version);
});

// Check number of definied exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/project/package.json");
	t.is(Object.keys(packageJson.exports).length, 11);
});

// Public API contract (exported modules)
[
	"specifications/Specification",
	"specifications/SpecificationVersion",
	"ui5Framework/Openui5Resolver",
	"ui5Framework/Sapui5Resolver",
	"ui5Framework/Sapui5MavenSnapshotResolver",
	"validation/validator",
	"validation/ValidationError",
	"graph/ProjectGraph",
	"graph/projectGraphBuilder",
	{exportedSpecifier: "graph", mappedModule: "../../lib/graph/graph.js"},
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
