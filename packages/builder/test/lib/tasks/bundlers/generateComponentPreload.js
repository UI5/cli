import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.log = {
		warn: sinon.stub(),
		verbose: sinon.stub(),
		error: sinon.stub()
	};

	t.context.workspace = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves()
	};

	t.context.dependencies = {};
	t.context.byGlob = t.context.workspace.byGlob;

	t.context.moduleBundlerStub = sinon.stub().resolves([]);

	t.context.generateComponentPreload = await esmock("../../../../lib/tasks/bundlers/generateComponentPreload.js", {
		"../../../../lib/processors/bundlers/moduleBundler": t.context.moduleBundlerStub,
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:tasks:bundlers:generateComponentPreload").returns(t.context.log)
		}
	});
});

test.afterEach.always(() => {
	sinon.restore();
});

test.serial("generateComponentPreload - one namespace", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	moduleBundlerStub.resolves([
		{
			name: "my/app/Component-preload.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	await generateComponentPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"]
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app/",
							"my/app/**/manifest.json",
							"my/app/changes/changes-bundle.json",
							"my/app/changes/flexibility-bundle.json",
							"!my/app/test/",
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);

	t.is(byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

test.serial("generateComponentPreload - one namespace, with taskUtil and specVersion < 4", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	moduleBundlerStub.resolves([
		{
			name: "my/app/Component-preload.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	const project = {
		getVersion: () => "1.120.0",
		getSpecVersion() {
			return {
				lt: sinon.stub().withArgs("4.0").returns(true)
			};
		}
	};

	const taskUtil = {
		getProject: () => project,
		getTag: sinon.stub().returns(false),
		setTag: sinon.stub().returns(),
		clearTag: sinon.stub().returns(),
		STANDARD_TAGS: {
			IsBundle: "<IsBundle>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};

	await generateComponentPreload({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"]
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: true,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app/",
							"my/app/**/manifest.json",
							"my/app/changes/changes-bundle.json",
							"my/app/changes/flexibility-bundle.json",
							"!my/app/test/",
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			},
			targetUi5CoreVersion: "1.120.0"
		},
		resources
	}]);

	t.is(byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

test.serial("generateComponentPreload - one namespace, with taskUtil and specVersion >= 4", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	moduleBundlerStub.resolves([
		{
			name: "my/app/Component-preload.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	const project = {
		getVersion: () => "1.120.0",
		getSpecVersion() {
			return {
				lt: sinon.stub().withArgs("4.0").returns(false)
			};
		}
	};

	const taskUtil = {
		getProject: () => project,
		getTag: sinon.stub().returns(false),
		setTag: sinon.stub().returns(),
		clearTag: sinon.stub().returns(),
		STANDARD_TAGS: {
			IsBundle: "<IsBundle>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};

	await generateComponentPreload({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"]
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: false,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app/",
							"my/app/**/manifest.json",
							"my/app/changes/changes-bundle.json",
							"my/app/changes/flexibility-bundle.json",
							"!my/app/test/",
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			},
			targetUi5CoreVersion: "1.120.0"
		},
		resources
	}]);

	t.is(byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});


test.serial("generateComponentPreload - one namespace - excludes", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	moduleBundlerStub.resolves([
		{
			name: "my/app/Component-preload.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	await generateComponentPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"],
			excludes: [
				"my/app/thirdparty/",
				"!my/app/thirdparty/NotExcluded.js"
			]
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app/",
							"my/app/**/manifest.json",
							"my/app/changes/changes-bundle.json",
							"my/app/changes/flexibility-bundle.json",
							"!my/app/test/",
							"!my/app/thirdparty/",
							"+my/app/thirdparty/NotExcluded.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);

	t.is(byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

test.serial("generateComponentPreload - one namespace - excludes w/o namespace", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	moduleBundlerStub.resolves([
		{
			name: "my/app/Component-preload.js",
			bundle: {"fake": "bundle"},
			sourceMap: {"fake": "sourceMap"}
		}
	]);

	const project = {
		getVersion: () => "1.120.0",
		getSpecVersion() {
			return {
				lt: sinon.stub().withArgs("4.0").returns(false)
			};
		}
	};

	const taskUtil = {
		getProject: () => project,
		getTag: sinon.stub().returns(false),
		setTag: sinon.stub().returns(),
		clearTag: sinon.stub().returns(),
		STANDARD_TAGS: {
			IsBundle: "<IsBundle>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};
	await generateComponentPreload({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"],
			excludes: [
				"thirdparty/",
				"!thirdparty/NotExcluded.js"
			]
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: false,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app/",
							"my/app/**/manifest.json",
							"my/app/changes/changes-bundle.json",
							"my/app/changes/flexibility-bundle.json",
							"!my/app/test/",
							"!thirdparty/",
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			},
			targetUi5CoreVersion: "1.120.0"
		},
		resources
	}]);

	t.is(byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	const bundleResources = await moduleBundlerStub.getCall(0).returnValue;
	t.is(workspace.write.callCount, 2,
		"workspace.write should have been called twice");
	t.deepEqual(workspace.write.getCall(0).args, [bundleResources[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleResources[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleResources[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleResources[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");

	t.is(taskUtil.getTag.callCount, 0, "TaskUtil#getTag never got called");

	t.is(taskUtil.setTag.callCount, 1, "TaskUtil#setTag got called once");
	t.deepEqual(taskUtil.setTag.getCall(0).args[0], {"fake": "bundle"},
		"TaskUtil#setTag got called with expected resource");
	t.is(taskUtil.setTag.getCall(0).args[1], "<IsBundle>",
		"TaskUtil#setTag got called with expected tag");
	t.is(taskUtil.setTag.getCall(0).args[2], undefined, // defaults to true internally
		"TaskUtil#setTag got called with expected tag value");

	t.is(taskUtil.clearTag.callCount, 1, "TaskUtil#clearTag got called once");
	t.deepEqual(taskUtil.clearTag.getCall(0).args[0], {"fake": "sourceMap"},
		"TaskUtil#clearTag got called with expected resource");
	t.is(taskUtil.clearTag.getCall(0).args[1], "<OmitFromBuildResult>",
		"TaskUtil#clearTag got called with expected tag");
});

test.serial("generateComponentPreload - multiple namespaces - excludes", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	moduleBundlerStub.onFirstCall().resolves([
		{
			name: "my/app1/Component-preload.js",
			bundle: {"fake": "bundle1"},
			sourceMap: {"fake": "sourceMap1"}
		}
	]);
	moduleBundlerStub.onSecondCall().resolves([
		{
			name: "my/app2/Component-preload.js",
			bundle: {"fake": "bundle2"},
			sourceMap: {"fake": "sourceMap2"}
		}
	]);

	await generateComponentPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			namespaces: [
				"my/app1",
				"my/app2"
			],
			excludes: [
				"my/app1/thirdparty1/",
				"!my/app1/thirdparty1/NotExcluded.js",
				"my/app2/thirdparty2/",
				"!my/app2/thirdparty2/NotExcluded.js"
			]
		}
	});

	t.is(moduleBundlerStub.callCount, 2, "moduleBundler should have been called twice");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app1/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app1/",
							"my/app1/**/manifest.json",
							"my/app1/changes/changes-bundle.json",
							"my/app1/changes/flexibility-bundle.json",
							"!my/app1/test/",
							"!my/app1/thirdparty1/",
							"+my/app1/thirdparty1/NotExcluded.js",
							"!my/app2/thirdparty2/",
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/app2/Component-preload.js",
				sections: [
					{
						filters: [
							"my/app2/",
							"my/app2/**/manifest.json",
							"my/app2/changes/changes-bundle.json",
							"my/app2/changes/flexibility-bundle.json",
							"!my/app2/test/",
							"!my/app1/thirdparty1/",
							"!my/app2/thirdparty2/",
							"+my/app2/thirdparty2/NotExcluded.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);

	t.is(byGlob.callCount, 1,
		"combo.byGlob should have been called once");
	t.deepEqual(byGlob.getCall(0).args, ["/resources/**/*.{js,json,xml,html,properties,library,js.map}"],
		"combo.byGlob should have been called with expected pattern");

	const bundleObj1 = await moduleBundlerStub.getCall(0).returnValue;
	const bundleObj2 = await moduleBundlerStub.getCall(1).returnValue;

	t.is(workspace.write.callCount, 4,
		"workspace.write should have been called 4 times (2x .js, 2x .js.map)");

	t.deepEqual(workspace.write.getCall(0).args, [bundleObj1[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(0).args[0], bundleObj1[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(1).args, [bundleObj1[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(1).args[0], bundleObj1[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");

	t.deepEqual(workspace.write.getCall(2).args, [bundleObj2[0].bundle],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(2).args[0], bundleObj2[0].bundle,
		"workspace.write should have been called with exact resource returned by moduleBundler");
	t.deepEqual(workspace.write.getCall(3).args, [bundleObj2[0].sourceMap],
		"workspace.write should have been called with expected args");
	t.is(workspace.write.getCall(3).args[0], bundleObj2[0].sourceMap,
		"workspace.write should have been called with exact resource returned by moduleBundler");
});

test.serial("generateComponentPreload - one namespace - invalid exclude", async (t) => {
	const {
		generateComponentPreload,
		workspace, dependencies, byGlob,
		log
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	await generateComponentPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			namespaces: ["my/app"],
			excludes: [
				"!**/" // re-include outside of namespace is not allowed
			]
		}
	});

	t.is(log.warn.callCount, 1, "log.warn should be called once");
	t.deepEqual(log.warn.getCall(0).args, [
		"Configured preload exclude contains invalid re-include: !**/. " +
		"Re-includes must start with a component namespace (my/app)"
	]);

	t.is(log.verbose.callCount, 1, "log.verbose should be called once");
	t.deepEqual(log.verbose.getCall(0).args, [
		"Generating my/app/Component-preload.js..."
	]);

	t.is(log.error.callCount, 0, "log.error should not be called");
});

test.serial("generateComponentPreload - nested namespaces - excludes", async (t) => {
	const {
		generateComponentPreload, moduleBundlerStub,
		workspace, dependencies, byGlob,
		log
	} = t.context;

	const resources = [
		{"fake": "resource"}
	];
	byGlob.resolves(resources);

	await generateComponentPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Application",
			namespaces: [
				"my/project/component1",
				"my/project",
				"my/project/component2",
			],
			excludes: [
				"my/project/component1/foo/",
				"!my/project/test/",
				"!my/project/component2/*.html",

				// Invalid, should cause a warning
				"!invalid/namespace/"
			]
		}
	});

	t.is(moduleBundlerStub.callCount, 3, "moduleBundler should have been called 3 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/project/component1/Component-preload.js",
				sections: [
					{
						filters: [
							"my/project/component1/",
							"my/project/component1/**/manifest.json",
							"my/project/component1/changes/changes-bundle.json",
							"my/project/component1/changes/flexibility-bundle.json",
							"!my/project/component1/test/",

							// via excludes config
							"!my/project/component1/foo/"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/project/Component-preload.js",
				sections: [
					{
						filters: [
							"my/project/",
							"my/project/**/manifest.json",
							"my/project/changes/changes-bundle.json",
							"my/project/changes/flexibility-bundle.json",
							"!my/project/test/",

							// via excludes config
							"!my/project/component1/foo/",
							"+my/project/test/",
							"+my/project/component2/*.html",

							// sub-namespaces are excluded
							"!my/project/component1/",
							"!my/project/component1/**/manifest.json",
							"!my/project/component2/",
							"!my/project/component2/**/manifest.json",
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(2).args, [{
		options: {
			allowStringBundling: undefined,
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".control.xml",
					".fragment.html",
					".fragment.json",
					".fragment.xml",
					".view.html",
					".view.json",
					".view.xml",
					".properties"
				],
				name: "my/project/component2/Component-preload.js",
				sections: [
					{
						filters: [
							"my/project/component2/",
							"my/project/component2/**/manifest.json",
							"my/project/component2/changes/changes-bundle.json",
							"my/project/component2/changes/flexibility-bundle.json",
							"!my/project/component2/test/",

							// via excludes config
							"!my/project/component1/foo/",
							"+my/project/component2/*.html"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
						declareRawModules: false,
						sort: true
					}
				]
			},
			bundleOptions: {
				optimize: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);

	t.is(log.warn.callCount, 1, "log.warn should be called once");
	t.deepEqual(log.warn.getCall(0).args, [
		"Configured preload exclude contains invalid re-include: !invalid/namespace/. " +
		"Re-includes must start with a component namespace " +
		"(my/project/component1 or my/project or my/project/component2)"
	]);

	t.is(log.verbose.callCount, 3, "log.verbose should be called once");
	t.deepEqual(log.verbose.getCall(0).args, [
		"Generating my/project/component1/Component-preload.js..."
	]);
	t.deepEqual(log.verbose.getCall(1).args, [
		"Generating my/project/Component-preload.js..."
	]);
	t.deepEqual(log.verbose.getCall(2).args, [
		"Generating my/project/component2/Component-preload.js..."
	]);
	t.is(log.error.callCount, 0, "log.error should not be called");
});
