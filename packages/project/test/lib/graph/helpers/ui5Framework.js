const path = require("path");
const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const DependencyTreeProvider = require("../../../../lib/graph/providers/DependencyTree");
const projectGraphBuilder = require("../../../../lib/graph/projectGraphBuilder");

const applicationAPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.a");
const libraryEPath = path.join(__dirname, "..", "..", "..", "fixtures", "library.e");

test.beforeEach((t) => {
	t.context.Sapui5ResolverStub = sinon.stub();
	t.context.Sapui5ResolverInstallStub = sinon.stub();
	t.context.Sapui5ResolverStub.callsFake(() => {
		return {
			install: t.context.Sapui5ResolverInstallStub
		};
	});
	t.context.Sapui5ResolverResolveVersionStub = sinon.stub();
	t.context.Sapui5ResolverStub.resolveVersion = t.context.Sapui5ResolverResolveVersionStub;
	mock("../../../../lib/ui5Framework/Sapui5Resolver", t.context.Sapui5ResolverStub);

	t.context.Openui5ResolverStub = sinon.stub();
	mock("../../../../lib/ui5Framework/Openui5Resolver", t.context.Openui5ResolverStub);

	// Re-require to ensure that mocked modules are used
	t.context.ui5Framework = mock.reRequire("../../../../lib/graph/helpers/ui5Framework");
	t.context.utils = t.context.ui5Framework._utils;
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("ui5Framework translator should throw an error when framework version is not defined", async (t) => {
	const {ui5Framework, utils, Sapui5ResolverInstallStub} = t.context;

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
	t.deepEqual(ProjectProcessorStub.getCall(0).args, [{libraryMetadata}],
		"ProjectProcessor#constructor should be called with expected args");

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

test.serial("generateDependencyTree (with versionOverride)", async (t) => {
	const {
		ui5Framework, utils,
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

test.serial("generateDependencyTree should throw error when no framework version is provided", async (t) => {
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

	await t.throwsAsync(async () => {
		await ui5Framework.enrichProjectGraph(projectGraph, {
			versionOverride: "1.75.0"
		});
	}, {message: "No framework version defined for root project application.a"});
});

test.serial("generateDependencyTree should skip framework project without version", async (t) => {
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
	t.is(projectGraph.getAllProjects().length, 1, "Project graph should remain unchanged");
});

test.serial("generateDependencyTree should skip framework project with version and framework config", async (t) => {
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

	await ui5Framework.enrichProjectGraph(projectGraph);
	t.is(projectGraph.getAllProjects().length, 1, "Project graph should remain unchanged");
});

test.serial("generateDependencyTree should throw for framework project with dependency missing in graph", async (t) => {
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
				version: "1.2.3",
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
	t.is(err.message, `Missing framework dependency lib1 for project application.a`,
		"Threw with expected error message");
});

test.serial("generateDependencyTree should ignore root project without framework configuration", async (t) => {
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
	t.is(projectGraph.getAllProjects().length, 1, "Project graph should remain unchanged");
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

test.serial("utils.getFrameworkLibrariesFromTree: Framework project", async (t) => {
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
			id: "@openui5/test1",
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
	t.deepEqual(ui5Dependencies, []);
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

// TODO test: ProjectProcessor
