import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as resourceFactory from "@ui5/fs/resourceFactory";
import sinon from "sinon";
import esmock from "esmock";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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


function createWorkspace() {
	return resourceFactory.createAdapter({
		virBasePath: "/",
		project: createProjectMetadata(["test", "lib"], "2.0.0")
	});
}

function createDependencies(oOptions = {
	virBasePath: "/resources/",
	fsBasePath: path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-evo", "main", "src")
}) {
	oOptions = Object.assign(oOptions, {
		project: createProjectMetadata(["test", "lib3"], "3.0.0")
	});
	return resourceFactory.createAdapter(oOptions);
}

async function createOptions(t, options) {
	const {workspace, dependencies, resources} = t.context;

	await Promise.all(resources.map((resource) => workspace.write(resource)));
	const oOptions = {
		workspace,
		dependencies
	};
	oOptions.options = options || {
		projectName: "Test Lib",
		pattern: "/**/*.js",
		rootProject: createProjectMetadata(["myname"], "1.33.7")
	};
	return oOptions;
}

async function assertCreatedVersionInfo(t, oExpectedVersionInfo, oOptions) {
	const {generateVersionInfo} = t.context;

	await generateVersionInfo(oOptions);

	const resource = await oOptions.workspace.byPath("/resources/sap-ui-version.json");
	if (!resource) {
		t.fail("Could not find /resources/sap-ui-version.json in target");
		return;
	}

	const buffer = await resource.getBuffer();
	const currentVersionInfo = JSON.parse(buffer);

	t.is(currentVersionInfo.buildTimestamp.length, 12, "Timestamp should have length of 12 (yyyyMMddHHmm)");

	delete currentVersionInfo.buildTimestamp; // removing to allow deep comparison
	currentVersionInfo.libraries.forEach((lib) => {
		t.is(lib.buildTimestamp.length, 12, "Timestamp should have length of 12 (yyyyMMddHHmm)");
		delete lib.buildTimestamp; // removing to allow deep comparison
	});

	currentVersionInfo.libraries.sort((libraryA, libraryB) => {
		return libraryA.name.localeCompare(libraryB.name);
	});

	t.deepEqual(currentVersionInfo, oExpectedVersionInfo, "Correct content");
}

test.beforeEach(async (t) => {
	t.context.verboseLogStub = sinon.stub();
	t.context.errorLogStub = sinon.stub();
	t.context.warnLogStub = sinon.stub();
	t.context.infoLogStub = sinon.stub();
	t.context.sillyLogStub = sinon.stub();
	t.context.log = {
		verbose: t.context.verboseLogStub,
		error: t.context.errorLogStub,
		warn: t.context.warnLogStub,
		info: t.context.infoLogStub,
		silly: t.context.sillyLogStub,
		isLevelEnabled: () => true
	};

	t.context.generateVersionInfo = await esmock("../../../lib/tasks/generateVersionInfo.js", {

	}, {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:processors:versionInfoGenerator").returns(t.context.log)
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("integration: Library without i18n bundle file", async (t) => {
	t.context.workspace = createWorkspace();
	t.context.dependencies = createDependencies();

	t.context.resources = [];
	t.context.resources.push(resourceFactory.createResource({
		path: "/resources/test/lib/.library",
		string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd" >

				<name>test.lib</name>
				<vendor>SAP SE</vendor>
				<copyright></copyright>
				<version>2.0.0</version>

				<documentation>Test Lib</documentation>

			</library>
		`,
		project: t.context.workspace._project
	}));

	const oOptions = await createOptions(t);
	await assertCreatedVersionInfo(t, {
		"libraries": [{
			"name": "test.lib3",
			"scmRevision": "",
			"version": "3.0.0"
		}],
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
	}, oOptions);

	t.is(t.context.verboseLogStub.callCount, 1);
	t.is(t.context.verboseLogStub.getCall(0).args[0],
		"Cannot add meta information for library 'test.lib3'. The manifest.json file cannot be found");
});

/**
 *
 * @param {@ui5/fs/DuplexCollection} dependencies
 * @param {@ui5/fs/resourceFactory} resourceFactory
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
 * @param {@ui5/fs/DuplexCollection} dependencies
 * @param {@ui5/fs/resourceFactory} resourceFactory
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
		`
	}));
}

/**
 *
 * @param {@ui5/fs/DuplexCollection} dependencies
 * @param {@ui5/fs/resourceFactory} resourceFactory
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

test.serial("integration: sibling eager to lazy", async (t) => {
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// input
	// lib.a => lib.b, lib.c
	// lib.b => lib.c (true)
	// lib.c =>

	// expected outcome
	// lib.a => lib.b, lib.c
	// lib.b => lib.c (true)
	// lib.c =>

	// dependencies
	const dependenciesA = createDepWorkspace(["lib", "a"], {virBasePath: "/"});
	const dependenciesB = createDepWorkspace(["lib", "b"], {virBasePath: "/"});
	const dependenciesC = createDepWorkspace(["lib", "c"], {virBasePath: "/"});

	// lib.a
	await createResources(dependenciesA, resourceFactory, ["lib", "a"], [{name: "lib.b"}, {name: "lib.c"}]);

	// lib.b
	await createResources(dependenciesB, resourceFactory, ["lib", "b"], [{name: "lib.c", lazy: true}]);

	// lib.c
	await createResources(dependenciesC, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC]
		})
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.b": {},
						"lib.c": {}
					}
				}
			},
		},
		{
			"name": "lib.b",
			"scmRevision": "",
			"version": "3.0.0-lib.b",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.c": {
							"lazy": true
						}
					}
				}
			},
		},
		{
			"name": "lib.c",
			"scmRevision": "",
			"version": "3.0.0-lib.c",
		}],
	}, oOptions);
});

test.serial("integration: sibling lazy to eager", async (t) => {
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// input
	// lib.a => lib.b, lib.c (true)
	// lib.b => lib.c
	// lib.c =>

	// expected outcome
	// lib.a => lib.b, lib.c
	// lib.b => lib.c
	// lib.c =>

	// dependencies
	const dependenciesA = createDepWorkspace(["lib", "a"], {virBasePath: "/"});
	const dependenciesB = createDepWorkspace(["lib", "b"], {virBasePath: "/"});
	const dependenciesC = createDepWorkspace(["lib", "c"], {virBasePath: "/"});

	// lib.a
	await createResources(dependenciesA, resourceFactory, ["lib", "a"],
		[{name: "lib.b"}, {name: "lib.c", lazy: true}]);

	// lib.b
	await createResources(dependenciesB, resourceFactory, ["lib", "b"], [{name: "lib.c"}]);

	// lib.c
	await createResources(dependenciesC, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC]
		})
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.b": {},
						"lib.c": {}
					}
				}
			},
		},
		{
			"name": "lib.b",
			"scmRevision": "",
			"version": "3.0.0-lib.b",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.c": {}
					}
				}
			},
		},
		{
			"name": "lib.c",
			"scmRevision": "",
			"version": "3.0.0-lib.c",
		}],
	}, oOptions);
});

test.serial("integration: children eager to lazy", async (t) => {
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// input
	// lib.a => lib.b
	// lib.b => lib.c (true)
	// lib.c =>

	// expected outcome
	// lib.a => lib.b, lib.c (true)
	// lib.b => lib.c (true)
	// lib.c =>

	// dependencies
	const dependenciesA = createDepWorkspace(["lib", "a"], {virBasePath: "/"});
	const dependenciesB = createDepWorkspace(["lib", "b"], {virBasePath: "/"});
	const dependenciesC = createDepWorkspace(["lib", "c"], {virBasePath: "/"});

	// lib.a
	await createResources(dependenciesA, resourceFactory, ["lib", "a"],
		[{name: "lib.b"}]);

	// lib.b
	await createResources(dependenciesB, resourceFactory, ["lib", "b"],
		[{name: "lib.c", lazy: true}]);

	// lib.c
	await createResources(dependenciesC, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC]
		})
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.b": {},
						"lib.c": {
							"lazy": true
						}
					}
				}
			},
		},
		{
			"name": "lib.b",
			"scmRevision": "",
			"version": "3.0.0-lib.b",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.c": {
							"lazy": true
						}
					}
				}
			},
		},
		{
			"name": "lib.c",
			"scmRevision": "",
			"version": "3.0.0-lib.c",
		}],
	}, oOptions);
});

test.serial("integration: children lazy to eager", async (t) => {
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// input
	// lib.a => lib.b (true)
	// lib.b => lib.c
	// lib.c =>

	// expected outcome
	// lib.a => lib.b (true), lib.c (true)
	// lib.b => lib.c
	// lib.c =>

	// dependencies
	const dependenciesA = createDepWorkspace(["lib", "a"], {virBasePath: "/"});
	const dependenciesB = createDepWorkspace(["lib", "b"], {virBasePath: "/"});
	const dependenciesC = createDepWorkspace(["lib", "c"], {virBasePath: "/"});

	// lib.a
	await createResources(dependenciesA, resourceFactory, ["lib", "a"],
		[{name: "lib.b", lazy: true}]);

	// lib.b
	await createResources(dependenciesB, resourceFactory, ["lib", "b"],
		[{name: "lib.c"}]);

	// lib.c
	await createResources(dependenciesC, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC]
		})
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.b": {
							"lazy": true
						},
						"lib.c": {
							"lazy": true
						}
					}
				}
			},
		},
		{
			"name": "lib.b",
			"scmRevision": "",
			"version": "3.0.0-lib.b",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"lib.c": {}
					}
				}
			},
		},
		{
			"name": "lib.c",
			"scmRevision": "",
			"version": "3.0.0-lib.c",
		}],
	}, oOptions);
});

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

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC, dependenciesD, dependenciesE]
		})
	};
	await assertCreatedVersionInfo(t, {
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
	}, oOptions);
});

test.serial("integration: Library with dependencies and subcomponent bigger scenario", async (t) => {
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

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies: resourceFactory.createReaderCollection({
			name: "dependencies",
			readers: [dependenciesA, dependenciesB, dependenciesC, dependenciesD, dependenciesE]
		})
	};
	await assertCreatedVersionInfo(t, {
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
	}, oOptions);
});

test.serial("integration: Library without dependencies and embeds and embeddedBy", async (t) => {
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDepWorkspace(["lib", "a"], {virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependencies, resourceFactory, ["lib", "a"], [], embeds);
	// sub
	await createManifestResource(dependencies, resourceFactory, ["lib", "a", "sub", "fold"], [],
		undefined, "../../");

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
		}],
		"components": {
			"lib.a.sub.fold": {
				"library": "lib.a"
			}
		},
	}, oOptions);
});

test.serial("integration: Library without dependencies and embeddedBy undefined", async (t) => {
	const {verboseLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDepWorkspace(["lib", "a"], {virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependencies, resourceFactory, ["lib", "a"], [], embeds);
	// sub
	await createManifestResource(dependencies, resourceFactory, ["lib", "a", "sub", "fold"], [],
		undefined, undefined);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
		}],
		"components": {
			"lib.a.sub.fold": {
				"hasOwnPreload": true,
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(verboseLogStub.callCount, 1);
	t.is(verboseLogStub.firstCall.args[0],
		"  Component doesn't declare 'sap.app/embeddedBy', don't list it as 'embedded'");
});

test.serial("integration: Library without dependencies and embeddedBy not a string", async (t) => {
	const {errorLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDepWorkspace(["lib", "a"], {virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependencies, resourceFactory, ["lib", "a"], [], embeds);
	// sub
	await createManifestResource(dependencies, resourceFactory, ["lib", "a", "sub", "fold"], [],
		undefined, {});

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
		}],
		"components": {
			"lib.a.sub.fold": {
				"hasOwnPreload": true,
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(errorLogStub.callCount, 1);
	t.is(errorLogStub.firstCall.args[0],
		"  Component '/resources/lib/a/sub/fold': property 'sap.app/embeddedBy' is of type 'object' " +
		"(expected 'string'), it won't be listed as 'embedded'");
});

test.serial("integration: Library without dependencies and embeddedBy empty string", async (t) => {
	const {errorLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDepWorkspace(["lib", "a"], {virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependencies, resourceFactory, ["lib", "a"], [], embeds);
	// sub
	await createManifestResource(dependencies, resourceFactory, ["lib", "a", "sub", "fold"], [],
		undefined, "");

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
		}],
		"components": {
			"lib.a.sub.fold": {
				"hasOwnPreload": true,
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(errorLogStub.callCount, 1);
	t.is(errorLogStub.firstCall.args[0],
		"  Component '/resources/lib/a/sub/fold': property 'sap.app/embeddedBy' has an empty string value " +
		"(which is invalid), it won't be listed as 'embedded'");
});

test.serial("integration: Library without dependencies and embeddedBy path not correct", async (t) => {
	const {verboseLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDepWorkspace(["lib", "a"], {virBasePath: "/"});

	// lib.a
	const embeds = ["sub/fold"];
	await createResources(dependencies, resourceFactory, ["lib", "a"], [], embeds);
	// sub
	await createManifestResource(dependencies, resourceFactory, ["lib", "a", "sub", "fold"], [],
		undefined, "../");

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a"
		}],
		"components": {
			"lib.a.sub.fold": {
				"hasOwnPreload": true,
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(verboseLogStub.callCount, 1);
	t.is(verboseLogStub.firstCall.args[0],
		"  Component's 'sap.app/embeddedBy' points to '/resources/lib/a/sub/', don't list it as 'embedded'");
});

test.serial("integration: Library with manifest with invalid dependency", async (t) => {
	const {infoLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDepWorkspace(["lib", "a"], {virBasePath: "/"});

	// lib.a
	await createResources(dependencies, resourceFactory, ["lib", "a"], [{name: "non.existing"}]);


	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: createProjectMetadata(["myname"], "1.33.7")
		},
		workspace,
		dependencies
	};
	await assertCreatedVersionInfo(t, {
		"name": "myname",
		"scmRevision": "",
		"version": "1.33.7",
		"libraries": [{
			"name": "lib.a",
			"scmRevision": "",
			"version": "3.0.0-lib.a",
			"manifestHints": {
				"dependencies": {
					"libs": {
						"non.existing": {},
					},
				},
			}
		}],
	}, oOptions);

	t.is(infoLogStub.callCount, 1);
	t.is(infoLogStub.firstCall.args[0],
		"Cannot find dependency 'non.existing' defined in the manifest.json or .library file of project 'lib.a'. " +
		"This might prevent some UI5 runtime performance optimizations from taking effect. " +
		"Please double check your project's dependency configuration.");
});
