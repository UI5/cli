import test from "ava";
import sinon from "sinon";
import path from "node:path";
import {fileURLToPath} from "node:url";
import Module from "../../../lib/graph/Module.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesPath = path.join(__dirname, "..", "..", "fixtures");
const applicationAPath = path.join(fixturesPath, "application.a");
const buildDescriptionApplicationAPath =
	path.join(fixturesPath, "build-manifest", "application.a");
const buildDescriptionLibraryAPath =
	path.join(fixturesPath, "build-manifest", "library.e");
const applicationHPath = path.join(fixturesPath, "application.h");
const collectionPath = path.join(fixturesPath, "collection");
const themeLibraryEPath = path.join(fixturesPath, "theme.library.e");

const basicModuleInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: applicationAPath
};
const archiveAppProjectInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: buildDescriptionApplicationAPath
};

const archiveLibProjectInput = {
	id: "library.e.id",
	version: "1.0.0",
	modulePath: buildDescriptionLibraryAPath
};

test("Instantiate a basic module", (t) => {
	const ui5Module = new Module(basicModuleInput);
	t.is(ui5Module.getId(), "application.a.id", "Should return correct ID");
	t.is(ui5Module.getVersion(), "1.0.0", "Should return correct version");
	t.is(ui5Module.getPath(), applicationAPath, "Should return correct module path");
});

test("Create module with missing id", (t) => {
	t.throws(() => {
		new Module({
			version: "1.0.0",
			modulePath: "/module/path"
		});
	}, {
		message: "Could not create Module: Missing or empty parameter 'id'"
	});
});

test("Create module with missing version", (t) => {
	t.throws(() => {
		new Module({
			id: "application.a.id",
			modulePath: "/module/path"
		});
	}, {
		message: "Could not create Module: Missing or empty parameter 'version'"
	});
});

test("Create module with missing modulePath", (t) => {
	t.throws(() => {
		new Module({
			id: "application.a.id",
			version: "1.0.0",
		});
	}, {
		message: "Could not create Module: Missing or empty parameter 'modulePath'"
	});
});

test("Create module with relative modulePath", (t) => {
	t.throws(() => {
		new Module({
			id: "application.a.id",
			version: "1.0.0",
			modulePath: "module/path"
		});
	}, {
		message: "Could not create Module: Parameter 'modulePath' must contain an absolute path"
	});
});

test("Access module root resources via reader", async (t) => {
	const ui5Module = new Module(basicModuleInput);
	const rootReader = ui5Module.getReader();
	const packageJsonResource = await rootReader.byPath("/package.json");
	t.is(packageJsonResource.getPath(), "/package.json", "Successfully retrieved root resource");
});

test("Get specifications from module", async (t) => {
	const ui5Module = new Module(basicModuleInput);
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "application.a", "Should return correct project");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Get specifications from application project with build manifest", async (t) => {
	const ui5Module = new Module(archiveAppProjectInput);
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "application.a", "Should return correct project");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Get specifications from library project with build manifest", async (t) => {
	const ui5Module = new Module(archiveLibProjectInput);
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "library.e", "Should return correct project");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Use configuration from object", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: {
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a-object"
			},
			customConfiguration: {
				configurationTest: true
			}
		}
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(project.getName(), "application.a-object", "Used name from config object");
	t.deepEqual(project.getCustomConfiguration(), {
		configurationTest: true
	}, "Provided configuration is available");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Use configuration from array of objects", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: [{
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a"
			},
			customConfiguration: {
				configurationTest: true
			}
		}, {
			specVersion: "2.6",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "my-project-shim"
			},
			shims: {}
		}]
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configurationTest: true
	}, "Provided configuration is available");
	t.is(extensions.length, 1, "Should return one extension");
});

test("Use configuration from configPath", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: "ui5-test-configPath.yaml"
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configPathTest: true
	}, "Provided configuration is available");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Use configuration from absolute configPath", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: path.join(applicationAPath, "ui5-test-configPath.yaml")
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configPathTest: true
	}, "Provided configuration is available");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("configuration and configPath must not be provided together", (t) => {
	// 'configuration' as object
	t.throws(() => {
		new Module({
			id: "application.a.id",
			version: "1.0.0",
			modulePath: applicationAPath,
			configPath: "test-ui5.yaml",
			configuration: {
				test: "configuration"
			}
		});
	}, {
		message: "Could not create Module: 'configPath' must not be provided in combination with 'configuration'"
	});
	// 'configuration' as array
	t.throws(() => {
		new Module({
			id: "application.a.id",
			version: "1.0.0",
			modulePath: applicationAPath,
			configPath: "test-ui5.yaml",
			configuration: [{
				test: "configuration"
			}]
		});
	}, {
		message: "Could not create Module: 'configPath' must not be provided in combination with 'configuration'"
	});
});

test("Use configuration from project shim", async (t) => {
	const getProjectConfigurationShimsStub = sinon.stub().returns([{
		name: "shim-1",
		shim: {
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.h"
			},
			customConfiguration: {
				configurationTest: true
			}
		}
	}]);

	const ui5Module = new Module({
		id: "application.h.id",
		version: "1.0.0",
		modulePath: applicationHPath,
		configuration: [],
		shimCollection: {
			getProjectConfigurationShims: getProjectConfigurationShimsStub
		}
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.is(getProjectConfigurationShimsStub.callCount, 1, "Should request configuration shims from collection");
	t.is(getProjectConfigurationShimsStub.getCall(0).args[0], "application.h.id",
		"Should request configuration shims for correct module ID");
	t.truthy(project, "Should create a project form shim configuration");
	t.deepEqual(project.getCustomConfiguration(), {
		configurationTest: true
	});
	t.is(extensions.length, 0, "Should return no extension");
});

test("Extend configuration via shim", async (t) => {
	const getProjectConfigurationShimsStub = sinon.stub().returns([{
		name: "shim-1",
		shim: {
			customConfiguration: { // Overwrites whole object since merge is done with Object.assign
				overwriteConfigurationTest: true
			}
		}
	}]);

	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: {
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a-object"
			},
			customConfiguration: {
				configurationTest: true
			}
		},
		shimCollection: {
			getProjectConfigurationShims: getProjectConfigurationShimsStub
		}
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		overwriteConfigurationTest: true
	}, "Provided configuration is available");
	t.is(extensions.length, 0, "Should return no extensions");
});

test("Module is a collection", async (t) => {
	const ui5Module = new Module({
		id: "collection.a",
		version: "1.0.0",
		modulePath: collectionPath,
		configuration: [{
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a-object"
			},
			customConfiguration: {
				configurationTest: true
			}
		}, {
			specVersion: "2.6",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "collection-shim"
			},
			shims: {
				collections: {
					"collection.a": {
						modules: {
							"library.a": "./library.a",
							"library.b": "./library.b",
							"library.c": "./library.c",
						}
					}
				}
			}
		}]
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.falsy(project, "Should ignore the project since the shim defines the module itself as a collection");
	t.is(extensions.length, 1, "Should return one extensions");
	t.deepEqual(extensions[0].getCollectionShims(), {
		"collection.a": {
			modules: {
				"library.a": "./library.a",
				"library.b": "./library.b",
				"library.c": "./library.c",
			}
		}
	}, "Collection shim configured correctly");
});

test("Module can't define config shim for itself", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configuration: [{
			specVersion: "2.6",
			kind: "extension",
			type: "project-shim",
			metadata: {
				name: "my-project-shim"
			},
			shims: {
				configurations: {
					"application.a.id": {
						customConfiguration: {
							overwriteConfigurationTest: true
						}
					}
				}
			}
		}, {
			specVersion: "2.6",
			type: "application",
			metadata: {
				name: "application.a-object"
			},
			customConfiguration: {
				configurationTest: true
			}
		}]
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.deepEqual(project.getCustomConfiguration(), {
		configurationTest: true // Shim has not been applied
	}, "Provided configuration is available");
	t.is(extensions.length, 1, "Should return one extension");
});

test("Legacy patches are applied", async (t) => {
	async function testLegacyLibrary(libraryName) {
		const ui5Module = new Module({
			id: "legacy-theme-library.e.id",
			version: "1.0.0",
			modulePath: themeLibraryEPath,
			configuration: {
				specVersion: "2.6", // should not matter
				type: "library", // legacy config for theme-libraries
				metadata: {
					name: libraryName
				}
			}
		});
		const {project, extensions} = await ui5Module.getSpecifications();
		t.is(project.getName(), libraryName, "Used name from config object");
		t.is(project.getType(), "theme-library", "Project type got patched correctly");
		t.is(extensions.length, 0, "Should return no extensions");
	}

	await Promise.all(
		["themelib_sap_fiori_3", "themelib_sap_bluecrystal", "themelib_sap_belize"]
			.map(testLegacyLibrary));
});

test("Invalid configuration in file", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: "ui5-test-error.yaml"
	});
	const err = await t.throwsAsync(ui5Module.getSpecifications());

	t.true(err.message.includes("Invalid ui5.yaml configuration"), "Threw with validation error");
	// Check that config file name is referenced. This validates that the error was not produced by
	// the Specification instance but the Module
	t.true(err.message.includes("ui5-test-error.yaml"), "Error message references file name");
	t.truthy(err.yaml, "Error object contains yaml information");
});

test("Corrupt configuration in file", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: "ui5-test-corrupt.yaml"
	});
	const err = await t.throwsAsync(ui5Module.getSpecifications());

	t.regex(err.message,
		new RegExp("^Failed to parse configuration for project application.a.id at 'ui5-test-corrupt.yaml'.*"),
		"Threw with parsing error");
});

test("Empty configuration in file", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: "ui5-test-empty.yaml"
	});
	const res = await ui5Module.getSpecifications();

	t.deepEqual(res, {
		project: null,
		extensions: []
	}, "Returned no project or extensions");
});

test("No configuration", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: fixturesPath, // does not contain a ui5.yaml
	});
	const res = await ui5Module.getSpecifications();

	t.deepEqual(res, {
		project: null,
		extensions: []
	}, "Returned no project or extensions");
});

test("Incorrect config path", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath: "ui5-does-not-exist.yaml"
	});
	const err = await t.throwsAsync(ui5Module.getSpecifications());

	t.is(err.message,
		"Failed to read configuration for module application.a.id: " +
		"Could not find configuration file in module at path 'ui5-does-not-exist.yaml'",
		"Threw with expected error message");
});

test("Incorrect absolute config path", async (t) => {
	const configPath = path.join(applicationAPath, "ui5-does-not-exist.yaml");
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationAPath,
		configPath
	});
	const err = await t.throwsAsync(ui5Module.getSpecifications());

	t.true(err.message.startsWith(
		`Failed to read configuration for module application.a.id at '${configPath}'. Error:`),
	"Threw with expected error message");
});

test("Module without ui5.yaml is ignored", async (t) => {
	const ui5Module = new Module({
		id: "application.a.id",
		version: "1.0.0",
		modulePath: applicationHPath
	});
	const {project, extensions} = await ui5Module.getSpecifications();
	t.falsy(project, "Should return no project");
	t.is(extensions.length, 0, "Should return no extensions");
});
