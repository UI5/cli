import test from "ava";
import {createAdapter, createResource} from "../../../lib/resourceFactory.js";

async function fillFromFs(readerWriter, {fsBasePath = "./test/fixtures/glob", virBasePath = "/app/"} = {}) {
	const fsReader = createAdapter({
		fsBasePath,
		virBasePath,
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
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});

	const resource = createResource({
		path: "/app/index.html",
		string: "test"
	});
	await readerWriter.write(resource);

	const resources = await readerWriter.byGlob("/app/*.html");
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob resources from application.a w/o virtual base path prefix", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});

	const resource = createResource({
		path: "/app/index.html",
		string: "test"
	});
	await readerWriter.write(resource);

	const resources = await readerWriter.byGlob("/**/*.html");
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: false});
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix and multiple patterns", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob([
		"/*",
		"/*"
	], {nodir: false});
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/ virtual base path prefix", async (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: false});
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: true});
	t.is(resources.length, 0, "Found no resources");
});

test("glob virtual directory w/ virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: true});
	t.is(resources.length, 0, "Found no resources");
});

test("glob virtual directory w/ virtual base path prefix and nodir: true and multiple patterns", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob([
		"/*",
		"/*"
	], {nodir: true});
	t.is(resources.length, 0, "Found no resources");
});

/* Load more data from FS into memory */
test("glob all", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);
	const resources = await readerWriter.byGlob("/**/*.*");
	t.is(resources.length, 16, "Found all resources");
});

test("glob all from root", async (t) => {
	t.plan(2);
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);
	const resources = await readerWriter.byGlob("/*/*.*");
	matchGlobResult(t, resources, ["/app/package.json"]);
});

test("glob all with virtual path included", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/app/**/*.*");
	t.is(resources.length, 16, "Found all resources");
});

test("glob a specific filetype (yaml)", async (t) => {
	t.plan(2);
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/**/*.yaml");
	resources.forEach((res) => {
		t.is(res._name, "ui5.yaml");
	});
});

test("glob two specific filetype (yaml and js)", async (t) => {
	t.plan(4);
	const readerWriter = createAdapter({
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
	const readerWriter = createAdapter({
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
	const readerWriter = createAdapter({
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
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/*",
	], {nodir: false});
	resources.forEach((res) => {
		t.is(res._name, "app");
		t.is(res.getStatInfo().isDirectory(), true);
	});
});

test("glob root directory", async (t) => {
	t.plan(2);
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob("/app/", {nodir: false});
	matchGlobResult(t, resources, ["/app"]);
});

test("glob subdirectory", async (t) => {
	t.plan(3);
	const readerWriter = createAdapter({
		virBasePath: "/app/"
	});
	await fillFromFs(readerWriter);

	const resources = await readerWriter.byGlob([
		"/app/application.a",
	], {nodir: false});

	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/app/application.a");
	t.is(resources[0].getStatInfo().isDirectory(), true);
});

function getPathFromResource(resource) {
	return resource.getPath();
}

test("static excludes: glob library src and test", async (t) => {
	const excludes = [
		"/resources/**/some.js",

		// double negation has no effect over following "/test-resources/**" exclude
		"!/test-resources/library/l/Test2.html",

		"/test-resources/**",
	];
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const testReader = createAdapter({
		virBasePath: "/test-resources/",
		excludes
	});
	await fillFromFs(testReader, {
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/",
	});

	const srcResources = await srcReader.byGlob("/**/*", {nodir: true});
	const testResources = await testReader.byGlob("/**/*", {nodir: true});

	t.is(srcResources.length, 1, "Found one src resource");
	t.deepEqual(srcResources.map(getPathFromResource), [
		"/resources/library/l/.library"
	], "Found expected src resources");

	t.is(testResources.length, 0, "Found no test resources");
});

test("static excludes: glob library src and test with double negation", async (t) => {
	const excludes = [
		"/resources/**/some.js",
		"/test-resources/**",

		// double negation has effect over preceding "/test-resources/**" exclude
		"!/test-resources/library/l/Test2.html",
	];
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const testReader = createAdapter({
		virBasePath: "/test-resources/",
		excludes
	});
	await fillFromFs(testReader, {
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/"
	});

	const srcResources = await srcReader.byGlob("/**/*", {nodir: true});
	const testResources = await testReader.byGlob("/**/*", {nodir: true});

	t.is(srcResources.length, 1, "Found one src resource");
	t.deepEqual(srcResources.map(getPathFromResource), [
		"/resources/library/l/.library"
	], "Found expected src resources");

	t.is(testResources.length, 1, "Found one test resource");
	t.deepEqual(testResources.map(getPathFromResource), [
		"/test-resources/library/l/Test2.html"
	], "Found expected test resources");
});

test("static excludes: glob library test with double negation", async (t) => {
	const excludes = [
		"/test-resources/**",

		// double negation has effect over preceding "/test-resources/**" exclude
		"!/test-resources/library/l/Test2.html",
	];

	const testReader = createAdapter({
		virBasePath: "/test-resources/",
		excludes
	});
	await fillFromFs(testReader, {
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/"
	});

	const testResources = await testReader.byGlob("/**/*", {nodir: true});

	t.is(testResources.length, 1, "Found one test resource");
	t.deepEqual(testResources.map(getPathFromResource), [
		"/test-resources/library/l/Test2.html"
	], "Found expected test resources");
});

test("static excludes: glob with virtual root exclude", async (t) => {
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes: [
			"/**"
		]
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: true});

	t.is(resources.length, 0, "Found no resources");
});

test("static excludes: glob with negated directory exclude, excluding resources", async (t) => {
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes: [
			"/!({pony,unicorn})/**"
		]
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: true});

	t.is(resources.length, 0, "Found no resources");
});

test("static excludes: glob with negated directory exclude, not excluding resources", async (t) => {
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes: [
			"/!(resources)/**"
		]
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: true});

	t.is(resources.length, 2, "Found two resources");
});

test("static excludes: byPath exclude everything in sub-directory", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/resources/app/",
		excludes: ["/resources/app/**"]
	});
	await fillFromFs(readerWriter, {
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.is(resource, null, "Found no resource");
});

test("static excludes: byPath exclude with negation", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/resources/app/",
		excludes: [
			"/resources/app/**",
			"!/resources/app/index.html"
		]
	});
	await fillFromFs(readerWriter, {
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.truthy(resource, "Found one resource");
});

test("static excludes: byPath exclude with unused negation", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/resources/app/",
		excludes: [
			"!/resources/app/index.html",
			"/resources/app/**"
		]
	});
	await fillFromFs(readerWriter, {
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.is(resource, null, "Resource is excluded");
});

test("static excludes: byPath exclude with negated directory pattern, excluding resources", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/resources/app/",
		excludes: [
			"/!({pony,unicorn})/**"
		]
	});
	await fillFromFs(readerWriter, {
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.is(resource, null, "Found no resource");
});

test("static excludes: byPath exclude with negated directory pattern, not excluding resources", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/resources/app/",
		excludes: [
			"/!(resources)/**"
		]
	});
	await fillFromFs(readerWriter, {
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.truthy(resource, "Found one resource");
});

test("byPath: exclude with unused negation", async (t) => {
	const readerWriter = createAdapter({
		virBasePath: "/resources/app/",
		excludes: [
			"!/resources/app/i18n/**",
			"/resources/app/**",
			"!/resources/app/manifest.json"
		]
	});
	await fillFromFs(readerWriter, {
		fsBasePath: "./test/fixtures/application.b/webapp",
		virBasePath: "/resources/app/",
	});

	const [manifest, i18n, i18ni18n] = await Promise.all([
		readerWriter.byPath("/resources/app/manifest.json", {nodir: true}),
		readerWriter.byPath("/resources/app/i18n.properties", {nodir: true}),
		readerWriter.byPath("/resources/app/i18n/i18n.properties", {nodir: true})
	]);
	t.truthy(manifest, "Found manifest.json resource");
	t.is(i18n, null, "i18n resource is excluded");
	t.is(i18ni18n, null, "i18n in i18n directory resource is excluded");
});

test("static excludes: glob library src and test with double negation (nodir: false)", async (t) => {
	const excludes = [
		"/resources/**/some.js",
		"/test-resources/**",

		// double negation has effect over preceding "/test-resources/**" exclude
		"!/test-resources/library/l/Test2.html",
	];
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const testReader = createAdapter({
		virBasePath: "/test-resources/",
		excludes
	});
	await fillFromFs(testReader, {
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/",
	});

	const srcResources = await srcReader.byGlob("/**/*", {nodir: false});
	const testResources = await testReader.byGlob("/**/*", {nodir: false});

	t.is(srcResources.length, 3, "Found one src resource and two directories");

	t.is(testResources.length, 1, "Found one test resource");
	t.deepEqual(testResources.map(getPathFromResource), [
		"/test-resources/library/l/Test2.html"
	], "Found expected test resources");
});

test("static excludes: glob with virtual root exclude (nodir: false)", async (t) => {
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes: [
			"/**"
		]
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: false});

	t.is(resources.length, 0, "Found no resources");
});
test("static excludes: glob with negated directory exclude, excluding resources (nodir: false)", async (t) => {
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes: [
			"/!({pony,unicorn})/**"
		]
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: false});

	t.is(resources.length, 0, "Found no resources");
});

test("static excludes: glob with negated directory exclude, not excluding resources (nodir: false)", async (t) => {
	const srcReader = createAdapter({
		virBasePath: "/resources/",
		excludes: [
			"/!(resources)/**"
		]
	});
	await fillFromFs(srcReader, {
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: false});

	t.is(resources.length, 4, "Found two resources and two directories");
});
