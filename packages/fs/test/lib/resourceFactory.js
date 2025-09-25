import test from "ava";
import {
	createAdapter, createReader, createReaderCollection, createReaderCollectionPrioritized,
	createResource, createWriterCollection, createWorkspace, prefixGlobPattern} from "../../lib/resourceFactory.js";
import FileSystem from "../../lib/adapters/FileSystem.js";
import Memory from "../../lib/adapters/Memory.js";
import ReaderCollection from "../../lib/ReaderCollection.js";
import {setLogLevel} from "@ui5/logger";

// Set log level to silly to activate tracing
setLogLevel("silly");

test("prefixGlobPattern", (t) => {
	t.deepEqual(
		prefixGlobPattern("{/sub-directory-1/,/sub-directory-2/}**", "/pony/path/a"),
		[
			"/pony/path/a/sub-directory-1/**",
			"/pony/path/a/sub-directory-2/**"
		],
		"GLOBs correctly prefixed");

	t.deepEqual(
		prefixGlobPattern("/pony-path/**", "/pony/path/a"),
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		prefixGlobPattern("!/duck*path/**", "/pony/path/a"),
		["!/pony/path/a/duck*path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		prefixGlobPattern("!**.json", "/pony/path/a"),
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		prefixGlobPattern("!**.json", "/pony/path/a/"), // trailing slash
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		prefixGlobPattern("pony-path/**", "/pony/path/a/"), // trailing slash
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");
});

test("createAdapter: FS Adapter", async (t) => {
	const adapter = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});

	t.true(adapter instanceof FileSystem, "Returned a FileSystem adapter");

	const resources = await adapter.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/test.js", "Found correct resource");
});

test("createAdapter: Memory", async (t) => {
	const adapter = createAdapter({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});

	t.true(adapter instanceof Memory, "Returned a Memory adapter");

	const resource1 = createResource({
		path: "/resources/app/File.js"
	});
	await adapter.write(resource1);

	const resource2 = createResource({
		path: "/resources/app/index.html"
	});
	await adapter.write(resource2);

	const resources = await adapter.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/File.js", "Found correct resource");
});

test("createReader: application project", async (t) => {
	const reader = createReader({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project",
			getType: () => "application"
		},
		excludes: [
			"**/*.html",
			"/resources/app/test/**",
			"/test/**",
			"test/**",
			"!/resources/app/test/**",
			"!/test/**/*.html"
		],
		name: "reader name"
	});

	t.true(reader instanceof ReaderCollection, "Returned a ReaderCollection");
	t.is(reader._name, "reader name", "Reader has correct name");

	const resources = await reader.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/test.js", "Found correct resource");

	t.deepEqual(reader._readers[0]._excludes, [
		"/resources/app/**/*.html",
		"/resources/app/test/**", // Was already prefixed correctly
		"/resources/app/test/**",
		"/resources/app/test/**",
		"!/resources/app/test/**",
		"!/resources/app/test/**/*.html",
	], "Some excludes got prefixed.");
});

test("createReader: library project", async (t) => {
	const reader = createReader({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/lib/",
		project: {
			getName: () => "my.project",
			getType: () => "library"
		},
		excludes: [
			"**/*.html",
			"/resources/lib/dir/**",
			"/test-resources/lib/dir/**",
			"/test/**",
			"test/**"
		],
		name: "reader name"
	});

	t.true(reader instanceof ReaderCollection, "Returned a ReaderCollection");
	t.is(reader._name, "reader name", "Reader has correct name");

	const resources = await reader.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/lib/test.js", "Found correct resource");

	t.deepEqual(reader._readers[0]._excludes, [
		"**/*.html",
		"/resources/lib/dir/**",
		"/test-resources/lib/dir/**",
		"/test/**",
		"test/**",
	], "Excludes do not get prefixed.");
});

test("createReader: No project", async (t) => {
	const reader = createReader({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		excludes: [
			"**/*.html",
			"/resources/app/dir/**",
			"/test-resources/app/dir/**",
			"/test/**",
			"test/**"
		],
		name: "reader name"
	});

	t.true(reader instanceof ReaderCollection, "Returned a ReaderCollection");
	t.is(reader._name, "reader name", "Reader has correct name");

	const resources = await reader.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/test.js", "Found correct resource");

	t.deepEqual(reader._readers[0]._excludes, [
		"**/*.html",
		"/resources/app/dir/**",
		"/test-resources/app/dir/**",
		"/test/**",
		"test/**"
	], "Excludes do not get prefixed.");
});

test("createReader: Throw error missing 'fsBasePath'", (t) => {
	const error = t.throws(() => createReader({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"],
		name: "reader name"
	}));
	t.is(error.message, "Unable to create reader: Missing parameter \"fsBasePath\"");
});

test("createReaderCollection", async (t) => {
	const adapter = createAdapter({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});
	const resource1 = createResource({
		path: "/resources/app/File.js"
	});
	const resource2 = createResource({
		path: "/resources/app/index.html"
	});
	await adapter.write(resource1);
	await adapter.write(resource2);

	const reader = createReaderCollection({
		name: "reader name",
		readers: [adapter]
	});
	t.true(reader instanceof ReaderCollection, "Returned a ReaderCollection");
	t.is(reader._name, "reader name", "Reader has correct name");

	const resources = await adapter.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/File.js", "Found correct resource");
});

test("createReaderCollectionPrioritized", async (t) => {
	const {default: ReaderCollectionPrioritized} = await import("../../lib/ReaderCollectionPrioritized.js");
	const adapter = createAdapter({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});
	const resource1 = createResource({
		path: "/resources/app/File.js"
	});
	const resource2 = createResource({
		path: "/resources/app/index.html"
	});
	await adapter.write(resource1);
	await adapter.write(resource2);

	const reader = createReaderCollectionPrioritized({
		name: "reader name",
		readers: [adapter]
	});
	t.true(reader instanceof ReaderCollectionPrioritized, "Returned a ReaderCollection");
	t.is(reader._name, "reader name", "Reader has correct name");

	const resources = await adapter.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/File.js", "Found correct resource");
});

test("createWriterCollection", async (t) => {
	const {default: WriterCollection} = await import("../../lib/WriterCollection.js");
	const adapter1 = createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "my.project"
		}
	});
	const adapter2 = createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "my.other.project"
		}
	});
	const resource1 = createResource({
		path: "/resources/app/File.js"
	});
	const resource2 = createResource({
		path: "/resources/app2/index.html"
	});

	const writerCollection = createWriterCollection({
		name: "writer collection name",
		writerMapping: {
			"/resources/app/": adapter1,
			"/resources/app2/": adapter2
		}
	});
	t.true(writerCollection instanceof WriterCollection, "Returned a ReaderCollection");
	await writerCollection.write(resource1);
	await writerCollection.write(resource2);

	const resources1 = await adapter1.byGlob("**/*");
	t.is(resources1.length, 1, "Found one resource");
	t.is(resources1[0].getPath(), "/resources/app/File.js", "Found correct resource");
	const resources2 = await adapter2.byGlob("**/*");
	t.is(resources2.length, 1, "Found one resource");
	t.is(resources2[0].getPath(), "/resources/app2/index.html", "Found correct resource");
});

test("createWorkspace", async (t) => {
	const {default: DuplexCollection} = await import("../../lib/DuplexCollection.js");
	const reader = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		}
	});
	const readerWriter = createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "my.other.project"
		}
	});

	const writerCollection = createWorkspace({
		name: "writer collection name",
		reader,
		writer: readerWriter
	});
	t.true(writerCollection instanceof DuplexCollection, "Returned a ReaderCollection");

	const resource1 = createResource({
		path: "/resources/app/File.js"
	});

	await writerCollection.write(resource1);

	const resources = await writerCollection.byGlob("**/*");
	t.is(resources.length, 3, "Found three resources");
});

test("createWorkspace: Without writer", async (t) => {
	const {default: DuplexCollection} = await import("../../lib/DuplexCollection.js");
	const {default: Memory} = await import("../../lib/adapters/Memory.js");
	const reader = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		}
	});
	const writerCollection = createWorkspace({
		name: "writer collection name",
		reader
	});
	t.true(writerCollection instanceof DuplexCollection, "Returned a ReaderCollection");
	t.true(writerCollection._writer instanceof Memory, "Internal Writer is created and a MemAdapter");
});

