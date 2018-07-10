const {test} = require("ava");
const ui5Fs = require("../../../");

// Create readerWriters before running tests
test.beforeEach((t) => {
	t.context.readerWriters = {
		source: ui5Fs.resourceFactory.createAdapter({
			virBasePath: "/app/"
		})
	};
});


test("GLOB virtual directory w/o virtual base path prefix", async (t) => {
	const source = t.context.readerWriters.source;

	// Get resource from one readerWriter
	await source.byGlob("/*", {nodir: false})
		.then((resources) => {
			t.deepEqual(resources.length, 1, "Found exactly one resource");
		});
});

// TODO: Add test for nodir: true option
