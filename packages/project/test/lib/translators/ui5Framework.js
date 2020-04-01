const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

let ui5Framework;
let utils;

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
	mock("../../../lib/ui5Framework/Sapui5Resolver", t.context.Sapui5ResolverStub);

	t.context.Openui5ResolverStub = sinon.stub();
	mock("../../../lib/ui5Framework/Openui5Resolver", t.context.Openui5ResolverStub);

	ui5Framework = mock.reRequire("../../../lib/translators/ui5Framework");
	utils = ui5Framework._utils;
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("generateDependencyTree", async (t) => {
	const tree = {
		specVersion: "2.0",
		id: "test1",
		version: "1.0.0",
		path: "/test-project/",
		framework: {
			name: "SAPUI5",
			version: "1.75.0"
		}
	};

	const referencedLibraries = ["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib3"];
	const libraryMetadata = {fake: "metadata"};

	const getFrameworkLibrariesFromTreeStub = sinon.stub(utils, "getFrameworkLibrariesFromTree")
		.returns(referencedLibraries);

	t.context.Sapui5ResolverInstallStub.resolves({libraryMetadata});

	const getProjectStub = sinon.stub();
	getProjectStub.onFirstCall().returns({fake: "metadata-project-1"});
	getProjectStub.onSecondCall().returns({fake: "metadata-project-2"});
	getProjectStub.onThirdCall().returns({fake: "metadata-project-3"});
	const ProjectProcessorStub = sinon.stub(utils, "ProjectProcessor")
		.callsFake(() => {
			return {
				getProject: getProjectStub
			};
		});

	const ui5FrameworkTree = await ui5Framework.generateDependencyTree(tree);

	t.is(getFrameworkLibrariesFromTreeStub.callCount, 1, "getFrameworkLibrariesFromTree should be called once");
	t.deepEqual(getFrameworkLibrariesFromTreeStub.getCall(0).args, [tree],
		"getFrameworkLibrariesFromTree should be called with expected args");

	t.is(t.context.Sapui5ResolverStub.callCount, 1, "Sapui5Resolver#constructor should be called once");
	t.deepEqual(t.context.Sapui5ResolverStub.getCall(0).args, [{cwd: tree.path, version: tree.framework.version}],
		"Sapui5Resolver#constructor should be called with expected args");

	t.is(t.context.Sapui5ResolverInstallStub.callCount, 1, "Sapui5Resolver#install should be called once");
	t.deepEqual(t.context.Sapui5ResolverInstallStub.getCall(0).args, [referencedLibraries],
		"Sapui5Resolver#install should be called with expected args");

	t.is(ProjectProcessorStub.callCount, 1, "ProjectProcessor#constructor should be called once");
	t.deepEqual(ProjectProcessorStub.getCall(0).args, [{libraryMetadata}],
		"ProjectProcessor#constructor should be called with expected args");

	t.is(getProjectStub.callCount, 3, "ProjectProcessor#getProject should be called 3 times");
	t.deepEqual(getProjectStub.getCall(0).args, [referencedLibraries[0]],
		"Sapui5Resolver#getProject should be called with expected args (call 1)");
	t.deepEqual(getProjectStub.getCall(1).args, [referencedLibraries[1]],
		"Sapui5Resolver#getProject should be called with expected args (call 2)");
	t.deepEqual(getProjectStub.getCall(2).args, [referencedLibraries[2]],
		"Sapui5Resolver#getProject should be called with expected args (call 3)");

	t.deepEqual(ui5FrameworkTree, {
		specVersion: "2.0", // specVersion must not be lost to prevent config re-loading in projectPreprocessor
		id: "test1",
		version: "1.0.0",
		path: "/test-project/",
		framework: {
			name: "SAPUI5",
			version: "1.75.0"
		},
		dependencies: [
			{fake: "metadata-project-1"},
			{fake: "metadata-project-2"},
			{fake: "metadata-project-3"}
		],
		_transparentProject: true
	});
});

test.serial("generateDependencyTree (with versionOverride)", async (t) => {
	const tree = {
		id: "test1",
		version: "1.0.0",
		path: "/test-project/",
		framework: {
			name: "SAPUI5",
			version: "1.75.0"
		}
	};

	const referencedLibraries = ["sap.ui.lib1", "sap.ui.lib2", "sap.ui.lib3"];
	const libraryMetadata = {fake: "metadata"};

	sinon.stub(utils, "getFrameworkLibrariesFromTree").returns(referencedLibraries);

	t.context.Sapui5ResolverInstallStub.resolves({libraryMetadata});

	t.context.Sapui5ResolverResolveVersionStub.resolves("1.99.9");

	const getProjectStub = sinon.stub();
	getProjectStub.onFirstCall().returns({fake: "metadata-project-1"});
	getProjectStub.onSecondCall().returns({fake: "metadata-project-2"});
	getProjectStub.onThirdCall().returns({fake: "metadata-project-3"});
	sinon.stub(utils, "ProjectProcessor")
		.callsFake(() => {
			return {
				getProject: getProjectStub
			};
		});

	await ui5Framework.generateDependencyTree(tree, {versionOverride: "1.99"});

	t.is(t.context.Sapui5ResolverStub.callCount, 1, "Sapui5Resolver#constructor should be called once");
	t.deepEqual(t.context.Sapui5ResolverStub.getCall(0).args, [{cwd: tree.path, version: "1.99.9"}],
		"Sapui5Resolver#constructor should be called with expected args");
});

test.serial("generateDependencyTree should throw error when no framework version is provided in tree", async (t) => {
	const tree = {
		id: "test-id",
		version: "1.2.3",
		path: "/test-project/",
		metadata: {
			name: "test-name"
		},
		framework: {
			name: "SAPUI5"
		}
	};

	await t.throwsAsync(async () => {
		await ui5Framework.generateDependencyTree(tree);
	}, "framework.version is not defined for project test-id");

	await t.throwsAsync(async () => {
		await ui5Framework.generateDependencyTree(tree, {
			versionOverride: "1.75.0"
		});
	}, "framework.version is not defined for project test-id");
});

test.serial("generateDependencyTree should ignore root project without framework configuration", async (t) => {
	const tree = {
		id: "test-id",
		version: "1.2.3",
		path: "/test-project/",
		metadata: {
			name: "test-name"
		},
		dependencies: []
	};
	const ui5FrameworkTree = await ui5Framework.generateDependencyTree(tree);

	t.is(ui5FrameworkTree, null, "No framework tree should be returned");
});
test.serial("utils.isFrameworkProject", (t) => {
	t.true(utils.isFrameworkProject({id: "@sapui5/foo"}), "@sapui5/foo");
	t.true(utils.isFrameworkProject({id: "@openui5/foo"}), "@openui5/foo");
	t.false(utils.isFrameworkProject({id: "sapui5"}), "sapui5");
	t.false(utils.isFrameworkProject({id: "openui5"}), "openui5");
});
test.serial("utils.shouldIncludeDependency", (t) => {
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
test.serial("utils.getFrameworkLibrariesFromTree: Project without dependencies", (t) => {
	const tree = {
		id: "test",
		metadata: {
			name: "test"
		},
		framework: {
			libraries: []
		},
		dependencies: []
	};
	const ui5Dependencies = utils.getFrameworkLibrariesFromTree(tree);
	t.deepEqual(ui5Dependencies, []);
});

test.serial("utils.getFrameworkLibrariesFromTree: Project with libraries and dependency with libraries", (t) => {
	const tree = {
		id: "test1",
		specVersion: "2.0",
		metadata: {
			name: "test1"
		},
		framework: {
			libraries: [
				{
					name: "lib1"
				},
				{
					name: "lib2",
					optional: true
				},
				{
					name: "lib6",
					development: true
				}
			]
		},
		dependencies: [
			{
				id: "test2",
				specVersion: "2.0",
				metadata: {
					name: "test2"
				},
				framework: {
					libraries: [
						{
							name: "lib3"
						},
						{
							name: "lib4",
							optional: true
						}
					]
				},
				dependencies: [
					{
						id: "test3",
						specVersion: "2.0",
						metadata: {
							name: "test3"
						},
						framework: {
							libraries: [
								{
									name: "lib5"
								},
								{
									name: "lib7",
									development: true
								}
							]
						},
						dependencies: []
					}
				]
			},
			{
				id: "@sapui5/lib8",
				specVersion: "2.0",
				metadata: {
					name: "lib8"
				},
				framework: {
					libraries: [
						{
							name: "should.be.ignored"
						}
					]
				},
				dependencies: []
			},
			{
				id: "@openui5/lib9",
				specVersion: "1.1",
				metadata: {
					name: "lib9"
				},
				dependencies: []
			},
			{
				id: "@foo/library",
				specVersion: "1.1",
				metadata: {
					name: "foo.library"
				},
				framework: {
					libraries: [
						{
							name: "should.also.be.ignored"
						}
					]
				},
				dependencies: []
			}
		]
	};
	const ui5Dependencies = utils.getFrameworkLibrariesFromTree(tree);
	t.deepEqual(ui5Dependencies, ["lib1", "lib2", "lib6", "lib3", "lib5"]);
});

// TODO test: utils.getAllNodesOfTree

// TODO test: ProjectProcessor
