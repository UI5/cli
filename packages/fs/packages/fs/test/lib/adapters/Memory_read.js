const {test} = require("ava");
const {resourceFactory} = require("../../../");

async function fillFromFs(readerWriter) {
	const fsReader = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/glob",
		virBasePath: "/app/",
	});

	const fsResources = await fsReader.byGlob("/**/*");
	return Promise.all(fsResources.map(function(resource) {
		return readerWriter.write(resource);
	}));
}

function matchGlobResult(t, resources, expectedResources) {
	t.deepEqual(resources.length, expectedResources.length, "Amount of files matches expected result.");

	const matchedResources = resources.map((resource) => {
		return resource.getPath();
	});

	for (let i = 0; i < expectedResources.length; i++) {
		const expectedResource = expectedResources[i];
		t.true(
			matchedResources.indexOf(expectedResource) !== -1,
			"File '" + expectedResource + "' was found."
		);
	}
}

test("glob resources from application.a w/ virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const resource = resourceFactory.createResource({
		path: "/app/index.html",
		string: "test"
	});
	await readerWriter.write(resource);

	const resources = await readerWriter.byGlob("/app/*.html");
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("glob resources from application.a w/o virtual base path prefix", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const resource = resourceFactory.createResource({
		path: "/app/index.html",
		string: "test"
	});
	await readerWriter.write(resource);

	const resources = await readerWriter.byGlob("/**/*.html");
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: false});
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/ virtual base path prefix", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: false});
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: true});
	t.deepEqual(resources.length, 0, "Found no resources");
});

test("glob virtual directory w/ virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: true});
	t.deepEqual(resources.length, 0, "Found no resources");
});

/* Load more data from FS into memory */
test("glob all", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);
	const resources = await readerWriter.byGlob("/**/*.*");
	t.deepEqual(resources.length, 16, "Found all resources");
});

test("glob all from root", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);
	const resources = await readerWriter.byGlob("/*/*.*");
	matchGlobResult(t, resources, ["/app/package.json"]);
});

test("glob all with virtual path included", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/app/**/*.*");
	t.deepEqual(resources.length, 16, "Found all resources");
});

test("glob a specific filetype (yaml)", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/**/*.yaml");
	resources.forEach((res) => {
		t.deepEqual(res._name, "ui5.yaml");
	});
});

test("glob two specific filetype (yaml and js)", async (t) => {
	t.plan(4);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/**/*.{yaml,js}");
	const expectedFiles = [
		"/app/application.b/ui5.yaml",
		"/app/application.a/ui5.yaml",
		"/app/application.a/webapp/test.js"
	];
	matchGlobResult(t, resources, expectedFiles);
});

test("glob a specific filetype (json) with exclude pattern", async (t) => {
	t.plan(3);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/**/*.json",
		"!/**/*package.json"
	]);
	const expectedFiles = [
		"/app/application.b/webapp/manifest.json",
		"/app/application.b/webapp/embedded/manifest.json"
	];
	matchGlobResult(t, resources, expectedFiles);
});

test("glob a specific filetype (json) with multiple exclude pattern", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/**/*.json",
		"!/**/*package.json",
		"!/**/embedded/manifest.json"
	]);
	matchGlobResult(t, resources, ["/app/application.b/webapp/manifest.json"]);
});

test("glob (normalized) root directory (=> fs root)", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/*",
	], {nodir: false});
	resources.forEach((res) => {
		t.deepEqual(res._name, "app");
		t.deepEqual(res.getStatInfo().isDirectory(), true);
	});
});

test("glob root directory", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/app/", {nodir: false});
	matchGlobResult(t, resources, ["/app"]);
});

test("glob subdirectory", async (t) => {
	t.plan(3);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/app/application.a",
	], {nodir: false});

	t.deepEqual(resources.length, 1, "Found one resource");
	t.deepEqual(resources[0].getPath(), "/app/application.a");
	t.deepEqual(resources[0].getStatInfo().isDirectory(), true);
});
