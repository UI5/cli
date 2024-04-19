import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import * as resourceFactory from "@ui5/fs/resourceFactory";

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
		getVersion: () => version || "3.0.0-" + key,
	};
};

/**
 * @param {module:@ui5/fs/DuplexCollection} dependencies
 * @param {module:@ui5/fs/resourceFactory} resourceFactory
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
 * @param {module:@ui5/fs/DuplexCollection} dependencies
 * @param {module:@ui5/fs/resourceFactory} resourceFactory
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
 * @param {module:@ui5/fs/DuplexCollection} dependencies
 * @param {module:@ui5/fs/resourceFactory} resourceFactory
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
	const project = createProjectMetadata(names);
	oOptions = Object.assign(oOptions, {
		project
	});
	const workspace = resourceFactory.createAdapter(oOptions);
	// Connect the project back to the created workspace, this allows for accessing the reader via a resources project
	project.getReader = () => workspace;
	return workspace;
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
	t.context.createVersionInfoMiddleware = async (mocks = {}) => {
		return esmock("../../../../lib/middleware/versionInfo.js", mocks);
	};
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("test all inner API calls within middleware", async (t) => {
	let manifestMockCounter = 0;
	const manifestCreatorStub = sinon.stub().callsFake(() => resourceFactory.createResource({
		path: "/stub/path",
		string: `mocked manifest.json ${++manifestMockCounter}`
	}));
	const generateLibraryManifestHelperMock = await esmock(
		"../../../../lib/middleware/helper/generateLibraryManifest.js", {
			"@ui5/builder/processors/manifestCreator": manifestCreatorStub
		});

	const mockedVersionInfo = resourceFactory.createResource({
		path: "/stub/path",
		string: "mocked version info"
	});
	const versionInfoGeneratorStub = sinon.stub().returns([mockedVersionInfo]);
	const versionInfoMiddleware = await t.context.createVersionInfoMiddleware({
		"../../../../lib/middleware/helper/generateLibraryManifest.js": generateLibraryManifestHelperMock,
		"@ui5/builder/processors/versionInfoGenerator": versionInfoGeneratorStub,
	});

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
	const middlewareUtil = {
		getProject: (projectName) => {
			if (!projectName) {
				return createProjectMetadata(["myname"], "1.33.7");
			}
			if (projectName === "my.project") {
				return {
					getVersion: () => "project version"
				};
			}
			return null;
		}
	};
	const middleware = versionInfoMiddleware({resources, middlewareUtil});

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
	t.is(await versionInfoGeneratorOptions.libraryInfos[0].libraryManifest.getString(), "mocked manifest.json 1");
	t.is(versionInfoGeneratorOptions.libraryInfos[1].name, "lib.b");
	t.is(versionInfoGeneratorOptions.libraryInfos[1].libraryManifest.getPath(), "/resources/lib/b/manifest.json");
	t.is(versionInfoGeneratorOptions.libraryInfos[2].name, "lib.c");
	t.is(await versionInfoGeneratorOptions.libraryInfos[2].libraryManifest.getString(), "mocked manifest.json 2");

	t.is(endStub.callCount, 1);
	t.is(endStub.getCall(0).args[0], "mocked version info");
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

	const middlewareUtil = {
		getProject: () => createProjectMetadata(["myname"], "1.33.7")
	};

	const versionInfoMiddleware = await t.context.createVersionInfoMiddleware();
	const middleware = versionInfoMiddleware({resources, middlewareUtil});

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
