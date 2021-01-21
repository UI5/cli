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
const normalizer = require("../../../lib/normalizer");
const projectPreprocessor = require("../../../lib/projectPreprocessor");
let ui5Framework;
let Installer;

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

	// Re-require to ensure that mocked modules are used
	ui5Framework = mock.reRequire("../../../lib/translators/ui5Framework");
	Installer = require("../../../lib/ui5Framework/npm/Installer");
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

	function project({name, version, type, specVersion = "2.0", framework, _level, dependencies = []}) {
		const proj = {
			_level,
			id: name + "-id",
			version,
			path: path.join(fakeBaseDir, "project-" + name),
			specVersion,
			kind: "project",
			type,
			metadata: {
				name
			},
			dependencies
		};
		if (_level === 0) {
			proj._isRoot = true;
		}
		if (framework) {
			proj.framework = framework;
		}
		return proj;
	}
	function frameworkProject({name, _level, dependencies = []}) {
		const metadata = frameworkName === "SAPUI5" ? distributionMetadata.libraries[name] : null;
		const id = frameworkName === "SAPUI5" ? metadata.npmPackageName : npmScope + "/" + name;
		const version = frameworkName === "SAPUI5" ? metadata.version : "1.75.0";
		return {
			_level,
			id,
			version,
			path: path.join(
				ui5PackagesBaseDir,
				// sap.ui.lib4 is in @openui5 scope in SAPUI5 and OpenUI5
				name === "sap.ui.lib4" ? "@openui5" : npmScope,
				name, version
			),
			specVersion: "1.0",
			kind: "project",
			type: "library",
			metadata: {
				name
			},
			framework: {
				libraries: []
			},
			dependencies
		};
	}

	test.serial(`${frameworkName}: ${verbose ? "(verbose) " : ""}${testName}`, async (t) => {
		// Enable verbose logging
		if (verbose) {
			logger.setLevel("verbose");
		}

		const testDependency = {
			id: "test-dependency-id",
			version: "4.5.6",
			path: path.join(fakeBaseDir, "project-test-dependency"),
			dependencies: []
		};
		const translatorTree = {
			id: "test-application-id",
			version: "1.2.3",
			path: path.join(fakeBaseDir, "project-test-application"),
			dependencies: [
				testDependency,
				{
					id: "test-dependency-no-framework-id",
					version: "7.8.9",
					path: path.join(fakeBaseDir, "project-test-dependency-no-framework"),
					dependencies: [
						testDependency
					]
				},
				{
					id: "test-dependency-framework-old-spec-version-id",
					version: "10.11.12",
					path: path.join(fakeBaseDir, "project-test-dependency-framework-old-spec-version"),
					dependencies: []
				}
			]
		};

		sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);

		sinon.stub(projectPreprocessor._ProjectPreprocessor.prototype, "readConfigFile")
			.callsFake(async (project) => {
				switch (project.path) {
				case path.join(fakeBaseDir, "project-test-application"):
					return [{
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
					}];
				case path.join(fakeBaseDir, "project-test-dependency"):
					return [{
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
					}];
				case path.join(fakeBaseDir, "project-test-dependency-no-framework"):
					return [{
						specVersion: "2.0",
						type: "library",
						metadata: {
							name: "test-dependency-no-framework"
						}
					}];
				case path.join(fakeBaseDir, "project-test-dependency-framework-old-spec-version"):
					return [{
						specVersion: "1.1",
						type: "library",
						metadata: {
							name: "test-dependency-framework-old-spec-version"
						},
						framework: {
							libraries: [
								{
									name: "sap.ui.lib5"
								}
							]
						}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib1",
					frameworkName === "SAPUI5" ? "1.75.1" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib1"
						},
						framework: {libraries: []}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib2",
					frameworkName === "SAPUI5" ? "1.75.2" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib2"
						},
						framework: {libraries: []}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib3",
					frameworkName === "SAPUI5" ? "1.75.3" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib3"
						},
						framework: {libraries: []}
					}];
				case path.join(ui5PackagesBaseDir, "@openui5", "sap.ui.lib4",
					frameworkName === "SAPUI5" ? "1.75.4" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib4"
						},
						framework: {libraries: []}
					}];
				case path.join(ui5PackagesBaseDir, npmScope, "sap.ui.lib8",
					frameworkName === "SAPUI5" ? "1.75.8" : "1.75.0"):
					return [{
						specVersion: "1.0",
						type: "library",
						metadata: {
							name: "sap.ui.lib8"
						},
						framework: {libraries: []}
					}];
				default:
					throw new Error(
						"ProjectPreprocessor#readConfigFile stub called with unknown project: " +
						(project && project.path)
					);
				}
			});

		// Prevent applying types as this would require a lot of mocking
		sinon.stub(projectPreprocessor._ProjectPreprocessor.prototype, "applyType");

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

		const testDependencyProject = project({
			_level: 1,
			name: "test-dependency",
			version: "4.5.6",
			type: "library",
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
						optional: true
					}
				]
			},
			dependencies: [
				frameworkProject({
					_level: 1,
					name: "sap.ui.lib1",
				}),
				frameworkProject({
					_level: 1,
					name: "sap.ui.lib2",
					dependencies: [
						frameworkProject({
							_level: 2,
							name: "sap.ui.lib3",
							dependencies: [
								frameworkProject({
									name: "sap.ui.lib4",
									_level: 1,
									dependencies: [
										frameworkProject({
											_level: 1,
											name: "sap.ui.lib1"
										})
									]
								})
							]
						})
					]
				}),
				frameworkProject({
					_level: 1,
					name: "sap.ui.lib8",
				})
			]
		});
		const expectedTree = project({
			_level: 0,
			name: "test-application",
			version: "1.2.3",
			type: "application",
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
			},
			dependencies: [
				testDependencyProject,
				project({
					_level: 1,
					name: "test-dependency-no-framework",
					version: "7.8.9",
					type: "library",
					dependencies: [testDependencyProject]
				}),
				project({
					_level: 1,
					name: "test-dependency-framework-old-spec-version",
					specVersion: "1.1",
					version: "10.11.12",
					type: "library",
					framework: {
						libraries: [
							{
								name: "sap.ui.lib5"
							}
						]
					},
				}),
				frameworkProject({
					_level: 1,
					name: "sap.ui.lib1",
				}),
				frameworkProject({
					name: "sap.ui.lib4",
					_level: 1,
					dependencies: [
						frameworkProject({
							_level: 1,
							name: "sap.ui.lib1"
						})
					]
				}),
				frameworkProject({
					_level: 1,
					name: "sap.ui.lib8",
				})
			]
		});

		const tree = await normalizer.generateProjectTree();

		t.deepEqual(tree, expectedTree, "Returned tree should be correct");
		const frameworkLibAlreadyAddedInfoLogged = (t.context.logInfoSpy.getCalls()
			.map(($) => $.firstArg)
			.findIndex(($) => $.includes("defines a dependency to the UI5 framework library")) !== -1);
		t.false(frameworkLibAlreadyAddedInfoLogged, "No info regarding already added UI5 framework libraries logged");
	});
}

defineTest("ui5Framework translator should enhance tree with UI5 framework libraries", {
	frameworkName: "SAPUI5"
});
defineTest("ui5Framework translator should enhance tree with UI5 framework libraries", {
	frameworkName: "SAPUI5",
	verbose: true
});
defineTest("ui5Framework translator should enhance tree with UI5 framework libraries", {
	frameworkName: "OpenUI5"
});
defineTest("ui5Framework translator should enhance tree with UI5 framework libraries", {
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
		const translatorTree = {
			id: "test-id",
			version: "1.2.3",
			path: path.join(fakeBaseDir, "application-project"),
			dependencies: []
		};

		sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);

		sinon.stub(projectPreprocessor._ProjectPreprocessor.prototype, "readConfigFile")
			.callsFake(async (project) => {
				switch (project.path) {
				case path.join(fakeBaseDir, "application-project"):
					return [{
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
					}];
				default:
					throw new Error(
						"ProjectPreprocessor#readConfigFile stub called with unknown project: " +
						(project && project.path)
					);
				}
			});

		// Prevent applying types as this would require a lot of mocking
		sinon.stub(projectPreprocessor._ProjectPreprocessor.prototype, "applyType");

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

		await t.throwsAsync(async () => {
			await normalizer.generateProjectTree();
		}, {message: expectedErrorMessage});
	});
}

defineErrorTest("SAPUI5: ui5Framework translator should throw a proper error when metadata request fails", {
	frameworkName: "SAPUI5",
	failMetadata: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata
Failed to resolve library sap.ui.lib4: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata` // TODO: should only be returned once?
});
defineErrorTest("SAPUI5: ui5Framework translator should throw a proper error when package extraction fails", {
	frameworkName: "SAPUI5",
	failExtract: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/sap.ui.lib1@1.75.1: ` +
`404 - @sapui5/sap.ui.lib1
Failed to resolve library sap.ui.lib4: Failed to extract package @openui5/sap.ui.lib4@1.75.4: ` +
`404 - @openui5/sap.ui.lib4`
});
defineErrorTest(
	"SAPUI5: ui5Framework translator should throw a proper error when metadata request and package extraction fails", {
		frameworkName: "SAPUI5",
		failMetadata: true,
		failExtract: true,
		expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata
Failed to resolve library sap.ui.lib4: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata`
	});


defineErrorTest("OpenUI5: ui5Framework translator should throw a proper error when metadata request fails", {
	frameworkName: "OpenUI5",
	failMetadata: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to read manifest of @openui5/sap.ui.lib1@1.75.0
Failed to resolve library sap.ui.lib4: Failed to read manifest of @openui5/sap.ui.lib4@1.75.0`
});
defineErrorTest("OpenUI5: ui5Framework translator should throw a proper error when package extraction fails", {
	frameworkName: "OpenUI5",
	failExtract: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to extract package @openui5/sap.ui.lib1@1.75.0: ` +
`404 - @openui5/sap.ui.lib1
Failed to resolve library sap.ui.lib4: Failed to extract package @openui5/sap.ui.lib4@1.75.0: ` +
`404 - @openui5/sap.ui.lib4`
});
defineErrorTest(
	"OpenUI5: ui5Framework translator should throw a proper error when metadata request and package extraction fails", {
		frameworkName: "OpenUI5",
		failMetadata: true,
		failExtract: true,
		expectedErrorMessage: `Resolution of framework libraries failed with errors:
Failed to resolve library sap.ui.lib1: Failed to read manifest of @openui5/sap.ui.lib1@1.75.0
Failed to resolve library sap.ui.lib4: Failed to read manifest of @openui5/sap.ui.lib4@1.75.0`
	});

test.serial("ui5Framework translator should not be called when no framework configuration is given", async (t) => {
	const translatorTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: []
	};
	const projectPreprocessorTree = Object.assign({}, translatorTree, {
		specVersion: "1.1",
		type: "application",
		metadata: {
			name: "test-project"
		}
	});

	sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);
	sinon.stub(projectPreprocessor, "processTree").withArgs(translatorTree).resolves(projectPreprocessorTree);

	const ui5FrameworkMock = sinon.mock(ui5Framework);
	ui5FrameworkMock.expects("generateDependencyTree").never();

	const expectedTree = projectPreprocessorTree;

	const tree = await normalizer.generateProjectTree();

	t.deepEqual(tree, expectedTree, "Returned tree should be correct");
	ui5FrameworkMock.verify();
});

test.serial("ui5Framework translator should not try to install anything when no library is referenced", async (t) => {
	const translatorTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: []
	};
	const projectPreprocessorTree = Object.assign({}, translatorTree, {
		specVersion: "1.1",
		type: "application",
		metadata: {
			name: "test-project"
		},
		framework: {
			name: "SAPUI5",
			version: "1.75.0"
		}
	});
	const frameworkTree = Object.assign({}, projectPreprocessorTree, {
		_transparentProject: true
	});

	sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);
	sinon.stub(projectPreprocessor, "processTree")
		.withArgs(translatorTree).resolves(projectPreprocessorTree)
		.withArgs(frameworkTree).resolves(frameworkTree);

	const extractStub = sinon.stub(pacote, "extract");
	const manifestStub = sinon.stub(pacote, "manifest");

	await normalizer.generateProjectTree();

	t.is(extractStub.callCount, 0, "No package should be extracted");
	t.is(manifestStub.callCount, 0, "No manifest should be requested");
});

test.serial("ui5Framework translator should throw an error when framework version is not defined", async (t) => {
	const translatorTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: []
	};
	const projectPreprocessorTree = Object.assign({}, translatorTree, {
		specVersion: "1.1",
		type: "application",
		metadata: {
			name: "test-project"
		},
		framework: {
			name: "SAPUI5"
		}
	});

	sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);
	sinon.stub(projectPreprocessor, "processTree").withArgs(translatorTree).resolves(projectPreprocessorTree);

	await t.throwsAsync(async () => {
		await normalizer.generateProjectTree();
	}, {message: `framework.version is not defined for project test-id`});
});

test.serial("ui5Framework translator should throw an error when framework name is not supported", async (t) => {
	const translatorTree = {
		id: "test-id",
		version: "1.2.3",
		path: path.join(fakeBaseDir, "application-project"),
		dependencies: []
	};
	const projectPreprocessorTree = Object.assign({}, translatorTree, {
		specVersion: "1.1",
		type: "application",
		metadata: {
			name: "test-project"
		},
		framework: {
			name: "UI5"
		}
	});

	sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);
	sinon.stub(projectPreprocessor, "processTree").withArgs(translatorTree).resolves(projectPreprocessorTree);

	await t.throwsAsync(async () => {
		await normalizer.generateProjectTree();
	}, {message: `Unknown framework.name "UI5" for project test-id. Must be "OpenUI5" or "SAPUI5"`});
});

test.serial(
	"SAPUI5: ui5Framework translator should throw error when using a library that is not part of the dist metadata",
	async (t) => {
		const translatorTree = {
			id: "test-id",
			version: "1.2.3",
			path: path.join(fakeBaseDir, "application-project"),
			dependencies: []
		};
		const projectPreprocessorTree = Object.assign({}, translatorTree, {
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
		});

		sinon.stub(normalizer, "generateDependencyTree").resolves(translatorTree);
		sinon.stub(projectPreprocessor, "processTree").withArgs(translatorTree).resolves(projectPreprocessorTree);

		sinon.stub(pacote, "extract").resolves();

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
			await normalizer.generateProjectTree();
		}, {
			message: `Resolution of framework libraries failed with errors:
Failed to resolve library does.not.exist: Could not find library "does.not.exist"`});
	});

// TODO test: Should not download packages again in case they are already installed

// TODO test: Should ignore framework libraries in dependencies
