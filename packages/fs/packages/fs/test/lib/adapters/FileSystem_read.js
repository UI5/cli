const {test} = require("ava");
const {resourceFactory} = require("../../../");

test("GLOB resources from application.a w/ virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	await readerWriter.byGlob("/app/**/*.html").then(function(resources) {
		t.deepEqual(resources.length, 1, "Found exactly one resource");
	});
});

test("GLOB resources from application.a w/o virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	await readerWriter.byGlob("/**/*.html").then(function(resources) {
		t.deepEqual(resources.length, 1, "Found exactly one resource");
	});
});

test("GLOB resources from application.a w/ virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/app/**/*.html");
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("GLOB resources from application.a w/o virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/**/*.html");
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("GLOB virtual directory w/o virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: false});
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("GLOB virtual directory w/ virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: false});
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("GLOB virtual directory w/o virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: true});
	t.deepEqual(resources.length, 0, "Found no resources");
});

test("GLOB virtual directory w/ virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: true});
	t.deepEqual(resources.length, 0, "Found no resources");
});
