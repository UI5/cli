const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const path = require("path");
const os = require("os");
const fs = require("graceful-fs");

const pacote = require("pacote");
const libnpmconfig = require("libnpmconfig");
const lockfile = require("lockfile");
const logger = require("@ui5/logger");
const Module = require("../../../../lib/graph/Module");
const ApplicationType = require("../../../../lib/specifications/types/Application");
const LibraryType = require("../../../../lib/specifications/types/Library");
const DependencyTreeProvider = require("../../../../lib/graph/providers/DependencyTree");
const projectGraphBuilder = require("../../../../lib/graph/projectGraphBuilder");

// Use path within project as mocking base directory to reduce chance of side effects
// in case mocks/stubs do not work and real fs is used
const fakeBaseDir = path.join(__dirname, "fake-tmp");
const ui5FrameworkBaseDir = path.join(fakeBaseDir, "homedir", ".ui5", "framework");
const ui5PackagesBaseDir = path.join(ui5FrameworkBaseDir, "packages");

test.before((t) => {
	sinon.stub(fs, "rename").yieldsAsync();
});

test.beforeEach((t) => {
	sinon.stub(libnpmconfig, "read").returns({
		toJSON: () => {
			return {
				registry: "https://registry.fake",
				cache: path.join(ui5FrameworkBaseDir, "cacache"),
				proxy: ""
			};
		}
	});
	sinon.stub(os, "homedir").returns(path.join(fakeBaseDir, "homedir"));

	sinon.stub(lockfile, "lock").yieldsAsync();
	sinon.stub(lockfile, "unlock").yieldsAsync();

	const testLogger = logger.getLogger();
	sinon.stub(logger, "getLogger").returns(testLogger);
	t.context.logInfoSpy = sinon.spy(testLogger, "info");

	mock("mkdirp", sinon.stub().resolves());

	// Stub specification internal checks since none of the projects actually exist on disk
	sinon.stub(ApplicationType.prototype, "_configureAndValidatePaths").resolves();
	sinon.stub(LibraryType.prototype, "_configureAndValidatePaths").resolves();
	sinon.stub(ApplicationType.prototype, "_parseConfiguration").resolves();
	sinon.stub(LibraryType.prototype, "_parseConfiguration").resolves();


	// Re-require to ensure that mocked modules are used
	t.context.ui5Framework = mock.reRequire("../../../../lib/graph/helpers/ui5Framework");
	t.context.Installer = require("../../../../lib/ui5Framework/npm/Installer");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
	logger.setLevel("info"); // default log level
});

function defineTest(testName, {
	frameworkName,
	verbose = false
}) {
	const npmScope = frameworkName === "SAPUI5" ? "@sapui5" : "@openui5";

	const distributionMetadata = {
		libraries: {
			"sap.ui.lib1": {
				npmPackageName: "@sapui5/sap.ui.lib1",
				version: "1.75.1",
				dependencies: [],
				optionalDependencies: []
			},
			"sap.ui.lib2": {
				npmPackageName: "@sapui5/sap.ui.lib2",
				version: "1.75.2",
				dependencies: [
					"sap.ui.lib3"
				],
				optionalDependencies: []
			},
			"sap.ui.lib3": {
				npmPackageName: "@sapui5/sap.ui.lib3",
				version: "1.75.3",
				dependencies: [],
				optionalDependencies: [
					"sap.ui.lib4"
				]
			},
			"sap.ui.lib4": {
				npmPackageName: "@openui5/sap.ui.lib4",
				version: "1.75.4",
				dependencies: [
					"sap.ui.lib1"
				],
				optionalDependencies: []
			},
			"sap.ui.lib8": {
				npmPackageName: "@sapui5/sap.ui.lib8",
				version: "1.75.8",
				dependencies: [],
				optionalDependencies: []
			}
		}
	};

	test.serial(`${frameworkName}: ${verbose ? "(verbose) " : ""}${testName}`, async (t) => {
		// Enable verbose logging
		if (verbose) {
			logger.setLevel("verbose");
		}
		const {ui5Framework, Installer, logInfoSpy} = t.context;

		const testDependency = {
			id: "test-dependency-id",
			version: "4.5.6",
			path: path.join(fakeBaseDir, "project-test-dependency"),
			dependencies: [],
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "test-dependency"
				},
				framework: {
					version: "1.99.0",
					name: frameworkName,
					libraries: [
						{
							name: "sap.ui.lib1"
						},
						{
							name: "sap.ui.lib2"
						},
						{
							name: "sap.ui.lib5",
							optional: true
						},
						{
							name: "sap.ui.lib6",
							development: true
						},
						{
							name: "sap.ui.lib8",
							// optional dependency gets resolved by dev-dependency of root project
							optional: true
						}
					]
				}
			}
		};
		const dependencyTree = {
			id: "test-application-id",
			version: "1.2.3",
			path: path.join(fakeBaseDir, "project-test-application"),
			configuration: {
				specVersion: "2.0",
				type: "application",
				metadata: {
					name: "test-application"
				},
				framework: {
					name: frameworkName,
					version: "1.75.0",
					libraries: [
						{
							name: "sap.ui.lib1"
						},
						{
							name: "sap.ui.lib4",
							optional: true
						},
						{
							name: "sap.ui.lib8",
							development: true
						}
					]
				}
			},
			dependencies: [
				testDependency,
				{
					id: "test-dependency-no-framework-id",
					version: "7.8.9",
					path: path.join(fakeBaseDir, "project-test-dependency-no-framework"),
					configuration: {
						specVersion: "2.0",
						type: "library",
						metadata: {
							name: "test-dependency-no-framework"
						}
					},
					dependencies: [
						testDependency
					]
				}
			]
		};

		sinon.stub(Module.prototype, "_readConfigFile")
			.callsFake(async function() {
				switch (this.getPath()) {
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib1",
					frameworkName === "SAPUI5" ? "1.75.1" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib1"
						},
						framework: {
							name: frameworkName,
							libraries: []
						}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib2",
					frameworkName === "SAPUI5" ? "1.75.2" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib2"
						},
						framework: {
							name: frameworkName,
							libraries: []
						}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib3",
					frameworkName === "SAPUI5" ? "1.75.3" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib3"
						},
						framework: {
							name: frameworkName,
							libraries: []
						}
					}];
				case path.join(ui5PackagesBaseDir, "@openui5", "sap.ui.lib4",
					frameworkName === "SAPUI5" ? "1.75.4" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib4"
						},
						framework: {
							name: frameworkName,
							libraries: []
						}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib8",
					frameworkName === "SAPUI5" ? "1.75.8" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib8"
						},
						framework: {
							name: frameworkName,
							libraries: []
						}
					}];
				default:
					throw new Error(
						"Module#_readConfigFile stub called with unknown project: " +
						(this.getId())
					);
				}
			});

		sinon.stub(pacote, "extract").resolves();

		if (frameworkName === "OpenUI5") {
			sinon.stub(pacote, "manifest")
				.callsFake(async (spec) => {
					throw new Error("pacote.manifest stub called with unknown spec: " + spec);
				})
				.withArgs("@openui5/sap.ui.lib1@1.75.0")
				.resolves({
					name: "@openui5/sap.ui.lib1",
					version: "1.75.0",
					dependencies: {}
				})
				.withArgs("@openui5/sap.ui.lib2@1.75.0")
				.resolves({
					name: "@openui5/sap.ui.lib2",
					version: "1.75.0",
					dependencies: {
						"@openui5/sap.ui.lib3": "1.75.0"
					}
				})
				.withArgs("@openui5/sap.ui.lib3@1.75.0")
				.resolves({
					name: "@openui5/sap.ui.lib3",
					version: "1.75.0",
					devDependencies: {
						"@openui5/sap.ui.lib4": "1.75.0"
					}
				})
				.withArgs("@openui5/sap.ui.lib4@1.75.0")
				.resolves({
					name: "@openui5/sap.ui.lib4",
					version: "1.75.0",
					dependencies: {
						"@openui5/sap.ui.lib1": "1.75.0"
					}
				})
				.withArgs("@openui5/sap.ui.lib8@1.75.0")
				.resolves({
					name: "@openui5/sap.ui.lib8",
					version: "1.75.0",
					dependencies: {}
				});
		} else if (frameworkName === "SAPUI5") {
			sinon.stub(Installer.prototype, "readJson")
				.callsFake(async (path) => {
					throw new Error("Installer#readJson stub called with unknown path: " + path);
				})
				.withArgs(path.join(fakeBaseDir,
					"homedir", ".ui5", "framework", "packages",
					"@sapui5", "distribution-metadata", "1.75.0",
					"metadata.json"))
				.resolves(distributionMetadata);
		}

		const provider = new DependencyTreeProvider({dependencyTree});
		const projectGraph = await projectGraphBuilder(provider);

		await ui5Framework.enrichProjectGraph(projectGraph);

		const callbackStub = sinon.stub().resolves();
		await projectGraph.traverseDepthFirst(callbackStub);

		t.is(callbackStub.callCount, 8, "Correct number of projects have been visited");

		const callbackCalls = callbackStub.getCalls().map((call) => call.args[0].project.getName());
		t.deepEqual(callbackCalls, [
			"sap.ui.lib1",
			"sap.ui.lib8",
			"sap.ui.lib4",
			"sap.ui.lib3",
			"sap.ui.lib2",
			"test-dependency",
			"test-dependency-no-framework",
			"test-application",
		], "Traversed graph in correct order");

		const frameworkLibAlreadyAddedInfoLogged = (logInfoSpy.getCalls()
			.map(($) => $.firstArg)
			.findIndex(($) => $.includes("defines a dependency to the UI5 framework library")) !== -1);
		t.false(frameworkLibAlreadyAddedInfoLogged, "No info regarding already added UI5 framework libraries logged");
	});
}

defineTest("ui5Framework helper should enhance project graph with UI5 framework libraries", {
	frameworkName: "SAPUI5"
});
defineTest("ui5Framework helper should enhance project graph with UI5 framework libraries", {
	frameworkName: "SAPUI5",
	verbose: true
});
defineTest("ui5Framework helper should enhance project graph with UI5 framework libraries", {
	frameworkName: "OpenUI5"
});
defineTest("ui5Framework helper should enhance project graph with UI5 framework libraries", {
	frameworkName: "OpenUI5",
	verbose: true
});

function defineErrorTest(testName, {
	frameworkName,
	failExtract = false,
	failMetadata = false,
	expectedErrorMessage
}) {
	test.serial(testName, async (t) => {
		const {ui5Framework, Installer} = t.context;

		const dependencyTree = {
			id: "test-id",
			version: "1.2.3",
			path: path.join(fakeBaseDir, "application-project"),
			dependencies: [],
			configuration: {
				specVersion: "2.0",
				type: "application",
				metadata: {
					name: "test-project"
				},
				framework: {
					name: frameworkName,
					version: "1.75.0",
					libraries: [
						{
							name: "sap.ui.lib1"
						},
						{
							name: "sap.ui.lib4",
							optional: true
						}
					]
				}
			}
		};

		const extractStub = sinon.stub(pacote, "extract");
		extractStub.callsFake(async (spec) => {
			throw new Error("pacote.extract stub called with unknown spec: " + spec);
		});

		const manifestStub = sinon.stub(pacote, "manifest");
		manifestStub.callsFake(async (spec) => {
			throw new Error("pacote.manifest stub called with unknown spec: " + spec);
		});

		if (frameworkName === "SAPUI5") {
			if (failExtract) {
				extractStub
					.withArgs("@sapui5/sap.ui.lib1@1.75.1")
					.rejects(new Error("404 - @sapui5/sap.ui.lib1"))
					.withArgs("@openui5/sap.ui.lib4@1.75.4")
					.rejects(new Error("404 - @openui5/sap.ui.lib4"));
			} else {
				extractStub
					.withArgs("@sapui5/sap.ui.lib1@1.75.1").resolves()
					.withArgs("@openui5/sap.ui.lib4@1.75.4").resolves();
			}
			if (failMetadata) {
				extractStub
					.withArgs("@sapui5/distribution-metadata@1.75.0")
					.rejects(new Error("404 - @sapui5/distribution-metadata"));
			} else {
				extractStub
					.withArgs("@sapui5/distribution-metadata@1.75.0")
					.resolves();
				sinon.stub(Installer.prototype, "readJson")
					.callThrough()
					.withArgs(path.join(fakeBaseDir,
						"homedir", ".ui5", "framework", "packages",
						"@sapui5", "distribution-metadata", "1.75.0",
						"metadata.json"))
					.resolves({
						libraries: {
							"sap.ui.lib1": {
								npmPackageName: "@sapui5/sap.ui.lib1",
								version: "1.75.1",
								dependencies: [],
								optionalDependencies: []
							},
							"sap.ui.lib2": {
								npmPackageName: "@sapui5/sap.ui.lib2",
								version: "1.75.2",
								dependencies: [
									"sap.ui.lib3"
								],
								optionalDependencies: []
							},
							"sap.ui.lib3": {
								npmPackageName: "@sapui5/sap.ui.lib3",
								version: "1.75.3",
								dependencies: [],
								optionalDependencies: [
									"sap.ui.lib4"
								]
							},
							"sap.ui.lib4": {
								npmPackageName: "@openui5/sap.ui.lib4",
								version: "1.75.4",
								dependencies: [
									"sap.ui.lib1"
								],
								optionalDependencies: []
							}
						}
					});
			}
		} else if (frameworkName === "OpenUI5") {
			if (failExtract) {
				extractStub
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.rejects(new Error("404 - @openui5/sap.ui.lib1"))
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.rejects(new Error("404 - @openui5/sap.ui.lib4"));
			} else {
				extractStub
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.resolves()
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.resolves();
			}
			if (failMetadata) {
				manifestStub
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.rejects(new Error("Failed to read manifest of @openui5/sap.ui.lib1@1.75.0"))
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.rejects(new Error("Failed to read manifest of @openui5/sap.ui.lib4@1.75.0"));
			} else {
				manifestStub
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.resolves({
						name: "@openui5/sap.ui.lib1",
						version: "1.75.0",
						dependencies: {}
					})
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.resolves({
						name: "@openui5/sap.ui.lib4",
						version: "1.75.0"
					});
			}
		}

		const provider = new DependencyTreeProvider({dependencyTree});
		const projectGraph = await projectGraphBuilder(provider);
		await t.throwsAsync(async () => {
			await ui5Framework.enrichProjectGraph(projectGraph);
		}, {message: expectedErrorMessage});
	});
}

defineErrorTest("SAPUI5: ui5Framework helper should throw a proper error when metadata request fails", {
	frameworkName: "SAPUI5",
	failMetadata: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata
Failed to resolve library sap.ui.lib4: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata` // TODO: should only be returned once?
});
defineErrorTest("SAPUI5: ui5Framework helper should throw a proper error when package extraction fails", {
	frameworkName: "SAPUI5",
	failExtract: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/sap.ui.lib1@1.75.1: ` +
`404 - @sapui5/sap.ui.lib1
Failed to resolve library sap.ui.lib4: Failed to extract package @openui5/sap.ui.lib4@1.75.4: ` +
`404 - @openui5/sap.ui.lib4`
});
defineErrorTest(
	"SAPUI5: ui5Framework helper should throw a proper error when metadata request and package extraction fails", {
		frameworkName: "SAPUI5",
		failMetadata: true,
		failExtract: true,
		expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata
Failed to resolve library sap.ui.lib4: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata`
	});


defineErrorTest("OpenUI5: ui5Framework helper should throw a proper error when metadata request fails", {
	frameworkName: "OpenUI5",
	failMetadata: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to read manifest of @openui5/sap.ui.lib1@1.75.0
Failed to resolve library sap.ui.lib4: Failed to read manifest of @openui5/sap.ui.lib4@1.75.0`
});
defineErrorTest("OpenUI5: ui5Framework helper should throw a proper error when package extraction fails", {
	frameworkName: "OpenUI5",
	failExtract: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @openui5/sap.ui.lib1@1.75.0: ` +
`404 - @openui5/sap.ui.lib1
Failed to resolve library sap.ui.lib4: Failed to extract package @openui5/sap.ui.lib4@1.75.0: ` +
`404 - @openui5/sap.ui.lib4`
});
defineErrorTest(
	"OpenUI5: ui5Framework helper should throw a proper error when metadata request and package extraction fails", {
		frameworkName: "OpenUI5",
		failMetadata: true,
		failExtract: true,
		expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to read manifest of @openui5/sap.ui.lib1@1.75.0
Failed to resolve library sap.ui.lib4: Failed to read manifest of @openui5/sap.ui.lib4@1.75.0`
	});

test.serial("ui5Framework helper should not fail when no framework configuration is given", async (t) => {
	const dependencyTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: [],
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "test-project"
			}
		}
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);
	await t.context.ui5Framework.enrichProjectGraph(projectGraph);

	t.is(projectGraph, projectGraph, "Returned same graph without error");
});

test.serial("ui5Framework translator should not try to install anything when no library is referenced", async (t) => {
	const dependencyTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: [],
		configuration: {
			specVersion: "2.1",
			type: "application",
			metadata: {
				name: "test-project"
			},
			framework: {
				name: "SAPUI5",
				version: "1.75.0"
			}
		}
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	const extractStub = sinon.stub(pacote, "extract");
	const manifestStub = sinon.stub(pacote, "manifest");

	await t.context.ui5Framework.enrichProjectGraph(projectGraph);

	t.is(extractStub.callCount, 0, "No package should be extracted");
	t.is(manifestStub.callCount, 0, "No manifest should be requested");
});

test.serial("ui5Framework translator should throw an error when framework version is not defined", async (t) => {
	const dependencyTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: [],
		configuration: {
			specVersion: "2.1",
			type: "application",
			metadata: {
				name: "test-project"
			},
			framework: {
				name: "SAPUI5"
			}
		}
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await t.throwsAsync(async () => {
		await t.context.ui5Framework.enrichProjectGraph(projectGraph);
	}, {message: `No framework version defined for root project test-project`}, "Correct error message");
});

test.serial(
	"SAPUI5: ui5Framework translator should throw error when using a library that is not part of the dist metadata",
	async (t) => {
		const dependencyTree = {
			id: "test-id",
			version: "1.2.3",
			path: path.join(fakeBaseDir, "application-project"),
			dependencies: [],
			configuration: {
				specVersion: "2.0",
				type: "application",
				metadata: {
					name: "test-project"
				},
				framework: {
					name: "SAPUI5",
					version: "1.75.0",
					libraries: [
						{name: "sap.ui.lib1"},
						{name: "does.not.exist"},
						{name: "sap.ui.lib4"},
					]
				}
			}
		};

		const provider = new DependencyTreeProvider({dependencyTree});
		const projectGraph = await projectGraphBuilder(provider);

		sinon.stub(pacote, "extract").resolves();

		sinon.stub(t.context.Installer.prototype, "readJson")
			.callThrough()
			.withArgs(path.join(fakeBaseDir,
				"homedir", ".ui5", "framework", "packages",
				"@sapui5", "distribution-metadata", "1.75.0",
				"metadata.json"))
			.resolves({
				libraries: {
					"sap.ui.lib1": {
						npmPackageName: "@sapui5/sap.ui.lib1",
						version: "1.75.1",
						dependencies: [],
						optionalDependencies: []
					},
					"sap.ui.lib4": {
						npmPackageName: "@openui5/sap.ui.lib4",
						version: "1.75.4",
						dependencies: [
							"sap.ui.lib1"
						],
						optionalDependencies: []
					}
				}
			});

		await t.throwsAsync(async () => {
			await t.context.ui5Framework.enrichProjectGraph(projectGraph);
		}, {
			message: `Resolution of framework libraries failed with errors:
Failed to resolve library does.not.exist: Could not find library "does.not.exist"`});
	});

// TODO test: Should not download packages again in case they are already installed

// TODO test: Should ignore framework libraries in dependencies
