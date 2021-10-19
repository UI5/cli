const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const resourceFactory = require("@ui5/fs").resourceFactory;
let versionInfoMiddleware = require("../../../../lib/middleware/versionInfo");

function createWorkspace() {
	return resourceFactory.createAdapter({
		virBasePath: "/",
		project: {
			metadata: {
				name: "test.lib"
			},
			version: "2.0.0",
			dependencies: [
				{
					metadata: {
						name: "sap.ui.core"
					},
					version: "1.0.0"
				}
			]
		}
	});
}

/**
 *
 * @param {string[]} names e.g. ["lib", "a"]
 * @returns {{metadata: {name, namespace}}}
 */
const createProjectMetadata = (names) => {
	return {
		metadata: {
			name: names.join("."),
			namespace: names.join("/")
		}
	};
};

/**
 * @param {module:@ui5/fs.DuplexCollection} dependencies
 * @param {module:@ui5/fs.resourceFactory} resourceFactory
 * @param {string[]} names e.g. ["lib", "a"]
 * @returns {Promise<void>}
 */
async function createDotLibrary(dependencies, resourceFactory, names) {
	await dependencies.write(resourceFactory.createResource({
		path: `/resources/${names.join("/")}/.library`,
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>${names.join(".")}</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Library ${names.slice(1).join(".").toUpperCase()}</documentation>
			</library>
		`,
		project: createProjectMetadata(names)
	}));
}

/**
 *
 * @param {module:@ui5/fs.DuplexCollection} dependencies
 * @param {module:@ui5/fs.resourceFactory} resourceFactory
 * @param {string[]} names e.g. ["lib", "a"]
 * @param {object[]} deps
 * @param {string[]} [embeds]
 * @param {string} [embeddedBy]
 * @returns {Promise<void>}
 */
const createManifestResource = async (dependencies, resourceFactory, names, deps, embeds, embeddedBy) => {
	const content = {
		"sap.app": {
			"id": names.join("."),
			"embeds": []
		},
		"sap.ui5": {
			"dependencies": {
				"minUI5Version": "1.84",
				"libs": {}
			}
		}
	};

	const libs = {};
	deps.forEach((dep) => {
		libs[dep.name] = {
			"minVersion": "1.84.0"
		};
		if (dep.lazy) {
			libs[dep.name].lazy = true;
		}
	});
	content["sap.ui5"]["dependencies"]["libs"] = libs;
	if (embeds !== undefined) {
		content["sap.app"]["embeds"] = embeds;
	}
	if (embeddedBy !== undefined) {
		content["sap.app"]["embeddedBy"] = embeddedBy;
	}
	await dependencies.write(resourceFactory.createResource({
		path: `/resources/${names.join("/")}/manifest.json`,
		string: JSON.stringify(content, null, 2),
		project: createProjectMetadata(names)
	}));
};

/**
 *
 * @param {module:@ui5/fs.DuplexCollection} dependencies
 * @param {module:@ui5/fs.resourceFactory} resourceFactory
 * @param {string[]} names e.g. ["lib", "a"]
 * @param {object[]} deps
 * @param {string[]} [embeds]
 */
const createResources = async (dependencies, resourceFactory, names, deps, embeds) => {
	await createDotLibrary(dependencies, resourceFactory, names);
	await createManifestResource(dependencies, resourceFactory, names, deps, embeds);
};

function createDependencies(oOptions = {
	virBasePath: "/resources"
}) {
	oOptions = Object.assign(oOptions, {
		project: {
			metadata: {
				name: "test.lib3"
			},
			version: "3.0.0"}
	});
	return resourceFactory.createAdapter(oOptions);
}

async function assertCreatedVersionInfo(t, expectedVersionInfo, versionInfoContent) {
	const currentVersionInfo = JSON.parse(versionInfoContent);

	t.is(currentVersionInfo.buildTimestamp.length, 12, "Timestamp should have length of 12 (yyyyMMddHHmm)");

	delete currentVersionInfo.buildTimestamp; // removing to allow deep comparison
	currentVersionInfo.libraries.forEach((lib) => {
		t.is(lib.buildTimestamp.length, 12, "Timestamp should have length of 12 (yyyyMMddHHmm)");
		delete lib.buildTimestamp; // removing to allow deep comparison
	});

	currentVersionInfo.libraries.sort((libraryA, libraryB) => {
		return libraryA.name.localeCompare(libraryB.name);
	});

	t.deepEqual(currentVersionInfo, expectedVersionInfo, "Correct content");
}

test.beforeEach((t) => {
	versionInfoMiddleware = mock.reRequire("../../../../lib/middleware/versionInfo");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("test all inner API calls within middleware", async (t) => {
	let stubCount = 0;
	const manifestCreatorStub = sinon.stub().callsFake(() => `stubbed manifest ${stubCount++}`);
	const dummyVersionInfo = resourceFactory.createResource({
		path: "/dummy/path",
		string: "stubbed version info"
	});
	const versionInfoGeneratorStub = sinon.stub().returns([dummyVersionInfo]);
	mock("@ui5/builder", {
		processors: {
			manifestCreator: manifestCreatorStub,
			versionInfoGenerator: versionInfoGeneratorStub
		}
	});
	versionInfoMiddleware = mock.reRequire("../../../../lib/middleware/versionInfo");

	const dependencies = createDependencies({virBasePath: "/"});
	// create lib.a without manifest
	await createDotLibrary(dependencies, resourceFactory, ["lib", "a"], [{name: "lib.b"}, {name: "lib.c"}]);
	// create lib.b with manifest: no manifestCreator call expected
	await createResources(dependencies, resourceFactory, ["lib", "b"], []);
	// create lib.c without manifest but with dummy files
	await createDotLibrary(dependencies, resourceFactory, ["lib", "c"]);
	[
		// relevant file extensions for manifest creation
		"js", "json", "less", "css", "theming", "theme", "properties",
		// other file extensions are irrelevant
		"html", "txt", "ts"
	].forEach(async (extension) => {
		await dependencies.write(resourceFactory.createResource({path: `/resources/lib/c/foo.${extension}`}));
	});

	const resources = {dependencies};
	const tree = {
		metadata: {
			name: "myname"
		},
		version: "1.33.7"
	};
	const middleware = versionInfoMiddleware({resources, tree});

	const endStub = sinon.stub();
	await middleware(
		/* req */ undefined,
		/* res */ {writeHead: function() {}, end: endStub},
		/* next */ function() {});

	t.is(manifestCreatorStub.callCount, 2);
	t.is(manifestCreatorStub.getCall(0).args[0].libraryResource.getPath(), "/resources/lib/a/.library");
	t.is(manifestCreatorStub.getCall(1).args[0].libraryResource.getPath(), "/resources/lib/c/.library");
	t.is(manifestCreatorStub.getCall(0).args[0].namespace, "lib/a");
	t.is(manifestCreatorStub.getCall(1).args[0].namespace, "lib/c");
	t.deepEqual(
		manifestCreatorStub.getCall(0).args[0].resources.map((resource) => resource.getPath()),
		["/resources/lib/a/.library"]);
	t.deepEqual(
		manifestCreatorStub.getCall(1).args[0].resources.map((resource) => resource.getPath()).sort(),
		[
			"/resources/lib/c/.library",
			"/resources/lib/c/foo.css",
			"/resources/lib/c/foo.js",
			"/resources/lib/c/foo.json",
			"/resources/lib/c/foo.less",
			"/resources/lib/c/foo.properties",
			"/resources/lib/c/foo.theme",
			"/resources/lib/c/foo.theming"
		]);
	t.deepEqual(manifestCreatorStub.getCall(0).args[0].options, {omitMinVersions: true});
	t.deepEqual(manifestCreatorStub.getCall(1).args[0].options, {omitMinVersions: true});

	t.is(versionInfoGeneratorStub.callCount, 1);
	const versionInfoGeneratorOptions = versionInfoGeneratorStub.getCall(0).args[0].options;
	t.is(versionInfoGeneratorOptions.rootProjectName, "myname");
	t.is(versionInfoGeneratorOptions.rootProjectVersion, "1.33.7");
	t.is(versionInfoGeneratorOptions.libraryInfos.length, 3);
	t.is(versionInfoGeneratorOptions.libraryInfos[0].name, "lib.a");
	t.is(versionInfoGeneratorOptions.libraryInfos[0].libraryManifest, "stubbed manifest 0");
	t.is(versionInfoGeneratorOptions.libraryInfos[1].name, "lib.b");
	t.is(versionInfoGeneratorOptions.libraryInfos[1].libraryManifest.getPath(), "/resources/lib/b/manifest.json");
	t.is(versionInfoGeneratorOptions.libraryInfos[2].name, "lib.c");
	t.is(versionInfoGeneratorOptions.libraryInfos[2].libraryManifest, "stubbed manifest 1");

	t.is(endStub.callCount, 1);
	t.deepEqual(endStub.getCall(0).args[0], "stubbed version info");
});

// test case taken from: ui5-builder/test/lib/tasks/generateVersionInfo.js
test.serial("integration: Library with dependencies and subcomponent complex scenario", async (t) => {
	const workspace = createWorkspace();
	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// input
	// lib.a => lib.b, lib.c
	// lib.b => lib.c (true)
	// lib.c => lib.d, lib.e (true)
	// lib.d => lib.e
	// lib.e =>
	// lib.a.sub.fold => lib.c

	// expected outcome
	// lib.a => lib.b, lib.c, lib.d, lib.e
	// lib.b => lib.c (true), lib.d (true), lib.e (true)
	// lib.c => lib.d, lib.e
	// lib.d => lib.e
	// lib.e =>
	// lib.a.sub.fold => lib.c, lib.d, lib.e

	// dependencies
	const dependencies = createDependencies({virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependencies, resourceFactory, ["lib", "a"], [{name: "lib.b"}, {name: "lib.c"}], embeds);
	// sub
	await createManifestResource(dependencies, resourceFactory, ["lib", "a", "sub", "fold"], [{name: "lib.c"}]);

	// lib.b
	await createResources(dependencies, resourceFactory, ["lib", "b"], [{name: "lib.c", lazy: true}]);

	// lib.c
	await createResources(dependencies, resourceFactory, ["lib", "c"], [{name: "lib.d"}, {name: "lib.e", lazy: true}]);

	// lib.d
	await createResources(dependencies, resourceFactory, ["lib", "d"], [{name: "lib.e"}]);

	// lib.e
	await createResources(dependencies, resourceFactory, ["lib", "e"], []);

	// create middleware
	const resources = {dependencies};
	const tree = {
		metadata: {
			name: "myname"
		},
		version: "1.33.7"
	};
	const middleware = versionInfoMiddleware({resources, tree});

	const expectedVersionInfo = {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.b": {},
						"lib.c": {},
						"lib.d": {},
						"lib.e": {}
					}
				}
			},
		},
		{
			"name": "lib.b",
			"scmRevision": "",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.c": {
							"lazy": true
						},
						"lib.d": {
							"lazy": true
						},
						"lib.e": {
							"lazy": true
						}
					}
				}
			},
		},
		{
			"name": "lib.c",
			"scmRevision": "",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.d": {},
						"lib.e": {}
					}
				}
			},
		},
		{
			"name": "lib.d",
			"scmRevision": "",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.e": {}
					}
				}
			},
		},
		{
			"name": "lib.e",
			"scmRevision": "",
		}],
		"components": {
			"lib.a.sub.fold": {
				"hasOwnPreload": true,
				"library": "lib.a",
				"manifestHints": {
					"dependencies": {
						"libs": {
							"lib.c": {},
							"lib.d": {},
							"lib.e": {}
						}
					}
				}
			}
		},
	};

	const res = {
		writeHead: function() {},
		end: async function(versionInfoContent) {
			await assertCreatedVersionInfo(t, expectedVersionInfo, versionInfoContent);
		}
	};
	const next = function() {
		t.fail("should not be called.");
	};

	await middleware(undefined, res, next);
});
