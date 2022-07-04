const test = require("ava");
const resourceFactory = require("../../lib/resourceFactory");
const FileSystem = require("../../lib/adapters/FileSystem");
const Memory = require("../../lib/adapters/Memory");
const ReaderCollection = require("../../lib/ReaderCollection");

// Set log level to silly to activate tracing
require("@ui5/logger").setLevel("silly");

test("prefixGlobPattern", async (t) => {
	t.deepEqual(
		resourceFactory.prefixGlobPattern("{/sub-directory-1/,/sub-directory-2/}**", "/pony/path/a"),
		[
			"/pony/path/a/sub-directory-1/**",
			"/pony/path/a/sub-directory-2/**"
		],
		"GLOBs correctly prefixed");

	t.deepEqual(
		resourceFactory.prefixGlobPattern("/pony-path/**", "/pony/path/a"),
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		resourceFactory.prefixGlobPattern("!/duck*path/**", "/pony/path/a"),
		["!/pony/path/a/duck*path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		resourceFactory.prefixGlobPattern("!**.json", "/pony/path/a"),
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		resourceFactory.prefixGlobPattern("!**.json", "/pony/path/a/"), // trailing slash
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		resourceFactory.prefixGlobPattern("pony-path/**", "/pony/path/a/"), // trailing slash
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");
});

test("createAdapter: FS Adapter", async (t) => {
	const adapter = resourceFactory.createAdapter({
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
	const adapter = resourceFactory.createAdapter({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});

	t.true(adapter instanceof Memory, "Returned a Memory adapter");

	const resource1 = resourceFactory.createResource({
		path: "/resources/app/File.js"
	});
	await adapter.write(resource1);

	const resource2 = resourceFactory.createResource({
		path: "/resources/app/index.html"
	});
	await adapter.write(resource2);

	const resources = await adapter.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/File.js", "Found correct resource");
});

test("createReader", async (t) => {
	const reader = resourceFactory.createReader({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"],
		name: "reader name"
	});

	t.true(reader instanceof ReaderCollection, "Returned a ReaderCollection");
	t.is(reader._name, "reader name", "Reader has correct name");

	const resources = await reader.byGlob("**/*");
	t.is(resources.length, 1, "Found one resource");
	t.is(resources[0].getPath(), "/resources/app/test.js", "Found correct resource");
});

test("createReaderCollection", async (t) => {
	const adapter = resourceFactory.createAdapter({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});
	const resource1 = resourceFactory.createResource({
		path: "/resources/app/File.js"
	});
	const resource2 = resourceFactory.createResource({
		path: "/resources/app/index.html"
	});
	await adapter.write(resource1);
	await adapter.write(resource2);

	const reader = resourceFactory.createReaderCollection({
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
	const ReaderCollectionPrioritized = require("../../lib/ReaderCollectionPrioritized");
	const adapter = resourceFactory.createAdapter({
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		},
		excludes: ["**/*.html"]
	});
	const resource1 = resourceFactory.createResource({
		path: "/resources/app/File.js"
	});
	const resource2 = resourceFactory.createResource({
		path: "/resources/app/index.html"
	});
	await adapter.write(resource1);
	await adapter.write(resource2);

	const reader = resourceFactory.createReaderCollectionPrioritized({
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
	const WriterCollection = require("../../lib/WriterCollection");
	const adapter1 = resourceFactory.createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "my.project"
		}
	});
	const adapter2 = resourceFactory.createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "my.other.project"
		}
	});
	const resource1 = resourceFactory.createResource({
		path: "/resources/app/File.js"
	});
	const resource2 = resourceFactory.createResource({
		path: "/resources/app2/index.html"
	});

	const writerCollection = resourceFactory.createWriterCollection({
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
	const DuplexCollection = require("../../lib/DuplexCollection");
	const reader = resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/",
		project: {
			getName: () => "my.project"
		}
	});
	const readerWriter = resourceFactory.createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "my.other.project"
		}
	});

	const writerCollection = resourceFactory.createWorkspace({
		name: "writer collection name",
		reader,
		writer: readerWriter
	});
	t.true(writerCollection instanceof DuplexCollection, "Returned a ReaderCollection");

	const resource1 = resourceFactory.createResource({
		path: "/resources/app/File.js"
	});

	await writerCollection.write(resource1);

	const resources = await writerCollection.byGlob("**/*");
	t.is(resources.length, 3, "Found three resources");
});
