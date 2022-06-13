const test = require("ava");
const chai = require("chai");
chai.use(require("chai-fs"));
const assert = chai.assert;
const sinon = require("sinon");

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

test.afterEach.always((t) => {
	sinon.restore();
});

/* BEWARE:
	Always make sure that every test writes to a separate file! By default, tests are running concurrent.
*/
test("Get resource from application.a (/index.html) and write it to /dest/ using a ReadableStream", (t) => {
	const readerWriters = t.context.readerWriters;
	// Get resource from one readerWriter
	return t.notThrowsAsync(readerWriters.source.byPath("/app/index.html")
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

test("prefixGlobPattern", (t) => {
	t.deepEqual(
		ui5Fs.resourceFactory.prefixGlobPattern("{/sub-directory-1/,/sub-directory-2/}**", "/pony/path/a"),
		[
			"/pony/path/a/sub-directory-1/**",
			"/pony/path/a/sub-directory-2/**"
		],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory.prefixGlobPattern("/pony-path/**", "/pony/path/a"),
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory.prefixGlobPattern("!/duck*path/**", "/pony/path/a"),
		["!/pony/path/a/duck*path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory.prefixGlobPattern("!**.json", "/pony/path/a"),
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory.prefixGlobPattern("!**.json", "/pony/path/a/"), // trailing slash
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory.prefixGlobPattern("pony-path/**", "/pony/path/a/"), // trailing slash
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");
});
