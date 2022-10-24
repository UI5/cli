import test from "ava";
import {createAdapter} from "../../../lib/resourceFactory.js";

test("glob resources from application.a w/ virtual base path prefix", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/app/**/*.html");
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob resources from application.a w/o virtual base path prefix", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/**/*.html");
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: false});
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix and multiple patterns", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob([
		"/*",
		"/*"
	], {nodir: false});
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/ virtual base path prefix", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: false});
	t.is(resources.length, 1, "Found exactly one resource");
});

test("glob virtual directory w/o virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob("/*", {nodir: true});
	t.is(resources.length, 0, "Found no resources");
});

test("glob virtual directory w/o virtual base path prefix and nodir: true and multiple patterns", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	const resources = await readerWriter.byGlob([
		"/*",
		"/*"
	], {nodir: true});
	t.is(resources.length, 0, "Found no resources");
});

test("glob virtual directory w/ virtual base path prefix and nodir: true", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/one/two/"
	});

	const resources = await readerWriter.byGlob("/app/*", {nodir: true});
	t.is(resources.length, 0, "Found no resources");
});

test("glob resources from application.a with directory exclude", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});

	await readerWriter.byGlob("/!(pony,unicorn)/**").then(function(resources) {
		t.is(resources.length, 2, "Found exactly two resource");
	});
});

test("byPath virtual directory", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/"
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.truthy(resource, "Found one resource");
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
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes
	});

	const testReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/",
		excludes
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
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes
	});

	const testReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/",
		excludes
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
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/",
		excludes
	});

	const testResources = await testReader.byGlob("/**/*", {nodir: true});

	t.is(testResources.length, 1, "Found one test resource");
	t.deepEqual(testResources.map(getPathFromResource), [
		"/test-resources/library/l/Test2.html"
	], "Found expected test resources");
});

test("static excludes: glob with virtual root exclude", async (t) => {
	const srcReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes: [
			"/**"
		]
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: true});

	t.is(resources.length, 0, "Found no resources");
});

test("static excludes: glob with negated directory exclude, excluding resources", async (t) => {
	const srcReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes: [
			"/!({pony,unicorn})/**"
		]
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: true});

	t.is(resources.length, 0, "Found no resources");
});

test("static excludes: glob with negated directory exclude, not excluding resources", async (t) => {
	const srcReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes: [
			"/!(resources)/**"
		]
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: true});

	t.is(resources.length, 2, "Found two resources");
});

test("static excludes: byPath exclude everything in sub-directory", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		excludes: ["/resources/app/**"]
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.is(resource, null, "Found no resource");
});

test("static excludes: byPath exclude with negation", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		excludes: [
			"/resources/app/**",
			"!/resources/app/index.html"
		]
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.truthy(resource, "Found one resource");
});

test("static excludes: byPath exclude with unused negation", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		excludes: [
			"!/resources/app/index.html",
			"/resources/app/**"
		]
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.is(resource, null, "Resource is excluded");
});

test("static excludes: byPath exclude with negated directory pattern, excluding resources", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		excludes: [
			"/!({pony,unicorn})/**"
		]
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.is(resource, null, "Found no resource");
});

test("static excludes: byPath exclude with negated directory pattern, not excluding resources", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		excludes: [
			"/!(resources)/**"
		]
	});

	const resource = await readerWriter.byPath("/resources/app/index.html", {nodir: true});
	t.truthy(resource, "Found one resource");
});

test("byPath: exclude with unused negation", async (t) => {
	const readerWriter = createAdapter({
		fsBasePath: "./test/fixtures/application.b/webapp",
		virBasePath: "/resources/app/",
		excludes: [
			"!/resources/app/i18n/**",
			"/resources/app/**",
			"!/resources/app/manifest.json"
		]
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
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes
	});

	const testReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/test",
		virBasePath: "/test-resources/",
		excludes
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
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes: [
			"/**"
		]
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: false});

	t.is(resources.length, 0, "Found no resources");
});
test("static excludes: glob with negated directory exclude, excluding resources (nodir: false)", async (t) => {
	const srcReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes: [
			"/!({pony,unicorn})/**"
		]
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: false});

	t.is(resources.length, 0, "Found no resources");
});

test("static excludes: glob with negated directory exclude, not excluding resources (nodir: false)", async (t) => {
	const srcReader = createAdapter({
		fsBasePath: "./test/fixtures/library.l/src",
		virBasePath: "/resources/",
		excludes: [
			"/!(resources)/**"
		]
	});

	const resources = await srcReader.byGlob("/**/*", {nodir: false});

	t.is(resources.length, 4, "Found two resources and two directories");
});
