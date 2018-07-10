const {test} = require("ava");
const ui5Fs = require("../../../");

// Create readerWriters before running tests
test.beforeEach((t) => {
	t.context.readerWriters = {
		source: ui5Fs.resourceFactory.createAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/app/"
		})
	};
});

test("GLOB resources from application.a w/ virtual base path prefix", async (t) => {
	const source = t.context.readerWriters.source;
	// Get resource from one readerWriter
	await source.byGlob("/app/**/*.html").then(function(resources) {
		t.deepEqual(resources.length, 1, "Found exactly one resource");
	});
});

test("GLOB resources from application.a w/o virtual base path prefix", async (t) => {
	const source = t.context.readerWriters.source;
	// Get resource from one readerWriter
	await source.byGlob("/**/*.html").then(function(resources) {
		t.deepEqual(resources.length, 1, "Found exactly one resource");
	});
});

// TODO: Add test for globbing on empty directory (see Memory_read.js)
// TODO: Add test for nodir: false option
