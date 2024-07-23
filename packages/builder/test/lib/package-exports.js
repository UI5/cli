import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading version (e.g. from @ui5/cli)
test("export of package.json", (t) => {
	t.truthy(require("@ui5/builder/package.json").version);
});

// Check number of defined exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/builder/package.json");
	t.is(Object.keys(packageJson.exports).length, 9);
});

// Public API contract (exported modules)
[
	"processors/bundlers/flexChangesBundler",
	"processors/bundlers/moduleBundler",
	"processors/jsdoc/apiIndexGenerator",
	"processors/jsdoc/jsdocGenerator",
	"processors/jsdoc/sdkTransformer",
	"processors/bootstrapHtmlTransformer",
	"processors/minifier",
	"processors/libraryLessGenerator",
	"processors/manifestCreator",
	"processors/manifestEnhancer",
	"processors/nonAsciiEscaper",
	"processors/stringReplacer",
	"processors/themeBuilder",
	"processors/versionInfoGenerator",
	"tasks/bundlers/generateComponentPreload",
	"tasks/bundlers/generateFlexChangesBundle",
	"tasks/bundlers/generateLibraryPreload",
	"tasks/bundlers/generateStandaloneAppBundle",
	"tasks/bundlers/generateBundle",
	"tasks/generateCachebusterInfo",
	"tasks/buildThemes",
	"tasks/minify",
	"tasks/jsdoc/executeJsdocSdkTransformation",
	"tasks/jsdoc/generateApiIndex",
	"tasks/jsdoc/generateJsdoc",
	"tasks/generateThemeDesignerResources",
	"tasks/generateVersionInfo",
	"tasks/escapeNonAsciiCharacters",
	"tasks/replaceCopyright",
	"tasks/replaceVersion",
	"tasks/replaceBuildtime",
	"tasks/transformBootstrapHtml",
	"tasks/enhanceManifest",

	// Internal modules (only to be used by @ui5/* packages)
	{exportedSpecifier: "internal/taskRepository", mappedModule: "../../lib/tasks/taskRepository.js"},
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
	const spec = `@ui5/builder/${exportedSpecifier}`;
	test(`${spec}`, async (t) => {
		const actual = await import(spec);
		const expected = await import(mappedModule);
		t.is(actual, expected, "Correct module exported");
	});
});

test("no export of processors/jsdoc/lib/ui5/plugin", async (t) => {
	await t.throwsAsync(import("@ui5/builder/processors/jsdoc/lib/ui5/plugin"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		any: true
	});
	await t.throwsAsync(import("@ui5/builder/processors/jsdoc/lib/ui5/plugin.js"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		any: true
	});
});

test("no export of tasks/utils/dotTheming", async (t) => {
	await t.throwsAsync(import("@ui5/builder/tasks/utils/dotTheming"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		any: true
	});
});

test("no export of tasks/bundlers/utils/createModuleNameMapping", async (t) => {
	await t.throwsAsync(import("@ui5/builder/tasks/bundlers/utils/createModuleNameMapping"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		any: true
	});
	await t.throwsAsync(import("@ui5/builder/tasks/bundlers/utils/createModuleNameMapping.js"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		any: true
	});
});

test("no export of tasks/taskRepository", async (t) => {
	// Should only be exported as @ui5/builder/internal/taskRepository
	await t.throwsAsync(import("@ui5/builder/tasks/taskRepository"), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		any: true
	});
});
