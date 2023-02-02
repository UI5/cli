import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import DependencyTreeProvider from "../../../../lib/graph/providers/DependencyTree.js";
import projectGraphBuilder from "../../../../lib/graph/projectGraphBuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const libraryDPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.d");
const libraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.e");
const libraryFPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.f");

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		info: sinon.stub(),
		warn: sinon.stub(),
		verbose: sinon.stub(),
		isLevelEnabled: sinon.stub().returns(false),
		_getLogger: sinon.stub()
	};
	const ui5Logger = {
		getLogger: sinon.stub().returns(t.context.log)
	};

	t.context.Sapui5ResolverStub = sinon.stub();
	t.context.Sapui5ResolverInstallStub = sinon.stub();
	t.context.Sapui5ResolverStub.callsFake(() => {
		return {
			install: t.context.Sapui5ResolverInstallStub
		};
	});
	t.context.Sapui5ResolverResolveVersionStub = sinon.stub();
	t.context.Sapui5ResolverStub.resolveVersion = t.context.Sapui5ResolverResolveVersionStub;

	t.context.ui5Framework = await esmock.p("../../../../lib/graph/helpers/ui5Framework.js", {
		"@ui5/logger": ui5Logger,
		"../../../../lib/ui5Framework/Openui5Resolver.js": t.context.Openui5ResolverStub,
		"../../../../lib/ui5Framework/Sapui5Resolver.js": t.context.Sapui5ResolverStub,
	});
	t.context.utils = t.context.ui5Framework._utils;
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
	esmock.purge(t.context.ui5Framework);
});

test.serial("enrichProjectGraph", async (t) => {
	const {sinon, ui5Framework, utils, Sapui5ResolverInstallStub} = t.context;

	const dependencyTree = {
		id: "test1",
		version: "1.0.0",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.75.0"
			}
		}
	};

	const referencedLibraries = ["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib3"];
	const libraryMetadata = {fake: "metadata"};

	const getFrameworkLibrariesFromGraphStub = sinon.stub(utils, "getFrameworkLibrariesFromGraph")
		.resolves(referencedLibraries);

	Sapui5ResolverInstallStub.resolves({libraryMetadata});


	const addProjectToGraphStub = sinon.stub();
	const ProjectProcessorStub = sinon.stub(utils, "ProjectProcessor")
		.callsFake(() => {
			return {
				addProjectToGraph: addProjectToGraphStub
			};
		});

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await ui5Framework.enrichProjectGraph(projectGraph);

	t.is(getFrameworkLibrariesFromGraphStub.callCount, 1, "getFrameworkLibrariesFromGraph should be called once");

	t.is(t.context.Sapui5ResolverStub.callCount, 1, "Sapui5Resolver#constructor should be called once");
	t.deepEqual(t.context.Sapui5ResolverStub.getCall(0).args, [{
		cwd: dependencyTree.path,
		version: dependencyTree.configuration.framework.version
	}], "Sapui5Resolver#constructor should be called with expected args");

	t.is(t.context.Sapui5ResolverInstallStub.callCount, 1, "Sapui5Resolver#install should be called once");
	t.deepEqual(t.context.Sapui5ResolverInstallStub.getCall(0).args, [
		referencedLibraries
	], "Sapui5Resolver#install should be called with expected args");

	t.is(ProjectProcessorStub.callCount, 1, "ProjectProcessor#constructor should be called once");
	const projectProcessorConstructorArgs = ProjectProcessorStub.getCall(0).args[0];
	t.deepEqual(projectProcessorConstructorArgs.libraryMetadata, libraryMetadata,
		"Correct libraryMetadata provided to ProjectProcessor");
	t.is(projectProcessorConstructorArgs.graph._rootProjectName,
		"fake-root-of-application.a-framework-dependency-graph",
		"Correct graph provided to ProjectProcessor");
	t.falsy(projectProcessorConstructorArgs.workspace,
		"No workspace provided to ProjectProcessor");

	t.is(addProjectToGraphStub.callCount, 3, "ProjectProcessor#getProject should be called 3 times");
	t.deepEqual(addProjectToGraphStub.getCall(0).args[0], referencedLibraries[0],
		"ProjectProcessor#addProjectToGraph should be called with expected first arg (call 1)");
	t.deepEqual(addProjectToGraphStub.getCall(1).args[0], referencedLibraries[1],
		"ProjectProcessor#addProjectToGraph should be called with expected first arg (call 2)");
	t.deepEqual(addProjectToGraphStub.getCall(2).args[0], referencedLibraries[2],
		"ProjectProcessor#addProjectToGraph should be called with expected first arg (call 3)");


	const callbackStub = sinon.stub().resolves();
	await projectGraph.traverseDepthFirst(callbackStub);

	t.is(callbackStub.callCount, 1, "Correct number of projects have been visited");

	const callbackCalls = callbackStub.getCalls().map((call) => call.args[0].project.getName());
	t.deepEqual(callbackCalls, [
		"application.a"
	], "Traversed graph in correct order");
});

test.serial("enrichProjectGraph: With versionOverride", async (t) => {
	const {
		sinon, ui5Framework, utils,
		Sapui5ResolverStub, Sapui5ResolverResolveVersionStub, Sapui5ResolverInstallStub
	} = t.context;

	const dependencyTree = {
		id: "test1",
		version: "1.0.0",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.75.0"
			}
		}
	};

	const referencedLibraries = ["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib3"];
	const libraryMetadata = {fake: "metadata"};

	sinon.stub(utils, "getFrameworkLibrariesFromGraph").resolves(referencedLibraries);

	Sapui5ResolverInstallStub.resolves({libraryMetadata});

	Sapui5ResolverResolveVersionStub.resolves("1.99.9");

	const addProjectToGraphStub = sinon.stub();
	sinon.stub(utils, "ProjectProcessor")
		.callsFake(() => {
			return {
				addProjectToGraph: addProjectToGraphStub
			};
		});

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride: "1.99"});

	t.is(Sapui5ResolverStub.callCount, 1, "Sapui5Resolver#constructor should be called once");
	t.deepEqual(Sapui5ResolverStub.getCall(0).args, [{
		cwd: dependencyTree.path,
		version: "1.99.9"
	}], "Sapui5Resolver#constructor should be called with expected args");
});

test.serial("enrichProjectGraph should throw error when no framework version is provided", async (t) => {
	const {ui5Framework} = t.context;
	const dependencyTree = {
		id: "test-id",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5"
			}
		}
	};

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await t.throwsAsync(async () => {
		await ui5Framework.enrichProjectGraph(projectGraph);
	}, {message: "No framework version defined for root project application.a"});
});

test.serial("enrichProjectGraph should skip framework project without version", async (t) => {
	const {ui5Framework} = t.context;
	const dependencyTree = {
		id: "@sapui5/project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5"
			}
		}
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await ui5Framework.enrichProjectGraph(projectGraph);
	t.is(projectGraph.getSize(), 1, "Project graph should remain unchanged");
});

test.serial("enrichProjectGraph should resolve framework project with version and framework config", async (t) => {
	// Framework projects should not specify framework versions, but they might do so in dedicated configuration files
	// In this case the graph is generated the usual way for the root-project. However, framework projects on
	// other levels of the graph are ignored
	const {
		sinon, ui5Framework, utils,
		Sapui5ResolverStub, Sapui5ResolverInstallStub
	} = t.context;
	const dependencyTree = {
		id: "@sapui5/project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.2.3",
				libraries: [
					{
						name: "lib1",
						optional: true
					}
				]
			}
		},
		dependencies: [{
			id: "@openui5/test1", // Will not be scanned
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "library.d"
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "lib2"
					}]
				}
			}
		}]
	};
	const referencedLibraries = ["lib1"];
	const libraryMetadata = {fake: "metadata"};

	const getFrameworkLibrariesFromGraphStub =
		sinon.stub(utils, "getFrameworkLibrariesFromGraph").resolves(referencedLibraries);

	Sapui5ResolverInstallStub.resolves({libraryMetadata});

	const addProjectToGraphStub = sinon.stub();
	sinon.stub(utils, "ProjectProcessor")
		.callsFake(() => {
			return {
				addProjectToGraph: addProjectToGraphStub
			};
		});

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await ui5Framework.enrichProjectGraph(projectGraph);
	t.is(projectGraph.getSize(), 2, "Project graph should remain unchanged");

	t.is(getFrameworkLibrariesFromGraphStub.callCount, 1, "getFrameworkLibrariesFromGrap should be called once");
	t.is(Sapui5ResolverStub.callCount, 1, "Sapui5Resolver#constructor should be called once");
	t.deepEqual(Sapui5ResolverStub.getCall(0).args, [{
		cwd: dependencyTree.path,
		version: "1.2.3"
	}], "Sapui5Resolver#constructor should be called with expected args");
});

test.serial("enrichProjectGraph should resolve framework project " +
	"with framework config and version override", async (t) => {
	// Framework projects should not specify framework versions, but they might do so in dedicated configuration files
	// In this case the graph is generated the usual way for the root-project. However, framework projects on
	// other levels of the graph are ignored
	const {
		sinon, ui5Framework, utils,
		Sapui5ResolverStub, Sapui5ResolverResolveVersionStub, Sapui5ResolverInstallStub
	} = t.context;
	const dependencyTree = {
		id: "@sapui5/project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				libraries: [
					{
						name: "lib1",
						optional: true
					}
				]
			}
		},
		dependencies: [{
			id: "@openui5/test1", // Will not be scanned
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "library.d"
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "lib2"
					}]
				}
			}
		}]
	};
	const referencedLibraries = ["lib1"];
	const libraryMetadata = {fake: "metadata"};

	const getFrameworkLibrariesFromGraphStub =
		sinon.stub(utils, "getFrameworkLibrariesFromGraph").resolves(referencedLibraries);

	Sapui5ResolverInstallStub.resolves({libraryMetadata});
	Sapui5ResolverResolveVersionStub.resolves("1.99.9");

	const addProjectToGraphStub = sinon.stub();
	sinon.stub(utils, "ProjectProcessor")
		.callsFake(() => {
			return {
				addProjectToGraph: addProjectToGraphStub
			};
		});

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await ui5Framework.enrichProjectGraph(projectGraph, {versionOverride: "3.4.5"});
	t.is(projectGraph.getSize(), 2, "Project graph should remain unchanged");

	t.is(Sapui5ResolverStub.callCount, 1, "Sapui5Resolver#constructor should be called once");
	t.is(getFrameworkLibrariesFromGraphStub.callCount, 1, "getFrameworkLibrariesFromGrap should be called once");
	t.deepEqual(Sapui5ResolverStub.getCall(0).args, [{
		cwd: dependencyTree.path,
		version: "1.99.9"
	}], "Sapui5Resolver#constructor should be called with expected args");
});

test.serial("enrichProjectGraph should throw for framework project with dependency missing in graph", async (t) => {
	const {ui5Framework} = t.context;
	const dependencyTree = {
		id: "@sapui5/project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				libraries: [
					{
						name: "lib1"
					}
				]
			}
		}
	};

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	const err = await t.throwsAsync(ui5Framework.enrichProjectGraph(projectGraph));
	t.is(err.message, `Missing framework dependency lib1 for framework project application.a`,
		"Threw with expected error message");
});

test.serial("enrichProjectGraph should throw for incorrect framework name", async (t) => {
	const {ui5Framework, sinon} = t.context;
	const dependencyTree = {
		id: "project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.2.3",
				libraries: [
					{
						name: "lib1",
						optional: true
					}
				]
			}
		}
	};

	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	sinon.stub(projectGraph.getRoot(), "getFrameworkName").returns("Pony5");
	const err = await t.throwsAsync(ui5Framework.enrichProjectGraph(projectGraph));
	t.is(err.message, `Unknown framework.name "Pony5" for project application.a. Must be "OpenUI5" or "SAPUI5"`,
		"Threw with expected error message");
});

test.serial("enrichProjectGraph should ignore root project without framework configuration", async (t) => {
	const {ui5Framework} = t.context;
	const dependencyTree = {
		id: "@sapui5/project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			}
		}
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	await ui5Framework.enrichProjectGraph(projectGraph);
	t.is(projectGraph.getSize(), 1, "Project graph should remain unchanged");
});

test.serial("utils.shouldIncludeDependency", (t) => {
	const {utils} = t.context;
	// root project dependency should always be included
	t.true(utils.shouldIncludeDependency({}, true));
	t.true(utils.shouldIncludeDependency({optional: true}, true));
	t.true(utils.shouldIncludeDependency({optional: false}, true));
	t.true(utils.shouldIncludeDependency({optional: null}, true));
	t.true(utils.shouldIncludeDependency({optional: "abc"}, true));
	t.true(utils.shouldIncludeDependency({development: true}, true));
	t.true(utils.shouldIncludeDependency({development: false}, true));
	t.true(utils.shouldIncludeDependency({development: null}, true));
	t.true(utils.shouldIncludeDependency({development: "abc"}, true));
	t.true(utils.shouldIncludeDependency({foo: true}, true));

	t.true(utils.shouldIncludeDependency({}, false));
	t.false(utils.shouldIncludeDependency({optional: true}, false));
	t.true(utils.shouldIncludeDependency({optional: false}, false));
	t.true(utils.shouldIncludeDependency({optional: null}, false));
	t.true(utils.shouldIncludeDependency({optional: "abc"}, false));
	t.false(utils.shouldIncludeDependency({development: true}, false));
	t.true(utils.shouldIncludeDependency({development: false}, false));
	t.true(utils.shouldIncludeDependency({development: null}, false));
	t.true(utils.shouldIncludeDependency({development: "abc"}, false));
	t.true(utils.shouldIncludeDependency({foo: true}, false));

	// Having both optional and development should not be the case, but that should be validated beforehand
	t.true(utils.shouldIncludeDependency({optional: true, development: true}, true));
	t.false(utils.shouldIncludeDependency({optional: true, development: true}, false));
});

test.serial("utils.getFrameworkLibrariesFromTree: Project without dependencies", async (t) => {
	const {utils} = t.context;
	const dependencyTree = {
		id: "test-id",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.100.0",
				libraries: []
			}
		}
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	const ui5Dependencies = await utils.getFrameworkLibrariesFromGraph(projectGraph);
	t.deepEqual(ui5Dependencies, []);
});

test.serial("utils.getFrameworkLibrariesFromTree: Framework project with framework dependency", async (t) => {
	// Only root-level framework projects are scanned
	const {utils} = t.context;
	const dependencyTree = {
		id: "@sapui5/project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.100.0",
				libraries: [
					{
						name: "lib1"
					}
				]
			}
		},
		dependencies: [{
			id: "@openui5/test1", // Will not be scanned
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "library.d"
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "lib2"
					}]
				}
			}
		}]
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	const ui5Dependencies = await utils.getFrameworkLibrariesFromGraph(projectGraph);
	t.deepEqual(ui5Dependencies, ["lib1"]);
});

test.serial("utils.getFrameworkLibrariesFromTree: Project with libraries and dependency with libraries", async (t) => {
	const {utils} = t.context;
	const dependencyTree = {
		id: "test-project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.100.0",
				libraries: [{
					name: "lib1"
				}, {
					name: "lib2",
					optional: true
				}, {
					name: "lib6",
					development: true
				}]
			}
		},
		dependencies: [{
			id: "test2",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "test2"
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "lib3"
					}, {
						name: "lib4",
						optional: true
					}]
				}
			},
			dependencies: [{
				id: "test3",
				version: "1.2.3",
				path: libraryEPath,
				configuration: {
					specVersion: "2.0",
					type: "library",
					metadata: {
						name: "test3"
					},
					framework: {
						name: "OpenUI5",
						libraries: [{
							name: "lib5"
						}, {
							name: "lib7",
							optional: true
						}]
					}
				}
			}]
		}, {
			id: "@openui5/lib8",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib8"
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "should.be.ignored"
					}]
				}
			}
		}, {
			id: "@openui5/lib9",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib9"
				}
			}
		}]
	};
	const provider = new DependencyTreeProvider({dependencyTree});
	const projectGraph = await projectGraphBuilder(provider);

	const ui5Dependencies = await utils.getFrameworkLibrariesFromGraph(projectGraph);
	t.deepEqual(ui5Dependencies, ["lib1", "lib2", "lib6", "lib3", "lib5"]);
});

test.serial("utils.declareFrameworkDependenciesInGraph", async (t) => {
	const {utils, sinon, log} = t.context;
	const projectTree = {
		id: "test-project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "application.a"
			},
			framework: {
				name: "SAPUI5",
				version: "1.100.0",
				libraries: [{
					name: "lib1"
				}, {
					name: "lib2",
					optional: true
				}, {
					name: "lib3",
					development: true
				}]
			}
		},
		dependencies: [{
			id: "library.a",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "library.a"
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "lib2"
					}, {
						name: "lib3",
						optional: true
					}, {
						name: "lib4",
						development: true
					}, {
						name: "lib5",
						optional: true
					}]
				}
			},
			dependencies: []
		}]
	};
	const frameworkTree = {
		id: "dummy-framework-tree-root",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "dummy-framework-tree-root"
			}
		},
		dependencies: [{
			id: "@openui5/lib1",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib1",
					deprecated: true
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "should.be.ignored"
					}]
				}
			}
		}, {
			id: "@openui5/lib2",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib2",
					sapInternal: true
				}
			}
		}, {
			id: "@openui5/lib3",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib3",
					deprecated: true
				}
			}
		}]
	};
	const projectGraph = await projectGraphBuilder(new DependencyTreeProvider({
		dependencyTree: projectTree
	}));
	const frameworkGraph = await projectGraphBuilder(new DependencyTreeProvider({
		dependencyTree: frameworkTree
	}));
	projectGraph.join(frameworkGraph);

	const declareDependencySpy = sinon.spy(projectGraph, "declareDependency");
	const declareOptionalDependencySpy = sinon.spy(projectGraph, "declareOptionalDependency");
	const resolveOptionalDependenciesSpy = sinon.spy(projectGraph, "resolveOptionalDependencies");
	await utils.declareFrameworkDependenciesInGraph(projectGraph);

	t.is(declareDependencySpy.callCount, 5, "declareDependency got called five times");
	t.deepEqual(declareDependencySpy.getCall(0).args, ["application.a", "lib1"],
		"declareDependency got called with correct arguments on first call");
	t.deepEqual(declareDependencySpy.getCall(1).args, ["application.a", "lib3"],
		"declareDependency got called with correct arguments on second call");
	t.deepEqual(declareDependencySpy.getCall(2).args, ["library.a", "lib2"],
		"declareDependency got called with correct arguments on third call");
	t.deepEqual(declareDependencySpy.getCall(3).args, ["application.a", "lib2"],
		"declareDependency got called with correct arguments on fourth call");
	t.deepEqual(declareDependencySpy.getCall(4).args, ["library.a", "lib3"],
		"declareDependency got called with correct arguments on fifth call");
	t.is(declareOptionalDependencySpy.callCount, 2, "declareOptionalDependency got called ");
	t.deepEqual(declareOptionalDependencySpy.getCall(0).args, ["application.a", "lib2"],
		"declareOptionalDependency got called with correct arguments on first call");
	t.deepEqual(declareOptionalDependencySpy.getCall(1).args, ["library.a", "lib3"],
		"declareOptionalDependency got called with correct arguments on second call");
	t.is(resolveOptionalDependenciesSpy.callCount, 1,
		"resolveOptionalDependenciesSpy got called once");

	t.is(log.warn.callCount, 3,
		"Three warnings got logged");
	t.is(log.warn.getCall(0).args[0], "Dependency lib1 is deprecated and should not be used for new projects!",
		"Expected first warning logged");
	t.is(log.warn.getCall(1).args[0],
		`Dependency lib2 is restricted for use by SAP internal projects only! If the project application.a is ` +
		`an SAP internal project, add the attribute "allowSapInternal: true" to its metadata configuration`,
		"Expected first warning logged");
	t.is(log.warn.getCall(2).args[0], "Dependency lib3 is deprecated and should not be used for new projects!",
		"Expected first warning logged");

	t.deepEqual(projectGraph.getDependencies("application.a"), [
		"library.a",
		"lib1",
		"lib3",
		"lib2"
	], `Root project has correct dependencies`);

	t.deepEqual(projectGraph.getDependencies("library.a"), [
		"lib2",
		"lib3"
	], `Non-framework dependency has correct dependencies`);
});

test.serial("utils.declareFrameworkDependenciesInGraph: No deprecation warnings for testsuite projects", async (t) => {
	const {utils, log} = t.context;

	const projectTree = {
		id: "test-project",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "testsuite"
			},
			framework: {
				name: "SAPUI5",
				version: "1.100.0",
				libraries: [{
					name: "lib1"
				}, {
					name: "lib2",
					optional: true
				}, {
					name: "lib3",
					development: true
				}]
			}
		},
		dependencies: []
	};
	const frameworkTree = {
		id: "dummy-framework-tree-root",
		version: "1.2.3",
		path: applicationAPath,
		configuration: {
			specVersion: "2.0",
			type: "application",
			metadata: {
				name: "dummy-framework-tree-root"
			}
		},
		dependencies: [{
			id: "@openui5/lib1",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib1",
					deprecated: true
				},
				framework: {
					name: "OpenUI5",
					libraries: [{
						name: "should.be.ignored"
					}]
				}
			}
		}, {
			id: "@openui5/lib2",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib2",
					sapInternal: true
				}
			}
		}, {
			id: "@openui5/lib3",
			version: "1.2.3",
			path: libraryEPath,
			configuration: {
				specVersion: "2.0",
				type: "library",
				metadata: {
					name: "lib3",
					deprecated: true
				}
			}
		}]
	};
	const projectGraph = await projectGraphBuilder(new DependencyTreeProvider({
		dependencyTree: projectTree
	}));
	const frameworkGraph = await projectGraphBuilder(new DependencyTreeProvider({
		dependencyTree: frameworkTree
	}));
	projectGraph.join(frameworkGraph);

	await utils.declareFrameworkDependenciesInGraph(projectGraph);

	t.is(log.warn.callCount, 1,
		"One warning got logged");

	t.is(log.warn.getCall(0).args[0],
		`Dependency lib2 is restricted for use by SAP internal projects only! If the project testsuite is ` +
		`an SAP internal project, add the attribute "allowSapInternal: true" to its metadata configuration`,
		"Expected first warning logged");

	t.deepEqual(projectGraph.getDependencies("testsuite"), [
		"lib1",
		"lib3"
	], `Root project has correct dependencies`);
});

test.serial("ProjectProcessor: Add project to graph", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub()
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock
	});

	await projectProcessor.addProjectToGraph("library.e");
	t.is(graphMock.getProject.callCount, 1, "graph#getProject got called once");
	t.is(graphMock.getProject.getCall(0).args[0], "library.e", "graph#getProject got called with the correct argument");
	t.is(graphMock.addProject.callCount, 1, "graph#addProject got called once");
	t.is(graphMock.addProject.getCall(0).args[0].getName(), "library.e",
		"graph#addProject got called with the correct project");
});

test.serial("ProjectProcessor: Add same project twice", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub()
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock
	});

	await projectProcessor.addProjectToGraph("library.e");
	await projectProcessor.addProjectToGraph("library.e");
	t.is(graphMock.getProject.callCount, 1, "graph#getProject got called once");
	t.is(graphMock.getProject.getCall(0).args[0], "library.e", "graph#getProject got called with the correct argument");
	t.is(graphMock.addProject.callCount, 1, "graph#addProject got called once");
	t.is(graphMock.addProject.getCall(0).args[0].getName(), "library.e",
		"graph#addProject got called with the correct project");
});

test.serial("ProjectProcessor: Project already in graph", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns("project"),
		addProject: sinon.stub()
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock
	});

	await projectProcessor.addProjectToGraph("library.e");
	t.is(graphMock.getProject.callCount, 1, "graph#getProject got called once");
	t.is(graphMock.getProject.getCall(0).args[0], "library.e", "graph#getProject got called with the correct argument");
	t.is(graphMock.addProject.callCount, 0, "graph#addProject never got called");
});

test.serial("ProjectProcessor: Add project with dependencies to graph", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub(),
		declareDependency: sinon.stub()
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: ["library.d"],
				optionalDependencies: []
			},
			"library.d": {
				id: "lib.d.id",
				version: "120000.0.0",
				path: libraryDPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock
	});

	await projectProcessor.addProjectToGraph("library.e");
	t.is(graphMock.getProject.callCount, 2, "graph#getProject got called twice");
	t.is(graphMock.getProject.getCall(0).args[0], "library.e", "graph#getProject got called with the correct argument");
	t.is(graphMock.getProject.getCall(1).args[0], "library.d", "graph#getProject got called with the correct argument");
	t.is(graphMock.addProject.callCount, 2, "graph#addProject got called twice");
	t.is(graphMock.addProject.getCall(0).args[0].getName(), "library.d",
		"graph#addProject got called with the correct project");
	t.is(graphMock.addProject.getCall(1).args[0].getName(), "library.e",
		"graph#addProject got called with the correct project");
	t.is(graphMock.declareDependency.callCount, 1, "graph#declareDependency got called once");
	t.deepEqual(graphMock.declareDependency.getCall(0).args, ["library.e", "library.d"],
		"graph#declareDependency got called with the correct arguments");
});

test.serial("ProjectProcessor: Resolve project via workspace", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub(),
		declareDependency: sinon.stub()
	};
	const libraryEProjectMock = {
		getName: () => "library.e",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.d"
		}])
	};
	const libraryDProjectMock = {
		getName: () => "library.d",
		getFrameworkDependencies: sinon.stub().returns([])
	};
	const moduleMock = {
		getVersion: () => "1.0.0",
		getPath: () => path.join("module", "path"),
		getSpecifications: sinon.stub()
			.onFirstCall().resolves({
				project: libraryDProjectMock
			})
			.onSecondCall().resolves({
				project: libraryEProjectMock
			})
	};
	const workspaceMock = {
		getName: sinon.stub().returns("workspace name"),
		getModuleByProjectName: sinon.stub().resolves(moduleMock),
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: ["library.d"],
				optionalDependencies: []
			},
			"library.d": {
				id: "lib.d.id",
				version: "120000.0.0",
				path: libraryDPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock,
		workspace: workspaceMock
	});

	await projectProcessor.addProjectToGraph("library.e");
	t.is(graphMock.getProject.callCount, 2, "graph#getProject got called twice");
	t.is(graphMock.getProject.getCall(0).args[0], "library.e", "graph#getProject got called with the correct argument");
	t.is(graphMock.getProject.getCall(1).args[0], "library.d", "graph#getProject got called with the correct argument");
	t.is(graphMock.addProject.callCount, 2, "graph#addProject got called once");
	t.is(graphMock.addProject.getCall(0).args[0].getName(), "library.d",
		"graph#addProject got called with the correct project");
	t.is(graphMock.addProject.getCall(1).args[0].getName(), "library.e",
		"graph#addProject got called with the correct project");
	t.is(graphMock.declareDependency.callCount, 1, "graph#declareDependency got called once");
	t.deepEqual(graphMock.declareDependency.getCall(0).args, ["library.e", "library.d"],
		"graph#declareDependency got called with the correct arguments");
});

test.serial("ProjectProcessor: Resolve project via workspace with additional dependency", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub(),
		declareDependency: sinon.stub()
	};
	const libraryEProjectMock = {
		getName: () => "library.e",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.d"
		}])
	};
	const libraryDProjectMock = {
		getName: () => "library.d",
		getFrameworkDependencies: sinon.stub().returns([])
	};
	const moduleMock = {
		getVersion: () => "1.0.0",
		getPath: () => path.join("module", "path"),
		getSpecifications: sinon.stub()
			.onFirstCall().resolves({
				project: libraryEProjectMock
			})
			.onSecondCall().resolves({
				project: libraryDProjectMock
			})
	};
	const workspaceMock = {
		getName: sinon.stub().returns("workspace name"),
		getModuleByProjectName: sinon.stub().resolves(moduleMock),
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: [], // Dependency to library.d is only declared in workspace-resolved library.e
				optionalDependencies: []
			},
			"library.d": {
				id: "lib.d.id",
				version: "120000.0.0",
				path: libraryDPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock,
		workspace: workspaceMock
	});

	await projectProcessor.addProjectToGraph("library.e");
	t.is(graphMock.getProject.callCount, 2, "graph#getProject got called twice");
	t.is(graphMock.getProject.getCall(0).args[0], "library.e", "graph#getProject got called with the correct argument");
	t.is(graphMock.getProject.getCall(1).args[0], "library.d", "graph#getProject got called with the correct argument");
	t.is(graphMock.addProject.callCount, 2, "graph#addProject got called once");
	t.is(graphMock.addProject.getCall(0).args[0].getName(), "library.e",
		"graph#addProject got called with the correct project");
	t.is(graphMock.addProject.getCall(1).args[0].getName(), "library.d",
		"graph#addProject got called with the correct project");
	t.is(graphMock.declareDependency.callCount, 1, "graph#declareDependency got called once");
	t.deepEqual(graphMock.declareDependency.getCall(0).args, ["library.e", "library.d"],
		"graph#declareDependency got called with the correct arguments");
});

test.serial("ProjectProcessor: Resolve project via workspace with additional, unknown dependency", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub(),
		declareDependency: sinon.stub()
	};
	const libraryEProjectMock = {
		getName: () => "library.e",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.xyz"
		}])
	};
	const libraryDProjectMock = {
		getName: () => "library.d",
		getFrameworkDependencies: sinon.stub().returns([])
	};
	const moduleMock = {
		getVersion: () => "1.0.0",
		getPath: () => path.join("module", "path"),
		getSpecifications: sinon.stub()
			.onFirstCall().resolves({
				project: libraryEProjectMock
			})
			.onSecondCall().resolves({
				project: libraryDProjectMock
			})
	};
	const workspaceMock = {
		getName: sinon.stub().returns("workspace name"),
		getModuleByProjectName: sinon.stub().resolves(moduleMock),
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: ["library.d"],
				optionalDependencies: []
			},
			"library.d": {
				id: "lib.d.id",
				version: "120000.0.0",
				path: libraryDPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock,
		workspace: workspaceMock
	});

	await t.throwsAsync(projectProcessor.addProjectToGraph("library.e"), {
		message:
			"Unable to find dependency library.xyz, required by project library.e " +
			"(resolved via workspace name workspace) " +
			"in current set of libraries. Try adding it temporarily to the root project's dependencies"
	}, "Threw with expected error message");
});

test.serial("ProjectProcessor: Resolve project via workspace with cyclic dependency", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub(),
		declareDependency: sinon.stub()
	};
	const libraryEProjectMock = {
		getName: () => "library.e",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.d"
		}])
	};
	const libraryDProjectMock = {
		getName: () => "library.d",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.e" // Cyclic dependency in workspace project
		}])
	};
	const moduleMock = {
		getVersion: () => "1.0.0",
		getPath: () => path.join("module", "path"),
		getSpecifications: sinon.stub()
			.onFirstCall().resolves({
				project: libraryEProjectMock
			})
			.onSecondCall().resolves({
				project: libraryDProjectMock
			})
	};
	const workspaceMock = {
		getName: sinon.stub().returns("workspace name"),
		getModuleByProjectName: sinon.stub().resolves(moduleMock),
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: ["library.d"],
				optionalDependencies: []
			},
			"library.d": {
				id: "lib.d.id",
				version: "120000.0.0",
				path: libraryDPath,
				dependencies: [],
				optionalDependencies: []
			}
		},
		graph: graphMock,
		workspace: workspaceMock
	});

	await t.throwsAsync(projectProcessor.addProjectToGraph("library.e"), {
		message:
			"ui5Framework:ProjectPreprocessor: Detected cyclic dependency chain: " +
			"library.e -> *library.d* -> *library.d*"
	}, "Threw with expected error message");
});

test.serial("ProjectProcessor: Resolve project via workspace with distant cyclic dependency", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub(),
		declareDependency: sinon.stub()
	};
	const libraryEProjectMock = {
		getName: () => "library.e",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.d"
		}])
	};
	const libraryDProjectMock = {
		getName: () => "library.d",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.f"
		}])
	};
	const libraryFProjectMock = {
		getName: () => "library.f",
		getFrameworkDependencies: sinon.stub().returns([{
			name: "library.e" // Cyclic dependency in workspace project
		}])
	};
	const moduleMock = {
		getVersion: () => "1.0.0",
		getPath: () => path.join("module", "path"),
		getSpecifications: sinon.stub()
			.onFirstCall().resolves({
				project: libraryEProjectMock
			})
			.onSecondCall().resolves({
				project: libraryDProjectMock
			})
			.onThirdCall().resolves({
				project: libraryFProjectMock
			})
	};
	const workspaceMock = {
		getName: sinon.stub().returns("workspace name"),
		getModuleByProjectName: sinon.stub().resolves(moduleMock),
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"library.e": {
				id: "lib.e.id",
				version: "1000.0.0",
				path: libraryEPath,
				dependencies: ["library.d"],
				optionalDependencies: []
			},
			"library.d": {
				id: "lib.d.id",
				version: "120000.0.0",
				path: libraryDPath,
				dependencies: ["library.f"],
				optionalDependencies: []
			},
			"library.f": {
				id: "lib.f.id",
				version: "1.0.0",
				path: libraryFPath,
				dependencies: [],
				optionalDependencies: []
			},
		},
		graph: graphMock,
		workspace: workspaceMock
	});

	await t.throwsAsync(projectProcessor.addProjectToGraph("library.e"), {
		message:
			"ui5Framework:ProjectPreprocessor: Detected cyclic dependency chain: " +
			"library.e -> *library.d* -> library.f -> *library.d*"
	}, "Threw with expected error message");
});

test.serial("ProjectProcessor: Project missing in metadata", async (t) => {
	const {sinon} = t.context;
	const {ProjectProcessor} = t.context.utils;
	const graphMock = {
		getProject: sinon.stub().returns(),
		addProject: sinon.stub()
	};
	const projectProcessor = new ProjectProcessor({
		libraryMetadata: {
			"lib.x": {}
		},
		graph: graphMock
	});

	await t.throwsAsync(projectProcessor.addProjectToGraph("lib.a"), {
		message: "Failed to find library lib.a in dist packages metadata.json"
	}, "Threw with expected error message");
});
