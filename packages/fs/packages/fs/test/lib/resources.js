const {test} = require("ava");
const chai = require("chai");
const path = require("path");
chai.use(require("chai-fs"));
const assert = chai.assert;

const ui5Fs = require("../../");

const applicationBPath = path.join(__dirname, "..", "fixtures", "application.b");
const applicationBTree = {
	"id": "application.b",
	"version": "1.0.0",
	"path": applicationBPath,
	"dependencies": [
		{
			"id": "library.d",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "node_modules", "library.d"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.d",
				"copyright": "Some fancy copyright"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "main/src",
						"test": "main/test"
					}
				},
				"pathMappings": {
					"/resources/": "main/src",
					"/test-resources/": "main/test"
				}
			}
		},
		{
			"id": "library.a",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "node_modules", "collection", "library.a"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.a",
				"copyright": "${copyright}"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		},
		{
			"id": "library.b",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "node_modules", "collection", "library.b"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.b",
				"copyright": "${copyright}"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		},
		{
			"id": "library.c",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "node_modules", "collection", "library.c"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.c",
				"copyright": "${copyright}"
			},
			"resources": {
				"configuration": {
					"paths": {
						"src": "src",
						"test": "test"
					}
				},
				"pathMappings": {
					"/resources/": "src",
					"/test-resources/": "test"
				}
			}
		}
	],
	"builder": {},
	"_level": 0,
	"specVersion": "0.1",
	"type": "application",
	"metadata": {
		"name": "application.b",
		"namespace": "id1"
	},
	"resources": {
		"configuration": {
			"paths": {
				"webapp": "webapp"
			}
		},
		"pathMappings": {
			"/": "webapp"
		}
	}
};

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

test("Virtual RL: GLOB virtual directory w/ virtual base path prefix", (t) => {
	// TODO: Add similar test (globbing on empty directory) for FS RL
	const readerWriter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/app/one/two/"
	});

	// Get resource from one readerWriter
	return t.notThrows(
		readerWriter.byGlob("/*", {nodir: false})
			.then((resources) => {
				t.deepEqual(resources.length, 1, "Found exactly one resource");
			})
	);
});

test("Virtual RL: GLOB virtual directory w/o virtual base path prefix and nodir: true", (t) => {
	const readerWriter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/app/"
	});

	// Get resource from one readerWriter
	return t.notThrows(
		readerWriter.byGlob("/*", {nodir: true})
			.then((resources) => {
				t.deepEqual(resources.length, 0, "Found exactly one resource");
			})
	);
});

test("Virtual RL: GLOB virtual directory w/ virtual base path prefix and nodir: true", (t) => {
	const readerWriter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/app/one/two/"
	});

	// Get resource from one readerWriter
	return t.notThrows(
		readerWriter.byGlob("/*", {nodir: true})
			.then((resources) => {
				t.deepEqual(resources.length, 0, "Found exactly one resource");
			})
	);
});

test("createCollectionsForTree", (t) => {
	// Creates resource reader collections for a given tree
	const resourceReaders = ui5Fs.resourceFactory.createCollectionsForTree(applicationBTree);

	t.pass("Resource Readers created");

	// Check whether resulting object contains both,
	// resource readers for the application source itself and for its dependencies.
	t.true(resourceReaders.hasOwnProperty("source"), "Contains readers for the application code");
	t.true(resourceReaders.hasOwnProperty("dependencies"), "Contains readers for the application's dependencies");

	t.true(resourceReaders.source._readers.length === 1, "One reader for the application code");
	t.true(resourceReaders.dependencies._readers.length === 8, "Eight readers for the application's dependencies");
});
