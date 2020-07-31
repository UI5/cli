const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.workspace = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves()
	};
	t.context.dependencies = {};
	t.context.comboByGlob = sinon.stub().resolves([]);

	t.context.ReaderCollectionPrioritizedStub = sinon.stub();
	t.context.ReaderCollectionPrioritizedStub.returns({
		byGlob: t.context.comboByGlob
	});
	mock("@ui5/fs", {
		ReaderCollectionPrioritized: t.context.ReaderCollectionPrioritizedStub
	});

	t.context.moduleBundlerStub = sinon.stub().resolves([]);
	mock("../../../../lib/processors/bundlers/moduleBundler", t.context.moduleBundlerStub);

	t.context.generateLibraryPreload = mock.reRequire("../../../../lib/tasks/bundlers/generateLibraryPreload");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

test.serial("generateLibraryPreload", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/my/lib/.library")}
	];
	comboByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/my/lib/.library")}
	]);

	await generateLibraryPreload({
		workspace,
		dependencies,
		options: {
			projectName: "Test Library"
		}
	});

	t.is(moduleBundlerStub.callCount, 1, "moduleBundler should have been called once");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".fragment.xml",
					".view.xml",
					".properties",
					".json",
				],
				name: "my/lib/library-preload.js",
				sections: [
					{
						filters: [
							"my/lib/",
							"!my/lib/.library",
							"!my/lib/designtime/",
							"!my/lib/**/*.designtime.js",
							"!my/lib/**/*.support.js",
							"!my/lib/themes/",
							"!my/lib/messagebundle*",
						],
						mode: "preload",
						renderer: true,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true
			}
		},
		resources
	}]);

	t.is(workspace.byGlob.callCount, 1,
		"workspace.byGlob should have been called once");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");
});

test("generateLibraryPreload for sap.ui.core (w/o ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	const filteredResources = [resources[0]]; // without sap-ui-core.js
	comboByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	await generateLibraryPreload({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core"
		}
	});

	t.is(moduleBundlerStub.callCount, 5, "moduleBundler should have been called 5 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core.js",
				sections: [
					{
						filters: [
							"jquery.sap.global.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "preload",
						filters: [
							"sap/ui/core/Core.js"
						],
						resolve: true
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: true,
				decorateBootstrapModule: true,
				addTryCatchRestartWrapper: true,
				usePredefineCalls: true
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core-dbg.js",
				sections: [
					{
						filters: [
							"jquery.sap.global.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: false,
				decorateBootstrapModule: false,
				addTryCatchRestartWrapper: false,
				usePredefineCalls: false
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(2).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core-nojQuery.js",
				sections: [
					{
						mode: "provided",
						filters: [
							"jquery-ui-core.js",
							"jquery-ui-datepicker.js",
							"jquery-ui-position.js",
							"sap/ui/thirdparty/jquery.js",
							"sap/ui/thirdparty/jquery/*",
							"sap/ui/thirdparty/jqueryui/*"
						]
					},
					{
						filters: [
							"jquery.sap.global.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "preload",
						filters: [
							"sap/ui/core/Core.js"
						],
						resolve: true
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: true,
				decorateBootstrapModule: true,
				addTryCatchRestartWrapper: true,
				usePredefineCalls: true
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(3).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core-nojQuery-dbg.js",
				sections: [
					{
						mode: "provided",
						filters: [
							"jquery-ui-core.js",
							"jquery-ui-datepicker.js",
							"jquery-ui-position.js",
							"sap/ui/thirdparty/jquery.js",
							"sap/ui/thirdparty/jquery/*",
							"sap/ui/thirdparty/jqueryui/*"
						]
					},
					{
						filters: [
							"jquery.sap.global.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: false,
				decorateBootstrapModule: false,
				addTryCatchRestartWrapper: false,
				usePredefineCalls: false
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(4).args, [{
		options: {
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".fragment.xml",
					".view.xml",
					".properties",
					".json",
				],
				name: "sap/ui/core/library-preload.js",
				sections: [
					{
						filters: [
							"ui5loader-autoconfig.js",
							"sap/ui/core/Core.js",
						],
						mode: "provided",
						resolve: true,
					},
					{
						filters: [
							"sap/ui/core/",
							"!sap/ui/core/.library",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",
							"!sap/ui/core/themes/",
							"!sap/ui/core/messagebundle*",

							"!sap/ui/core/cldr/",
							"*.js",
							"sap/base/",
							"sap/ui/base/",
							"sap/ui/dom/",
							"sap/ui/events/",
							"sap/ui/model/",
							"sap/ui/security/",
							"sap/ui/util/",
							"sap/ui/Global.js",
							"sap/ui/thirdparty/crossroads.js",
							"sap/ui/thirdparty/caja-htmlsanitizer.js",
							"sap/ui/thirdparty/hasher.js",
							"sap/ui/thirdparty/signals.js",
							"sap/ui/thirdparty/jquery-mobile-custom.js",
							"sap/ui/thirdparty/jqueryui/jquery-ui-core.js",
							"sap/ui/thirdparty/jqueryui/jquery-ui-position.js",
							"!sap-ui-*.js",
							"!sap/ui/core/support/",
							"!sap/ui/core/plugin/DeclarativeSupport.js",
							"!sap/ui/core/plugin/LessSupport.js",
						],
						mode: "preload",
						renderer: true,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true
			}
		},
		resources: filteredResources
	}]);

	t.is(workspace.byGlob.callCount, 1,
		"workspace.byGlob should have been called once");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");
});


test("generateLibraryPreload for sap.ui.core (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	const filteredResources = [resources[0], resources[1]]; // without sap-ui-core.js
	comboByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	await generateLibraryPreload({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core"
		}
	});

	t.is(moduleBundlerStub.callCount, 5, "moduleBundler should have been called 5 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core.js",
				sections: [
					{
						filters: [
							"ui5loader-autoconfig.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "preload",
						filters: [
							"sap/ui/core/Core.js"
						],
						resolve: true
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: true,
				decorateBootstrapModule: true,
				addTryCatchRestartWrapper: true,
				usePredefineCalls: true
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core-dbg.js",
				sections: [
					{
						filters: [
							"ui5loader-autoconfig.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: false,
				decorateBootstrapModule: false,
				addTryCatchRestartWrapper: false,
				usePredefineCalls: false
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(2).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core-nojQuery.js",
				sections: [
					{
						mode: "provided",
						filters: [
							"jquery-ui-core.js",
							"jquery-ui-datepicker.js",
							"jquery-ui-position.js",
							"sap/ui/thirdparty/jquery.js",
							"sap/ui/thirdparty/jquery/*",
							"sap/ui/thirdparty/jqueryui/*"
						]
					},
					{
						filters: [
							"ui5loader-autoconfig.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "preload",
						filters: [
							"sap/ui/core/Core.js"
						],
						resolve: true
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: true,
				decorateBootstrapModule: true,
				addTryCatchRestartWrapper: true,
				usePredefineCalls: true
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(3).args, [{
		options: {
			bundleDefinition: {
				name: "sap-ui-core-nojQuery-dbg.js",
				sections: [
					{
						mode: "provided",
						filters: [
							"jquery-ui-core.js",
							"jquery-ui-datepicker.js",
							"jquery-ui-position.js",
							"sap/ui/thirdparty/jquery.js",
							"sap/ui/thirdparty/jquery/*",
							"sap/ui/thirdparty/jqueryui/*"
						]
					},
					{
						filters: [
							"ui5loader-autoconfig.js"
						],
						mode: "raw",
						resolve: true,
						sort: true,
						declareModules: false
					},
					{
						mode: "require",
						filters: [
							"sap/ui/core/Core.js"
						]
					}
				]
			},
			bundleOptions: {
				optimize: false,
				decorateBootstrapModule: false,
				addTryCatchRestartWrapper: false,
				usePredefineCalls: false
			}
		},
		resources: filteredResources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(4).args, [{
		options: {
			bundleDefinition: {
				defaultFileTypes: [
					".js",
					".fragment.xml",
					".view.xml",
					".properties",
					".json",
				],
				name: "sap/ui/core/library-preload.js",
				sections: [
					{
						filters: [
							"ui5loader-autoconfig.js",
							"sap/ui/core/Core.js",
						],
						mode: "provided",
						resolve: true,
					},
					{
						filters: [
							"sap/ui/core/",
							"!sap/ui/core/.library",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",
							"!sap/ui/core/themes/",
							"!sap/ui/core/messagebundle*",

							"!sap/ui/core/cldr/",
							"*.js",
							"sap/base/",
							"sap/ui/base/",
							"sap/ui/dom/",
							"sap/ui/events/",
							"sap/ui/model/",
							"sap/ui/security/",
							"sap/ui/util/",
							"sap/ui/Global.js",
							"sap/ui/thirdparty/crossroads.js",
							"sap/ui/thirdparty/caja-htmlsanitizer.js",
							"sap/ui/thirdparty/hasher.js",
							"sap/ui/thirdparty/signals.js",
							"sap/ui/thirdparty/jquery-mobile-custom.js",
							"sap/ui/thirdparty/jqueryui/jquery-ui-core.js",
							"sap/ui/thirdparty/jqueryui/jquery-ui-position.js",
							"!sap-ui-*.js",
							"!sap/ui/core/support/",
							"!sap/ui/core/plugin/DeclarativeSupport.js",
							"!sap/ui/core/plugin/LessSupport.js",
						],
						mode: "preload",
						renderer: true,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true
			}
		},
		resources: filteredResources
	}]);

	t.is(workspace.byGlob.callCount, 1,
		"workspace.byGlob should have been called once");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");

	t.is(ReaderCollectionPrioritizedStub.callCount, 1,
		"ReaderCollectionPrioritized should have been called once");
	t.true(ReaderCollectionPrioritizedStub.calledWithNew(),
		"ReaderCollectionPrioritized should have been called with 'new'");
});
