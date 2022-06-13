const test = require("ava");
const chai = require("chai");
const path = require("path");
chai.use(require("chai-fs"));
const assert = chai.assert;
const sinon = require("sinon");
const hasOwnProperty = Object.prototype.hasOwnProperty;

const ui5Fs = require("../../");
const applicationBPath = path.join(__dirname, "..", "fixtures", "application.b");

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

/* Test data */
const applicationBTree = {
	"id": "application.b",
	"version": "1.0.0",
	"path": applicationBPath,
	"dependencies": [
		{
			"id": "library.d",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "..", "library.d"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.d",
				"namespace": "library/d",
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
			"path": path.join(applicationBPath, "..", "collection", "library.a"),
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
			"path": path.join(applicationBPath, "..", "collection", "library.b"),
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
			"path": path.join(applicationBPath, "..", "collection", "library.c"),
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
	"_isRoot": true,
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

const libraryDTree = applicationBTree.dependencies[0];

const applicationBTreeWithExcludes = {
	"id": "application.b",
	"version": "1.0.0",
	"path": applicationBPath,
	"dependencies": [
		{
			"id": "library.d",
			"version": "1.0.0",
			"path": path.join(applicationBPath, "..", "library.d"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.d",
				"copyright": "Some fancy copyright"
			},
			"pony": {
				"excludes": [
					"/unicorn-path/*",
					"/duck-path/*"
				]
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
			"path": path.join(applicationBPath, "..", "collection", "library.a"),
			"dependencies": [],
			"_level": 1,
			"specVersion": "0.1",
			"type": "library",
			"metadata": {
				"name": "library.a",
				"copyright": "${copyright}"
			},
			"pony": {
				"excludes": [
					"/duck-path/*"
				]
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
	],
	"pony": {
		"excludes": [
			"/pony-path/*"
		]
	},
	"_level": 0,
	"_isRoot": true,
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
