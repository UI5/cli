import test from "ava";
import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

// package.json should be exported to allow reading version (e.g. from @ui5/cli)
test("export of package.json", (t) => {
	t.truthy(require("@ui5/fs/package.json").version);
});

// Check number of definied exports
test("check number of exports", (t) => {
	const packageJson = require("@ui5/fs/package.json");
	t.is(Object.keys(packageJson.exports).length, 12);
});

// Public API contract (exported modules)
[
	{
		exportedSpecifier: "@ui5/fs/adapters/AbstractAdapter",
		mappedModule: "../../lib/adapters/AbstractAdapter.js"
	},
	{
		exportedSpecifier: "@ui5/fs/adapters/FileSystem",
		mappedModule: "../../lib/adapters/FileSystem.js"
	},
	{
		exportedSpecifier: "@ui5/fs/adapters/Memory",
		mappedModule: "../../lib/adapters/Memory.js"
	},
	{
		exportedSpecifier: "@ui5/fs/AbstractReader",
		mappedModule: "../../lib/AbstractReader.js"
	},
	{
		exportedSpecifier: "@ui5/fs/AbstractReaderWriter",
		mappedModule: "../../lib/AbstractReaderWriter.js"
	},
	{
		exportedSpecifier: "@ui5/fs/DuplexCollection",
		mappedModule: "../../lib/DuplexCollection.js"
	},
	{
		exportedSpecifier: "@ui5/fs/fsInterface",
		mappedModule: "../../lib/fsInterface.js"
	},
	{
		exportedSpecifier: "@ui5/fs/ReaderCollection",
		mappedModule: "../../lib/ReaderCollection.js"
	},
	{
		exportedSpecifier: "@ui5/fs/ReaderCollectionPrioritized",
		mappedModule: "../../lib/ReaderCollectionPrioritized.js"
	},
	{
		exportedSpecifier: "@ui5/fs/readers/Filter",
		mappedModule: "../../lib/readers/Filter.js"
	},
	{
		exportedSpecifier: "@ui5/fs/readers/Link",
		mappedModule: "../../lib/readers/Link.js"
	},
	{
		exportedSpecifier: "@ui5/fs/Resource",
		mappedModule: "../../lib/Resource.js"
	},
	{
		exportedSpecifier: "@ui5/fs/resourceFactory",
		mappedModule: "../../lib/resourceFactory.js"
	},
	// Internal modules (only to be used by @ui5/* packages)
	{
		exportedSpecifier: "@ui5/fs/internal/ResourceTagCollection",
		mappedModule: "../../lib/ResourceTagCollection.js"
	},
].forEach(({exportedSpecifier, mappedModule}) => {
	test(`${exportedSpecifier}`, async (t) => {
		const actual = await import(exportedSpecifier);
		const expected = await import(mappedModule);
		t.is(actual, expected, "Correct module exported");
	});
});
