import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import path from "node:path";
import {fileURLToPath} from "node:url";
import DependencyTreeProvider from "../../../../lib/graph/providers/DependencyTree.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use path within project as mocking base directory to reduce chance of side effects
// in case mocks/stubs do not work and real fs is used
const fakeBaseDir = path.join(__dirname, "fake-tmp");
const ui5FrameworkBaseDir = path.join(fakeBaseDir, "homedir", ".ui5", "framework");
const ui5PackagesBaseDir = path.join(ui5FrameworkBaseDir, "packages");

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.logStub = {
		info: sinon.stub(),
		verbose: sinon.stub(),
		silly: sinon.stub(),
		isLevelEnabled: sinon.stub().returns(false),
		_getLogger: sinon.stub()
	};
	const ui5Logger = {
		getLogger: sinon.stub().returns(t.context.logStub)
	};

	t.context.pacote = {
		extract: sinon.stub(),
		manifest: sinon.stub()
	};

	t.context.Registry = await esmock.p("../../../../lib/ui5Framework/npm/Registry.js", {
		"@ui5/logger": ui5Logger,
		"pacote": t.context.pacote,
		"libnpmconfig": {
			read: sinon.stub().returns({
				toJSON: () => {
					return {
						registry: "https://registry.fake",
						cache: path.join(ui5FrameworkBaseDir, "cacache"),
						proxy: ""
					};
				}
			})
		},
	});

	const AbstractInstaller = await esmock.p("../../../../lib/ui5Framework/AbstractInstaller.js", {
		"@ui5/logger": ui5Logger,
		"../../../../lib/utils/fs.js": {
			mkdirp: sinon.stub().resolves()
		},
		"lockfile": {
			lock: sinon.stub().yieldsAsync(),
			unlock: sinon.stub().yieldsAsync()
		}
	});

	t.context.Installer = await esmock.p("../../../../lib/ui5Framework/npm/Installer.js", {
		"@ui5/logger": ui5Logger,
		"graceful-fs": {
			rename: sinon.stub().yieldsAsync(),
		},
		"../../../../lib/utils/fs.js": {
			mkdirp: sinon.stub().resolves()
		},
		"../../../../lib/ui5Framework/npm/Registry.js": t.context.Registry,
		"../../../../lib/ui5Framework/AbstractInstaller.js": AbstractInstaller
	});

	t.context.AbstractResolver = await esmock.p("../../../../lib/ui5Framework/AbstractResolver.js", {
		"@ui5/logger": ui5Logger,
		"node:os": {
			homedir: sinon.stub().returns(path.join(fakeBaseDir, "homedir"))
		},
	});

	t.context.Openui5Resolver = await esmock.p("../../../../lib/ui5Framework/Openui5Resolver.js", {
		"@ui5/logger": ui5Logger,
		"node:os": {
			homedir: sinon.stub().returns(path.join(fakeBaseDir, "homedir"))
		},
		"../../../../lib/ui5Framework/AbstractResolver.js": t.context.AbstractResolver,
		"../../../../lib/ui5Framework/npm/Installer.js": t.context.Installer
	});

	t.context.Sapui5Resolver = await esmock.p("../../../../lib/ui5Framework/Sapui5Resolver.js", {
		"@ui5/logger": ui5Logger,
		"node:os": {
			homedir: sinon.stub().returns(path.join(fakeBaseDir, "homedir"))
		},
		"../../../../lib/ui5Framework/AbstractResolver.js": t.context.AbstractResolver,
		"../../../../lib/ui5Framework/npm/Installer.js": t.context.Installer
	});

	t.context.Application = await esmock.p("../../../../lib/specifications/types/Application.js");
	t.context.Library = await esmock.p("../../../../lib/specifications/types/Library.js");

	// Stub specification internal checks since none of the projects actually exist on disk
	sinon.stub(t.context.Application.prototype, "_configureAndValidatePaths").resolves();
	sinon.stub(t.context.Library.prototype, "_configureAndValidatePaths").resolves();
	sinon.stub(t.context.Application.prototype, "_parseConfiguration").resolves();
	sinon.stub(t.context.Library.prototype, "_parseConfiguration").resolves();

	t.context.Specification = await esmock.p("../../../../lib/specifications/Specification.js", {
		"@ui5/logger": ui5Logger,
		"../../../../lib/specifications/types/Application.js": t.context.Application,
		"../../../../lib/specifications/types/Library.js": t.context.Library
	});

	t.context.Module = await esmock.p("../../../../lib/graph/Module.js", {
		"@ui5/logger": ui5Logger,
		"../../../../lib/specifications/Specification.js": t.context.Specification
	});

	t.context.ui5Framework = await esmock.p("../../../../lib/graph/helpers/ui5Framework.js", {
		"@ui5/logger": ui5Logger,
		"../../../../lib/graph/Module.js": t.context.Module,
		"../../../../lib/ui5Framework/Openui5Resolver.js": t.context.Openui5Resolver,
		"../../../../lib/ui5Framework/Sapui5Resolver.js": t.context.Sapui5Resolver,
	});

	t.context.projectGraphBuilder = await esmock.p("../../../../lib/graph/projectGraphBuilder.js", {
		"@ui5/logger": ui5Logger,
		"../../../../lib/graph/Module.js": t.context.Module
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	esmock.purge(t.context.Registry);
	esmock.purge(t.context.Installer);
	esmock.purge(t.context.AbstractResolver);
	esmock.purge(t.context.Sapui5Resolver);
	esmock.purge(t.context.Application);
	esmock.purge(t.context.Library);
	esmock.purge(t.context.Specification);
	esmock.purge(t.context.Module);
	esmock.purge(t.context.ui5Framework);
	esmock.purge(t.context.projectGraphBuilder);
});

function defineTest(testName, {
	frameworkName,
	verbose = false,
	librariesInWorkspace = null
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
		const {sinon, ui5Framework, Installer, projectGraphBuilder, Module, pacote, logStub} = t.context;

		// Enable verbose logging
		if (verbose) {
			logStub.isLevelEnabled.withArgs("verbose").returns(true);
		}

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
				// eslint-disable-next-line no-invalid-this
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
						// eslint-disable-next-line no-invalid-this
						(this.getId())
					);
				}
			});

		pacote.extract.resolves();

		if (frameworkName === "OpenUI5") {
			pacote.manifest
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

		if (librariesInWorkspace) {
			const projectNameMap = new Map();
			const moduleIdMap = new Map();
			librariesInWorkspace.forEach((libName) => {
				const libraryDistMetadata = distributionMetadata.libraries[libName];
				const module = {
					getSpecifications: sinon.stub().resolves({
						project: {
							getName: sinon.stub().returns(libName),
							getVersion: sinon.stub().returns("1.76.0-SNAPSHOT"),
							getRootPath: sinon.stub().returns(path.join(fakeBaseDir, "workspace", libName)),
							isFrameworkProject: sinon.stub().returns(true),
							getId: sinon.stub().returns(libraryDistMetadata.npmPackageName),
							getRootReader: sinon.stub().returns({
								byPath: sinon.stub().resolves({
									getString: sinon.stub().resolves(JSON.stringify({dependencies: {}}))
								})
							}),
							getFrameworkDependencies: sinon.stub().callsFake(() => {
								const deps = [];
								libraryDistMetadata.dependencies.forEach((dep) => {
									deps.push({name: dep});
								});
								libraryDistMetadata.optionalDependencies.forEach((optDep) => {
									deps.push({name: optDep, optional: true});
								});
								return deps;
							}),
							isDeprecated: sinon.stub().returns(false),
							isSapInternal: sinon.stub().returns(false),
							getAllowSapInternal: sinon.stub().returns(false),
						}
					}),
					getVersion: sinon.stub().returns("1.76.0-SNAPSHOT"),
					getPath: sinon.stub().returns(path.join(fakeBaseDir, "workspace", libName)),
				};
				projectNameMap.set(libName, module);
				moduleIdMap.set(libraryDistMetadata.npmPackageName, module);
			});

			const getModuleByProjectName = sinon.stub().callsFake(
				async (projectName) => projectNameMap.get(projectName)
			);
			const getModules = sinon.stub().callsFake(
				async () => {
					const sortedMap = new Map([...moduleIdMap].sort((a, b) => String(a[0]).localeCompare(b[0])));
					return Array.from(sortedMap.values());
				}
			);

			const workspace = {
				getName: sinon.stub().returns("test"),
				getModules,
				getModuleByProjectName
			};

			await ui5Framework.enrichProjectGraph(projectGraph, {workspace});
		} else {
			await ui5Framework.enrichProjectGraph(projectGraph);
		}

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

		t.deepEqual(projectGraph.getDependencies("test-application"), [
			"test-dependency",
			"test-dependency-no-framework",
			"sap.ui.lib1",
			"sap.ui.lib8",
			"sap.ui.lib4",
		], `Non-framework dependency has correct dependencies`);

		t.deepEqual(projectGraph.getDependencies("test-dependency"), [
			"sap.ui.lib1",
			"sap.ui.lib2",
			"sap.ui.lib8",
		], `Non-framework dependency has correct dependencies`);

		const frameworkLibAlreadyAddedInfoLogged = (logStub.info.getCalls()
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

defineTest("ui5Framework helper should not cause install of libraries within workspace", {
	frameworkName: "SAPUI5",
	librariesInWorkspace: ["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib8"]
});
defineTest("ui5Framework helper should not cause install of libraries within workspace", {
	frameworkName: "OpenUI5",
	librariesInWorkspace: ["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib8"]
});

function defineErrorTest(testName, {
	frameworkName,
	failExtract = false,
	failMetadata = false,
	expectedErrorMessage
}) {
	test.serial(testName, async (t) => {
		const {sinon, ui5Framework, Installer, projectGraphBuilder, pacote} = t.context;

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

		pacote.extract.callsFake(async (spec) => {
			throw new Error("pacote.extract stub called with unknown spec: " + spec);
		});

		pacote.manifest.callsFake(async (spec) => {
			throw new Error("pacote.manifest stub called with unknown spec: " + spec);
		});

		if (frameworkName === "SAPUI5") {
			if (failExtract) {
				pacote.extract
					.withArgs("@sapui5/sap.ui.lib1@1.75.1")
					.rejects(new Error("404 - @sapui5/sap.ui.lib1"))
					.withArgs("@openui5/sap.ui.lib4@1.75.4")
					.rejects(new Error("404 - @openui5/sap.ui.lib4"));
			} else {
				pacote.extract
					.withArgs("@sapui5/sap.ui.lib1@1.75.1").resolves()
					.withArgs("@openui5/sap.ui.lib4@1.75.4").resolves();
			}
			if (failMetadata) {
				pacote.extract
					.withArgs("@sapui5/distribution-metadata@1.75.0")
					.rejects(new Error("404 - @sapui5/distribution-metadata"));
			} else {
				pacote.extract
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
				pacote.extract
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.rejects(new Error("404 - @openui5/sap.ui.lib1"))
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.rejects(new Error("404 - @openui5/sap.ui.lib4"));
			} else {
				pacote.extract
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.resolves()
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.resolves();
			}
			if (failMetadata) {
				pacote.manifest
					.withArgs("@openui5/sap.ui.lib1@1.75.0")
					.rejects(new Error("Failed to read manifest of @openui5/sap.ui.lib1@1.75.0"))
					.withArgs("@openui5/sap.ui.lib4@1.75.0")
					.rejects(new Error("Failed to read manifest of @openui5/sap.ui.lib4@1.75.0"));
			} else {
				pacote.manifest
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
  1. Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata
  2. Failed to resolve library sap.ui.lib4: Error already logged`
});
defineErrorTest("SAPUI5: ui5Framework helper should throw a proper error when package extraction fails", {
	frameworkName: "SAPUI5",
	failExtract: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/sap.ui.lib1@1.75.1: ` +
`404 - @sapui5/sap.ui.lib1
  2. Failed to resolve library sap.ui.lib4: Failed to extract package @openui5/sap.ui.lib4@1.75.4: ` +
`404 - @openui5/sap.ui.lib4`
});
defineErrorTest(
	"SAPUI5: ui5Framework helper should throw a proper error when metadata request and package extraction fails", {
		frameworkName: "SAPUI5",
		failMetadata: true,
		failExtract: true,
		expectedErrorMessage: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Failed to extract package @sapui5/distribution-metadata@1.75.0: ` +
`404 - @sapui5/distribution-metadata
  2. Failed to resolve library sap.ui.lib4: Error already logged`
	});


defineErrorTest("OpenUI5: ui5Framework helper should throw a proper error when metadata request fails", {
	frameworkName: "OpenUI5",
	failMetadata: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Failed to read manifest of @openui5/sap.ui.lib1@1.75.0
  2. Failed to resolve library sap.ui.lib4: Failed to read manifest of @openui5/sap.ui.lib4@1.75.0`
});
defineErrorTest("OpenUI5: ui5Framework helper should throw a proper error when package extraction fails", {
	frameworkName: "OpenUI5",
	failExtract: true,
	expectedErrorMessage: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Failed to extract package @openui5/sap.ui.lib1@1.75.0: ` +
`404 - @openui5/sap.ui.lib1
  2. Failed to resolve library sap.ui.lib4: Failed to extract package @openui5/sap.ui.lib4@1.75.0: ` +
`404 - @openui5/sap.ui.lib4`
});
defineErrorTest(
	"OpenUI5: ui5Framework helper should throw a proper error when metadata request and package extraction fails", {
		frameworkName: "OpenUI5",
		failMetadata: true,
		failExtract: true,
		expectedErrorMessage: `Resolution of framework libraries failed with errors:
  1. Failed to resolve library sap.ui.lib1: Failed to read manifest of @openui5/sap.ui.lib1@1.75.0
  2. Failed to resolve library sap.ui.lib4: Failed to read manifest of @openui5/sap.ui.lib4@1.75.0`
	});

test.serial("ui5Framework helper should not fail when no framework configuration is given", async (t) => {
	const {ui5Framework, projectGraphBuilder} = t.context;

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
	await ui5Framework.enrichProjectGraph(projectGraph);

	t.is(projectGraph, projectGraph, "Returned same graph without error");
});

test.serial("ui5Framework translator should not try to install anything when no library is referenced", async (t) => {
	const {ui5Framework, projectGraphBuilder, pacote} = t.context;

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

	await ui5Framework.enrichProjectGraph(projectGraph);

	t.is(pacote.extract.callCount, 0, "No package should be extracted");
	t.is(pacote.manifest.callCount, 0, "No manifest should be requested");
});

test.serial("ui5Framework helper shouldn't throw when framework version and libraries are not provided", async (t) => {
	const {ui5Framework, projectGraphBuilder, logStub} = t.context;

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

	await ui5Framework.enrichProjectGraph(projectGraph);

	t.is(logStub.verbose.callCount, 5);
	t.deepEqual(logStub.verbose.getCall(0).args, [
		"Configuration for module test-id has been supplied directly"
	]);
	t.deepEqual(logStub.verbose.getCall(1).args, [
		"Module test-id contains project test-project"
	]);
	t.deepEqual(logStub.verbose.getCall(2).args, [
		"Root project test-project qualified as application project for project graph"
	]);
	t.deepEqual(logStub.verbose.getCall(3).args, [
		"Project test-project has no framework dependencies"
	]);
	t.deepEqual(logStub.verbose.getCall(4).args, [
		"No SAPUI5 libraries referenced in project test-project or in any of its dependencies"
	]);
});

test.serial(
	"SAPUI5: ui5Framework helper should throw error when using a library that is not part of the dist metadata",
	async (t) => {
		const {sinon, ui5Framework, Installer, projectGraphBuilder} = t.context;

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
			await ui5Framework.enrichProjectGraph(projectGraph);
		}, {
			message: `Failed to resolve library does.not.exist: Could not find library "does.not.exist"`});
	});

// TODO test: Should not download packages again in case they are already installed

// TODO test: Should ignore framework libraries in dependencies
