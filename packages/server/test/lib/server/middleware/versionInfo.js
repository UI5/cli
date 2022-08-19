const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const resourceFactory = require("@ui5/fs").resourceFactory;
let versionInfoMiddleware = require("../../../../lib/middleware/versionInfo");

function createWorkspace() {
	return resourceFactory.createAdapter({
		virBasePath: "/",
		project: createProjectMetadata(["test", "lib"])
	});
}

const projectCache = {};

/**
 *
 * @param {string[]} names e.g. ["lib", "a"]
 * @param {string} [version="3.0.0-<library name>"] Project version
 * @returns {object} Project mock
 */
const createProjectMetadata = (names, version) => {
	const key = names.join(".");

	// Cache projects in order to return same object instance
	// AbstractAdapter will compare the project instances of the adapter
	// to the resource and denies a write if they don't match
	if (projectCache[key]) {
		return projectCache[key];
	}
	return projectCache[key] = {
		getName: () => key,
		getNamespace: () => names.join("/"),
		getVersion: () => version || "3.0.0-" + key
	};
};

/**
 * @param {module:@ui5/fs.DuplexCollection} dependencies
 * @param {module:@ui5/fs.resourceFactory} resourceFactory
 * @param {string[]} names e.g. ["lib", "a"]
 * @param {string} version Project version to write into to the .library
 * @returns {Promise<void>}
 */
async function createDotLibrary(dependencies, resourceFactory, names, version) {
	const versionTag = version ? `<version>${version}</version>` : "";
	await dependencies.write(resourceFactory.createResource({
		path: `/resources/${names.join("/")}/.library`,
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
				<name>${names.join(".")}</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				${versionTag}

				<documentation>Library ${names.slice(1).join(".").toUpperCase()}</documentation>
			</library>
		`
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
		string: JSON.stringify(content, null, 2)
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

function createDepWorkspace(names, oOptions = {
	virBasePath: "/resources"
}) {
	oOptions = Object.assign(oOptions, {
		project: createProjectMetadata(names)
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

	const dependenciesA = createDepWorkspace(["lib", "a"], {virBasePath: "/"});
	const dependenciesB = createDepWorkspace(["lib", "b"], {virBasePath: "/"});
	const dependenciesC = createDepWorkspace(["lib", "c"], {virBasePath: "/"});
	// create lib.a without manifest
	await createDotLibrary(dependenciesA, resourceFactory, ["lib", "a"], [{name: "lib.b"}, {name: "lib.c"}]);
	// create lib.b with manifest: no manifestCreator call expected
	await createResources(dependenciesB, resourceFactory, ["lib", "b"], []);
	// create lib.c without manifest but with dummy files
	await createDotLibrary(dependenciesC, resourceFactory, ["lib", "c"]);
	[
		// relevant file extensions for manifest creation
		"js", "json", "less", "css", "theming", "theme", "properties",
		// other file extensions are irrelevant
		"html", "txt", "ts"
	].forEach(async (extension) => {
		await dependenciesC.write(resourceFactory.createResource({path: `/resources/lib/c/foo.${extension}`}));
	});

	const resources = {
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC]
		})
	};
	const graph = {
		getRoot: () => createProjectMetadata(["myname"], "1.33.7"),
		getProject: (projectName) => {
			if (projectName === "my.project") {
				return {
					getVersion: () => "project version"
				};
			}
			return null;
		}
	};
	const middleware = versionInfoMiddleware({resources, graph});

	const endStub = sinon.stub();
	await middleware(
		/* req */ undefined,
		/* res */ {writeHead: function() {}, end: endStub},
		/* next */ function(err) {
			throw err;
		});

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
	const projectVersion1 = manifestCreatorStub.getCall(0).args[0].getProjectVersion("my.project");
	t.is(projectVersion1, "project version", "getProjectVersion callback returned expected project version");
	const projectVersion2 = manifestCreatorStub.getCall(1).args[0].getProjectVersion("my.other.project");
	t.is(projectVersion2, undefined, "getProjectVersion callback returned no version of unknown project");

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
	t.is(endStub.getCall(0).args[0], "stubbed version info");
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
	const dependenciesA = createDepWorkspace(["lib", "a"], {virBasePath: "/"});
	const dependenciesB = createDepWorkspace(["lib", "b"], {virBasePath: "/"});
	const dependenciesC = createDepWorkspace(["lib", "c"], {virBasePath: "/"});
	const dependenciesD = createDepWorkspace(["lib", "d"], {virBasePath: "/"});
	const dependenciesE = createDepWorkspace(["lib", "e"], {virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependenciesA, resourceFactory, ["lib", "a"], [{name: "lib.b"}, {name: "lib.c"}], embeds);
	// sub
	await createManifestResource(dependenciesA, resourceFactory, ["lib", "a", "sub", "fold"], [{name: "lib.c"}]);

	// lib.b
	await createResources(dependenciesB, resourceFactory, ["lib", "b"], [{name: "lib.c", lazy: true}]);

	// lib.c
	await createResources(dependenciesC, resourceFactory, ["lib", "c"], [{name: "lib.d"}, {name: "lib.e", lazy: true}]);

	// lib.d
	await createResources(dependenciesD, resourceFactory, ["lib", "d"], [{name: "lib.e"}]);

	// lib.e
	await createResources(dependenciesE, resourceFactory, ["lib", "e"], []);

	// create middleware
	const resources = {
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC, dependenciesD, dependenciesE]
		})
	};

	const graph = {
		getRoot: () => createProjectMetadata(["myname"], "1.33.7")
	};
	const middleware = versionInfoMiddleware({resources, graph});

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
			"version": "3.0.0-lib.a",
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
			"version": "3.0.0-lib.b",
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
			"version": "3.0.0-lib.c",
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
			"version": "3.0.0-lib.d",
		},
		{
			"name": "lib.e",
			"scmRevision": "",
			"version": "3.0.0-lib.e",
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
	const next = function(err) {
		throw err;
	};

	await middleware(undefined, res, next);
});
