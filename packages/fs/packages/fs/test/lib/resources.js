const test = require("ava");
const chai = require("chai");
const path = require("path");
chai.use(require("chai-fs"));
const assert = chai.assert;
const sinon = require("sinon");

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

test("createCollectionsForTree: high level test", (t) => {
	// Creates resource reader collections for a given tree
	const resourceReaders = ui5Fs.resourceFactory.createCollectionsForTree(applicationBTree);

	// Check whether resulting object contains both,
	// resource readers for the application source itself and for its dependencies.
	t.true(resourceReaders.hasOwnProperty("source"), "Contains readers for the application code");
	t.true(resourceReaders.hasOwnProperty("dependencies"), "Contains readers for the application's dependencies");

	t.true(resourceReaders.source._readers.length === 1, "One reader for the application code");
	t.true(resourceReaders.dependencies._readers.length === 8, "Eight readers for the application's dependencies");
});

test.serial("createCollectionsForTree", (t) => {
	const createFsAdapterForVirtualBasePathSpy = sinon.spy(ui5Fs.resourceFactory, "_createFsAdapterForVirtualBasePath");

	const getVirtualBasePathPrefixCallback = function() {};
	const getProjectExcludesCallback = function() {};

	const libraryDMemoryAdapter = ui5Fs.resourceFactory.createAdapter({
		virBasePath: "/"
	});
	// Creates resource reader collections for a given tree
	const resourceReaders = ui5Fs.resourceFactory.createCollectionsForTree(applicationBTree, {
		getVirtualBasePathPrefix: getVirtualBasePathPrefixCallback,
		getProjectExcludes: getProjectExcludesCallback,
		virtualReaders: {
			"library.d": libraryDMemoryAdapter
		}
	});

	t.deepEqual(createFsAdapterForVirtualBasePathSpy.callCount, 9,
		"createFsAdapterForVirtualBasePath got called nine times");

	t.deepEqual(resourceReaders.source._readers.length, 1, "One reader for the application code");
	t.deepEqual(resourceReaders.dependencies._readers.length, 7,
		"Seven readers for the application's dependencies on top level");
	t.deepEqual(resourceReaders.dependencies._readers[0]._readers.length, 3,
		"First dependency reader is a (prioritized) collection of three readers");
	t.is(resourceReaders.dependencies._readers[0]._readers[0], libraryDMemoryAdapter,
		"First reader of that collection is the supplied memory reader");

	const firstCall = createFsAdapterForVirtualBasePathSpy.getCall(0).args[0];
	t.is(firstCall.project, applicationBTree,
		"First createAdapter call: Correct project supplied");
	t.deepEqual(firstCall.virBasePath, "/",
		"First createAdapter call: Correct virBasePath supplied");
	t.is(firstCall.getProjectExcludes, getProjectExcludesCallback,
		"First createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(firstCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"First createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const secondCall = createFsAdapterForVirtualBasePathSpy.getCall(1).args[0];
	t.is(secondCall.project, applicationBTree.dependencies[0],
		"second createAdapter call: Correct project supplied");
	t.deepEqual(secondCall.virBasePath, "/resources/",
		"second createAdapter call: Correct virBasePath supplied");
	t.is(secondCall.getProjectExcludes, getProjectExcludesCallback,
		"second createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(secondCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"second createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const thirdCall = createFsAdapterForVirtualBasePathSpy.getCall(2).args[0];
	t.is(thirdCall.project, applicationBTree.dependencies[0],
		"third createAdapter call: Correct project supplied");
	t.deepEqual(thirdCall.virBasePath, "/test-resources/",
		"third createAdapter call: Correct virBasePath supplied");
	t.is(thirdCall.getProjectExcludes, getProjectExcludesCallback,
		"third createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(thirdCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"third createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const fourthCall = createFsAdapterForVirtualBasePathSpy.getCall(3).args[0];
	t.is(fourthCall.project, applicationBTree.dependencies[1],
		"fourth createAdapter call: Correct project supplied");
	t.deepEqual(fourthCall.virBasePath, "/resources/",
		"fourth createAdapter call: Correct virBasePath supplied");
	t.is(fourthCall.getProjectExcludes, getProjectExcludesCallback,
		"fourth createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(fourthCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"fourth createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const fifthCall = createFsAdapterForVirtualBasePathSpy.getCall(4).args[0];
	t.is(fifthCall.project, applicationBTree.dependencies[1],
		"fifth createAdapter call: Correct project supplied");
	t.deepEqual(fifthCall.virBasePath, "/test-resources/",
		"fifth createAdapter call: Correct virBasePath supplied");
	t.is(fifthCall.getProjectExcludes, getProjectExcludesCallback,
		"fifth createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(fifthCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"fifth createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const sixthCall = createFsAdapterForVirtualBasePathSpy.getCall(5).args[0];
	t.is(sixthCall.project, applicationBTree.dependencies[2],
		"sixth createAdapter call: Correct project supplied");
	t.deepEqual(sixthCall.virBasePath, "/resources/",
		"sixth createAdapter call: Correct virBasePath supplied");
	t.is(sixthCall.getProjectExcludes, getProjectExcludesCallback,
		"sixth createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(sixthCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"sixth createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const seventhCall = createFsAdapterForVirtualBasePathSpy.getCall(6).args[0];
	t.is(seventhCall.project, applicationBTree.dependencies[2],
		"seventh createAdapter call: Correct project supplied");
	t.deepEqual(seventhCall.virBasePath, "/test-resources/",
		"seventh createAdapter call: Correct virBasePath supplied");
	t.is(seventhCall.getProjectExcludes, getProjectExcludesCallback,
		"seventh createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(seventhCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"seventh createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const eightCall = createFsAdapterForVirtualBasePathSpy.getCall(7).args[0];
	t.is(eightCall.project, applicationBTree.dependencies[3],
		"eight createAdapter call: Correct project supplied");
	t.deepEqual(eightCall.virBasePath, "/resources/",
		"eight createAdapter call: Correct virBasePath supplied");
	t.is(eightCall.getProjectExcludes, getProjectExcludesCallback,
		"eight createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(eightCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"eight createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");

	const ninthCall = createFsAdapterForVirtualBasePathSpy.getCall(8).args[0];
	t.is(ninthCall.project, applicationBTree.dependencies[3],
		"ninth createAdapter call: Correct project supplied");
	t.deepEqual(ninthCall.virBasePath, "/test-resources/",
		"ninth createAdapter call: Correct virBasePath supplied");
	t.is(ninthCall.getProjectExcludes, getProjectExcludesCallback,
		"ninth createAdapter call: Correct getProjectExcludes parameter supplied");
	t.is(ninthCall.getVirtualBasePathPrefix, getVirtualBasePathPrefixCallback,
		"ninth createAdapter call: Correct getVirtualBasePathPrefix parameter supplied");
});

test.serial("createCollectionsForTree/createFsAdapterForVirtualBasePath with excludes", (t) => {
	const createAdapterSpy = sinon.spy(ui5Fs.resourceFactory, "createAdapter");
	ui5Fs.resourceFactory.createCollectionsForTree(applicationBTreeWithExcludes, {
		getProjectExcludes: (proj) => {
			return proj.pony.excludes;
		}
	});

	t.deepEqual(createAdapterSpy.callCount, 5, "createAdapter got called three times");

	const firstCall = createAdapterSpy.getCall(0).args[0];
	t.deepEqual(firstCall.fsBasePath, path.join(applicationBPath, "webapp"),
		"First createAdapter call: Correct base path supplied");
	t.deepEqual(firstCall.excludes, ["/pony-path/*"],
		"First createAdapter call: Correct exclude patterns supplied");

	const secondCall = createAdapterSpy.getCall(1).args[0];
	t.deepEqual(secondCall.fsBasePath,
		path.join(applicationBPath, "..", "library.d", "main", "src"),
		"Second createAdapter call: Correct base path supplied");
	t.deepEqual(secondCall.excludes, [
		"/unicorn-path/*",
		"/duck-path/*"
	],
	"Second createAdapter call: Correct exclude patterns supplied");

	const thirdCall = createAdapterSpy.getCall(2).args[0];
	t.deepEqual(thirdCall.fsBasePath,
		path.join(applicationBPath, "..", "library.d", "main", "test"),
		"Third createAdapter call: Correct base path supplied");
	t.deepEqual(thirdCall.excludes, [
		"/unicorn-path/*",
		"/duck-path/*"
	],
	"Third createAdapter call: Correct exclude patterns supplied");

	const fourthCall = createAdapterSpy.getCall(3).args[0];
	t.deepEqual(fourthCall.fsBasePath,
		path.join(applicationBPath, "..", "collection", "library.a", "src"),
		"Fourth createAdapter call: Correct base path supplied");
	t.deepEqual(fourthCall.excludes, ["/duck-path/*"],
		"Fourth createAdapter call: Correct exclude patterns supplied");

	const fifthCall = createAdapterSpy.getCall(4).args[0];
	t.deepEqual(fifthCall.fsBasePath,
		path.join(applicationBPath, "..", "collection", "library.a", "test"),
		"Fifth createAdapter call: Correct base path supplied");
	t.deepEqual(fifthCall.excludes, ["/duck-path/*"],
		"Fifth createAdapter call: Correct exclude patterns supplied");
});

test.serial("_createFsAdapterForVirtualBasePath: application with virtual base path prefixing", (t) => {
	const getVirtualBasePathPrefixStub = sinon.stub().returns("/pony/path");
	const createAdapterSpy = sinon.spy(ui5Fs.resourceFactory, "createAdapter");

	const fsAdapter = ui5Fs.resourceFactory._createFsAdapterForVirtualBasePath({
		project: applicationBTreeWithExcludes,
		virBasePath: "/",
		getVirtualBasePathPrefix: getVirtualBasePathPrefixStub,
		getProjectExcludes: () => {
			return [
				"{/sub-directory-1/,/sub-directory-2/}**",
				"/pony-path/**",
				"!/duck*path/**",
				"!**.json"
			];
		}
	});

	t.deepEqual(getVirtualBasePathPrefixStub.callCount, 1,
		"getVirtualBasePathPrefix callback called once");
	t.deepEqual(getVirtualBasePathPrefixStub.getCall(0).args[0].project.id, "application.b",
		"getVirtualBasePathPrefix callback called with correct project");
	t.deepEqual(getVirtualBasePathPrefixStub.getCall(0).args[0].virBasePath, "/",
		"getVirtualBasePathPrefix callback called with correct virtual base path");

	t.deepEqual(createAdapterSpy.callCount, 1, "createAdapter got called one time");
	const firstCall = createAdapterSpy.getCall(0).args[0];
	t.deepEqual(firstCall.fsBasePath, path.join(applicationBPath, "webapp"),
		"First createAdapter call: Correct base path supplied");
	t.deepEqual(firstCall.excludes, [
		"/pony/path/sub-directory-1/**",
		"/pony/path/sub-directory-2/**",
		"/pony/path/pony-path/**",
		"!/pony/path/duck*path/**",
		"!/pony/path/**.json"
	],
	"First createAdapter call: Correct exclude patterns supplied");

	t.deepEqual(fsAdapter._fsBasePath, path.join(applicationBPath, "webapp"), "Returned an FS adapter");
});

test.serial("_createFsAdapterForVirtualBasePath: library", (t) => {
	const createAdapterSpy = sinon.spy(ui5Fs.resourceFactory, "createAdapter");

	const fsAdapter = ui5Fs.resourceFactory._createFsAdapterForVirtualBasePath({
		project: libraryDTree,
		virBasePath: "/resources/",
		getProjectExcludes: () => {
			return [
				"/resources/library/d/{sub-directory-1/,sub-directory-2/}**",
				"/resources/library/d/pony-path/**",
				"!/resources/library/d/duck*path/**",
				"!/resources/library/d/**.json"
			];
		}
	});

	t.deepEqual(createAdapterSpy.callCount, 1, "createAdapter got called one time");
	const firstCall = createAdapterSpy.getCall(0).args[0];
	t.deepEqual(firstCall.fsBasePath, path.join(libraryDTree.path, "main/src"),
		"First createAdapter call: Correct base path supplied");
	t.deepEqual(firstCall.excludes, [
		// Since no virtual base path prefixing was done, no special processing
		//	of exclude patterns was necessary
		"/resources/library/d/{sub-directory-1/,sub-directory-2/}**",
		"/resources/library/d/pony-path/**",
		"!/resources/library/d/duck*path/**",
		"!/resources/library/d/**.json"
	],
	"First createAdapter call: Correct exclude patterns supplied");

	t.deepEqual(fsAdapter._fsBasePath, path.join(libraryDTree.path, "main/src"), "Returned an FS adapter");
});

test("_prefixGlobPattern", (t) => {
	t.deepEqual(
		ui5Fs.resourceFactory._prefixGlobPattern("{/sub-directory-1/,/sub-directory-2/}**", "/pony/path/a"),
		[
			"/pony/path/a/sub-directory-1/**",
			"/pony/path/a/sub-directory-2/**"
		],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory._prefixGlobPattern("/pony-path/**", "/pony/path/a"),
		["/pony/path/a/pony-path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory._prefixGlobPattern("!/duck*path/**", "/pony/path/a"),
		["!/pony/path/a/duck*path/**"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory._prefixGlobPattern("!**.json", "/pony/path/a"),
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory._prefixGlobPattern("!**.json", "/pony/path/a/"), // trailing slash
		["!/pony/path/a/**.json"],
		"GLOBs correctly prefixed");

	t.deepEqual(
		ui5Fs.resourceFactory._prefixGlobPattern("pony-path/**", "/pony/path/a/"), // trailing slash
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
