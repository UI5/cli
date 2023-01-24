import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require as importing json files causes an ExperimentalWarning
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading version (e.g. from @ui5/cli)
test("export of package.json", (t) => {
	t.truthy(require("@ui5/logger/package.json").version);
});

// Check number of definied exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/logger/package.json");
	t.is(Object.keys(packageJson.exports).length, 5);
});

// Public API contract (exported modules)
[
	{exportedSpecifier: "Logger", mappedModule: "../../lib/loggers/Logger.js"},
	"writers/Console",

	// Internal modules (only to be used by @ui5/* packages)
	{exportedSpecifier: "internal/loggers/Logger", mappedModule: "../../lib/loggers/Logger.js"},
	{exportedSpecifier: "internal/loggers/Build", mappedModule: "../../lib/loggers/Build.js"},
	{exportedSpecifier: "internal/loggers/ProjectBuild", mappedModule: "../../lib/loggers/ProjectBuild.js"},
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
	const spec = `@ui5/logger/${exportedSpecifier}`;
	test(`${spec}`, async (t) => {
		const actual = await import(spec);
		const expected = await import(mappedModule);
		t.is(actual, expected, "Correct module exported");
	});
});

