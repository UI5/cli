const test = require("ava");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;
const sinon = require("sinon");

const ui5Fs = require("../../");

test.afterEach.always((t) => {
	sinon.restore();
});

/* BEWARE:
	Always make sure that every test writes to a separate file! By default, tests are running concurrent.
*/
test("Get resource from application.a (/index.html) and write it to /dest/ using a ReadableStream", async (t) => {
	const source = ui5Fs.resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});
	const dest = ui5Fs.resourceFactory.createAdapter({
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
	const source = ui5Fs.resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});
	const filteredSource = source.filter((resource) => {
		return resource.getPath().endsWith(".js");
	});
	const sourceResources = await source.byGlob("**");
	t.is(sourceResources.length, 2, "Found two resources in source");

	const resources = await filteredSource.byGlob("**");

	t.is(resources.length, 1, "Found exactly one resource via filter");
	t.is(resources[0].getPath(), "/app/test.js", "Found correct resource");
});

test("Transform resources", async (t) => {
	const source = ui5Fs.resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/app/"
	});
	const transformedSource = source.transform(async (resourcePath, getResource) => {
		if (resourcePath === "/app/test.js") {
			const resource = await getResource();
			resource.setPath("/app/transformed-test.js");
		}
	});

	const resources = await transformedSource.byGlob("**/*.js");
	t.is(resources.length, 1, "Found one resource via transformer");
	t.is(resources[0].getPath(), "/app/transformed-test.js", "Found correct resource");

	const sourceResources = await source.byGlob("**/*.js");
	t.is(sourceResources.length, 1, "Found one resource via source");
	t.is(sourceResources[0].getPath(), "/app/test.js", "Found resource with original path");

	t.is(await resources[0].getString(), await sourceResources[0].getString(),
		"Resources have identical content");
});

test("Flatten resources", async (t) => {
	const source = ui5Fs.resourceFactory.createAdapter({
		fsBasePath: "./test/fixtures/application.a/webapp",
		virBasePath: "/resources/app/"
	});
	const transformedSource = source.flatten("app");

	const resources = await transformedSource.byGlob("**/*.js");
	t.is(resources.length, 1, "Found one resource via transformer");
	t.is(resources[0].getPath(), "/test.js", "Found correct resource");
});
