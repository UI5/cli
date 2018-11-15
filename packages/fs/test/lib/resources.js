const {test} = require("ava");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;

const ui5Fs = require("../../");

// Create readerWriters before running tests
test.beforeEach((t) => {
	t.context.readerWriters = {
		source: ui5Fs.resourceFactory.createAdapter({
			fsBasePath: "./test/fixtures/application.a/webapp",
			virBasePath: "/app/"
		}),
		dest: ui5Fs.resourceFactory.createAdapter({
			fsBasePath: "./test/tmp/readerWriters/application.a",
			virBasePath: "/dest/"
		})
	};
});

/* BEWARE:
	Always make sure that every test writes to a separate file! By default, tests are running concurrent.
*/

test("Get resource from application.a (/index.html) and write it to /dest/ using a ReadableStream", (t) => {
	const readerWriters = t.context.readerWriters;
	// Get resource from one readerWriter
	return t.notThrows(readerWriters.source.byPath("/app/index.html")
		.then(function(resource) {
			return resource.clone();
		})
		.then(function(newResource) {
			// Write resource content to another readerWriter
			newResource.setPath("/dest/index_readableStreamTest.html");
			return readerWriters.dest.write(newResource);
		}).then(() => {
			assert.fileEqual("./test/tmp/readerWriters/application.a/index_readableStreamTest.html",
				"./test/fixtures/application.a/webapp/index.html");
		}));
});

test("FS RL: GLOB resources from application.a w/ virtual base path prefix", (t) => {
	const readerWriters = t.context.readerWriters;
	// Get resource from one readerWriter
	return t.notThrows(readerWriters.source.byGlob("/app/**/*.html").then(function(resources) {
		t.deepEqual(resources.length, 1, "Found exactly one resource");
	}));
});

test("FS RL: GLOB resources from application.a w/o virtual base path prefix", (t) => {
	const readerWriters = t.context.readerWriters;
	// Get resource from one readerWriter
	return t.notThrows(readerWriters.source.byGlob("/**/*.html").then(function(resources) {
		t.deepEqual(resources.length, 1, "Found exactly one resource");
	}));
});

test("Virtual RL: GLOB resources from application.a w/ virtual base path prefix", (t) => {
	const readerWriter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const resource = ui5Fs.resourceFactory.createResource({
		path: "/app/index.html",
		string: "test"
	});

	// Get resource from one readerWriter
	return t.notThrows(readerWriter.write(resource)
		.then(() => readerWriter.byGlob("/app/*.html"))
		.then((resources) => {
			t.deepEqual(resources.length, 1, "Found exactly one resource");
		})
	);
});

test("Virtual RL: GLOB resources from application.a w/o virtual base path prefix", (t) => {
	const readerWriter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	const resource = ui5Fs.resourceFactory.createResource({
		path: "/app/index.html",
		string: "test"
	});

	// Get resource from one readerWriter
	return t.notThrows(readerWriter.write(resource)
		.then(() => readerWriter.byGlob("/**/*.html"))
		.then((resources) => {
			t.deepEqual(resources.length, 1, "Found exactly one resource");
		})
	);
});

test("Virtual RL: GLOB virtual directory w/o virtual base path prefix", (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	// TODO: Also add tests for nodir: true option
	const readerWriter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	// Get resource from one readerWriter
	return t.notThrows(
		readerWriter.byGlob("/*", {nodir: false})
			.then((resources) => {
				t.deepEqual(resources.length, 1, "Found exactly one resource");
			})
	);
});
