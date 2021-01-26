const test = require("ava");

let generateVersionInfo = require("../../../lib/tasks/generateVersionInfo");
const path = require("path");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const sinon = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");

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

function createDependencies(oOptions = {
	virBasePath: "/resources",
	fsBasePath: path.join(__dirname, "..", "..", "fixtures", "sap.ui.core-evo", "main", "src")
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
		rootProject: {
			metadata: {
				name: "myname"
			},
			version: "1.33.7"
		}
	};
	return oOptions;
}

async function assertCreatedVersionInfo(t, oExpectedVersionInfo, oOptions) {
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

test.beforeEach((t) => {
	t.context.verboseLogStub = sinon.stub();
	t.context.errorLogStub = sinon.stub();
	t.context.warnLogStub = sinon.stub();
	t.context.infoLogStub = sinon.stub();
	sinon.stub(logger, "getLogger").returns({
		verbose: t.context.verboseLogStub,
		error: t.context.errorLogStub,
		warn: t.context.warnLogStub,
		info: t.context.infoLogStub,
		isLevelEnabled: () => true
	});
	mock.reRequire("../../../lib/processors/versionInfoGenerator");
	generateVersionInfo = mock.reRequire("../../../lib/tasks/generateVersionInfo");
});

test.afterEach.always((t) => {
	mock.stopAll();
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

test.serial("integration: Library without i18n bundle file failure", async (t) => {
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

	const options = {
		projectName: "Test Lib",
		pattern: "/**/*.js",
		rootProject: {
			metadata: {
				name: "myname"
			}
		}
	};


	const oOptions = await createOptions(t, options);
	await generateVersionInfo(oOptions).catch((error) => {
		t.is(error.message, "[versionInfoGenerator]: Missing options parameters");
	});
});

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
 */
const createResources = async (dependencies, resourceFactory, names, deps, embeds) => {
	await createDotLibrary(dependencies, resourceFactory, names);
	await createManifestResource(dependencies, resourceFactory, names, deps, embeds);
};

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
	const dependencies = createDependencies({virBasePath: "/"});

	// lib.a
	await createResources(dependencies, resourceFactory, ["lib", "a"], [{name: "lib.b"}, {name: "lib.c"}]);

	// lib.b
	await createResources(dependencies, resourceFactory, ["lib", "b"], [{name: "lib.c", lazy: true}]);

	// lib.c
	await createResources(dependencies, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
			"scmRevision": ""
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
	const dependencies = createDependencies({virBasePath: "/"});

	// lib.a
	await createResources(dependencies, resourceFactory, ["lib", "a"],
		[{name: "lib.b"}, {name: "lib.c", lazy: true}]);

	// lib.b
	await createResources(dependencies, resourceFactory, ["lib", "b"], [{name: "lib.c"}]);

	// lib.c
	await createResources(dependencies, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
			"scmRevision": ""
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
	const dependencies = createDependencies({virBasePath: "/"});

	// lib.a
	await createResources(dependencies, resourceFactory, ["lib", "a"],
		[{name: "lib.b"}]);

	// lib.b
	await createResources(dependencies, resourceFactory, ["lib", "b"],
		[{name: "lib.c", lazy: true}]);

	// lib.c
	await createResources(dependencies, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
			"scmRevision": ""
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
	const dependencies = createDependencies({virBasePath: "/"});

	// lib.a
	await createResources(dependencies, resourceFactory, ["lib", "a"],
		[{name: "lib.b", lazy: true}]);

	// lib.b
	await createResources(dependencies, resourceFactory, ["lib", "b"],
		[{name: "lib.c"}]);

	// lib.c
	await createResources(dependencies, resourceFactory, ["lib", "c"], []);

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
			"scmRevision": ""
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

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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

	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
	const dependencies = createDependencies({virBasePath: "/"});

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
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
		}],
		"components": {
			"lib.a.sub.fold": {
				"hasOwnPreload": true,
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
	const dependencies = createDependencies({virBasePath: "/"});

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
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
		}],
		"components": {
			"lib.a.sub.fold": {
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(verboseLogStub.callCount, 1);
	t.is(verboseLogStub.firstCall.args[0],
		"  component doesn't declare 'sap.app/embeddedBy', don't list it as 'embedded'");
});

test.serial("integration: Library without dependencies and embeddedBy not a string", async (t) => {
	const {errorLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDependencies({virBasePath: "/"});

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
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
		}],
		"components": {
			"lib.a.sub.fold": {
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(errorLogStub.callCount, 1);
	t.is(errorLogStub.firstCall.args[0],
		"  component '%s': property 'sap.app/embeddedBy' is of type '%s' (expected 'string'), " +
		"it won't be listed as 'embedded'");
});

test.serial("integration: Library without dependencies and embeddedBy empty string", async (t) => {
	const {errorLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDependencies({virBasePath: "/"});

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
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
		}],
		"components": {
			"lib.a.sub.fold": {
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(errorLogStub.callCount, 1);
	t.is(errorLogStub.firstCall.args[0],
		"  component '%s': property 'sap.app/embeddedBy' has an empty string value (which is invalid), " +
		"it won't be listed as 'embedded'");
});

test.serial("integration: Library without dependencies and embeddedBy path not correct", async (t) => {
	const {verboseLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDependencies({virBasePath: "/"});

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
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
		}],
		"components": {
			"lib.a.sub.fold": {
				"library": "lib.a"
			}
		},
	}, oOptions);

	t.is(verboseLogStub.callCount, 1);
	t.is(verboseLogStub.firstCall.args[0],
		"  component's 'sap.app/embeddedBy' points to '%s', don't list it as 'embedded'");
});

test.serial("integration: Library with manifest with invalid dependency", async (t) => {
	const {infoLogStub} = t.context;
	const workspace = createWorkspace();

	await createDotLibrary(workspace, resourceFactory, ["test", "lib"]);

	// dependencies
	const dependencies = createDependencies({virBasePath: "/"});

	// lib.a
	await createResources(dependencies, resourceFactory, ["lib", "a"], [{name: "non.existing"}]);


	const oOptions = {
		options: {
			projectName: "Test Lib",
			pattern: "/resources/**/.library",
			rootProject: {
				metadata: {
					name: "myname"
				},
				version: "1.33.7"
			}
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
