import test from "ava";
import chai from "chai";
import chaifs from "chai-fs";
chai.use(chaifs);
const assert = chai.assert;
import sinon from "sinon";
import {createAdapter, createFilterReader, createFlatReader, createLinkReader} from "../../lib/resourceFactory.js";

test.afterEach.always((t) => {
	sinon.restore();
});

/* BEWARE:
	Always make sure that every test writes to a separate file! By default, tests are running concurrent.
*/
test("Get resource from application.a (/index.html) and write it to /dest/ using a ReadableStream", async (t) => {
	const source = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});
	const dest = createAdapter({
		fsBasePath: "./test/tmp/readerWriters/application.a/simple-read-write",
		virBasePath: "/dest/"
	});
	// Get resource from one readerWriter
	const resource = await source.byPath("/app/index.html");

	const clonedResource = await resource.clone();

	// Write resource content to another readerWriter
	clonedResource.setPath("/dest/index_readableStreamTest.html");
	await dest.write(clonedResource);

	t.notThrows(() => {
		assert.fileEqual("./test/tmp/readerWriters/application.a/simple-read-write/index_readableStreamTest.html",
			"./test/fixtures/application.a/webapp/index.html");
	});
});

test("Filter resources", async (t) => {
	const source = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});
	const filteredSource = createFilterReader({
		reader: source,
		callback: (resource) => {
			return resource.getPath().endsWith(".js");
		}
	});
	const sourceResources = await source.byGlob("**");
	t.is(sourceResources.length, 2, "Found two resources in source");

	const resources = await filteredSource.byGlob("**");

	t.is(resources.length, 1, "Found exactly one resource via filter");
	t.is(resources[0].getPath(), "/app/test.js", "Found correct resource");
});

test("Flatten resources", async (t) => {
	const source = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/"
	});
	const transformedSource = createFlatReader({
		reader: source,
		namespace: "app"
	});

	const resources = await transformedSource.byGlob("**/*.js");
	t.is(resources.length, 1, "Found one resource via transformer");
	t.is(resources[0].getPath(), "/test.js", "Found correct resource");
});

test("Link resources", async (t) => {
	const source = createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/"
	});
	const transformedSource = createLinkReader({
		reader: source,
		pathMapping: {
			linkPath: "/wow/this/is/a/beautiful/path/just/wow/",
			targetPath: "/resources/"
		}
	});

	const resources = await transformedSource.byGlob("**/*.js");
	t.is(resources.length, 1, "Found one resource via transformer");
	t.is(resources[0].getPath(), "/wow/this/is/a/beautiful/path/just/wow/app/test.js", "Found correct resource");
});
