const {test} = require("ava");
const {resourceFactory} = require("../../../");

test("GLOB resources from application.a w/ virtual base path prefix", async (t) => {
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

test("GLOB resources from application.a w/o virtual base path prefix", async (t) => {
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

test("GLOB virtual directory w/o virtual base path prefix", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: false});
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("GLOB virtual directory w/ virtual base path prefix", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: false});
	t.deepEqual(resources.length, 1, "Found exactly one resource");
});

test("GLOB virtual directory w/o virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: true});
	t.deepEqual(resources.length, 0, "Found no resources");
});

test("GLOB virtual directory w/ virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: true});
	t.deepEqual(resources.length, 0, "Found no resources");
});

// Load more data from FS into memory
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

test("GLOB all", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);
	const resources = await readerWriter.byGlob("/**/*.*");
	t.deepEqual(resources.length, 16, "Found all resources");
});

test("GLOB all from root", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);
	const resources = await readerWriter.byGlob("/*/*.*");
	matchGlobResult(t, resources, ["/app/package.json"]);
});

test("GLOB all with virtual path included", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/app/**/*.*");
	t.deepEqual(resources.length, 16, "Found all resources");
});

test("GLOB a specific filetype (yaml)", async (t) => {
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

test("GLOB two specific filetype (yaml and js)", async (t) => {
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

test("GLOB a specific filetype (json) with exclude pattern", async (t) => {
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

test("GLOB a specific filetype (json) with multiple exclude pattern", async (t) => {
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

test("GLOB (normalized) root directory (=> fs root)", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/*/",
	], {nodir: false});
	resources.forEach((res) => {
		t.deepEqual(res._name, "app");
		t.deepEqual(res.getStatInfo().isDirectory(), true);
	});
});

test("GLOB root directory", async (t) => {
	t.plan(2);
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/app/", {nodir: false});
	matchGlobResult(t, resources, ["/app"]);
});

test("GLOB subdirectory", async (t) => {
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

test("Write resource w/ virtual base path", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const res = resourceFactory.createResource({
		path: "/app/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [], "Adapter added correct virtual directories");
});

test("Write resource w/o virtual base path", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/"
	});

	const res = resourceFactory.createResource({
		path: "/one/two/three/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"one/two/three/test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [
		"one/two/three",
		"one/two",
		"one"
	], "Adapter added correct virtual directories");

	const dirRes = readerWriter._virDirs["one/two/three"];
	t.deepEqual(dirRes.getStatInfo().isDirectory(), true, "Directory resource is a directory");
	t.deepEqual(dirRes.getPath(), "/one/two/three", "Directory resource has correct path");
});

test("Write resource w/ deep virtual base path", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/a/"
	});

	const res = resourceFactory.createResource({
		path: "/app/a/one/two/three/test.html"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"one/two/three/test.html": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [
		"one/two/three",
		"one/two",
		"one"
	], "Adapter added correct virtual directories");

	const dirRes = readerWriter._virDirs["one/two/three"];
	t.deepEqual(dirRes.getStatInfo().isDirectory(), true, "Directory resource is a directory");
	t.deepEqual(dirRes.getPath(), "/app/a/one/two/three", "Directory resource has correct path");
});

test("Write resource w/ crazy virtual base path", async (t) => {
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/app/🐛/"
	});

	const res = resourceFactory.createResource({
		path: "/app/🐛/one\\/2/3️⃣/test"
	});
	await readerWriter.write(res);

	t.deepEqual(readerWriter._virFiles, {
		"one\\/2/3️⃣/test": res
	}, "Adapter added resource with correct path");

	t.deepEqual(Object.keys(readerWriter._virDirs), [
		"one\\/2/3️⃣",
		"one\\/2",
		"one\\"
	], "Adapter added correct virtual directories");
});
