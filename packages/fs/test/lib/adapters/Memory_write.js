const {test} = require("ava");
const ui5Fs = require("../../../");

// Create readerWriters before running tests
test.beforeEach((t) => {
	t.context.readerWriters = {
		source: ui5Fs.resourceFactory.createAdapter({
			virBasePath: "/app/"
		}),
		dest: ui5Fs.resourceFactory.createAdapter({
			virBasePath: "/app/"
		})
	};
	t.context.testResource = ui5Fs.resourceFactory.createResource({
		path: "/app/index.html",
		string: "test"
	});
});

test("Mem-Adapter: GLOB resources from application.a w/ virtual base path prefix", async (t) => {
	const dest = t.context.readerWriters.dest;

	// Get resource from one readerWriter
	await dest.write(t.context.testResource)
		.then(() => dest.byGlob("/app/*.html"))
		.then((resources) => {
			t.deepEqual(resources.length, 1, "Found exactly one resource");
		});
});

test("Mem-Adapter: GLOB resources from application.a w/o virtual base path prefix", async (t) => {
	const dest = t.context.readerWriters.dest;

	// Get resource from one readerWriter
	await dest.write(t.context.testResource)
		.then(() => dest.byGlob("/**/*.html"))
		.then((resources) => {
			t.deepEqual(resources.length, 1, "Found exactly one resource");
		});
});
