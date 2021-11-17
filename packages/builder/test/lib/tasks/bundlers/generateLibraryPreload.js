const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");

test.beforeEach((t) => {
	t.context.log = {
		warn: sinon.stub(),
		verbose: sinon.stub(),
		error: sinon.stub()
	};
	sinon.stub(logger, "getLogger").withArgs("builder:tasks:bundlers:generateLibraryPreload").returns(t.context.log);

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

	t.is(moduleBundlerStub.callCount, 3, "moduleBundler should have been called 3 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				name: "my/lib/library-preload.js",
				sections: [
					{
						filters: [
							"my/lib/",
							"my/lib/**/manifest.json",
							"!my/lib/*-preload.js",
							"!my/lib/designtime/",
							"!my/lib/**/*.designtime.js",
							"!my/lib/**/*.support.js",
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
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			bundleDefinition: {
				name: "my/lib/designtime/library-preload.designtime.js",
				sections: [
					{
						filters: [
							"my/lib/**/*.designtime.js",
							"my/lib/designtime/",
							"!my/lib/**/*-preload.designtime.js",
							"!my/lib/designtime/**/*.properties",
							"!my/lib/designtime/**/*.svg",
							"!my/lib/designtime/**/*.xml"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(2).args, [{
		options: {
			bundleDefinition: {
				name: "my/lib/library-preload.support.js",
				sections: [
					{
						filters: [
							"my/lib/**/*.support.js",
							"!my/lib/**/*-preload.support.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: false,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
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

test.serial("generateLibraryPreload for sap.ui.core (w/o ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	comboByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	await generateLibraryPreload({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			// Should be ignored for hardcoded sap.ui.core bundle configuration
			excludes: ["sap/ui/core/**"]
		}
	});

	t.is(moduleBundlerStub.callCount, 7, "moduleBundler should have been called 7 times");
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
		resources
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
		resources
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
		resources
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(4).args, [{
		options: {
			bundleDefinition: {
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
							"sap/ui/core/**/manifest.json",
							"!sap/ui/core/*-preload.js",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",

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
							"sap/ui/thirdparty/caja-html-sanitizer.js",
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


test.serial("generateLibraryPreload for sap.ui.core (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	comboByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	await generateLibraryPreload({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			// Should be ignored for hardcoded sap.ui.core bundle configuration
			excludes: ["sap/ui/core/**"]
		}
	});

	t.is(moduleBundlerStub.callCount, 7, "moduleBundler should have been called 7 times");
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
		resources
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
		resources
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
		resources
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(4).args, [{
		options: {
			bundleDefinition: {
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
							"sap/ui/core/**/manifest.json",
							"!sap/ui/core/*-preload.js",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",

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
							"sap/ui/thirdparty/caja-html-sanitizer.js",
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(5).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/designtime/library-preload.designtime.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.designtime.js",
							"sap/ui/core/designtime/",
							"!sap/ui/core/**/*-preload.designtime.js",
							"!sap/ui/core/designtime/**/*.properties",
							"!sap/ui/core/designtime/**/*.svg",
							"!sap/ui/core/designtime/**/*.xml"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(6).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/library-preload.support.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.support.js",
							"!sap/ui/core/**/*-preload.support.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: false,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
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

test.serial("generateLibraryPreload for sap.ui.core with old specVersion defined (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const coreProject = {
		specVersion: "0.1"
	};
	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library"), _project: coreProject},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	comboByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	await generateLibraryPreload({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			// Should be ignored for hardcoded sap.ui.core bundle configuration
			excludes: ["sap/ui/core/**"]
		}
	});

	t.is(moduleBundlerStub.callCount, 7, "moduleBundler should have been called 7 times");
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
		resources
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
		resources
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
		resources
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(4).args, [{
		options: {
			bundleDefinition: {
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
							"sap/ui/core/**/manifest.json",
							"!sap/ui/core/*-preload.js",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",

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
							"sap/ui/thirdparty/caja-html-sanitizer.js",
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(5).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/designtime/library-preload.designtime.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.designtime.js",
							"sap/ui/core/designtime/",
							"!sap/ui/core/**/*-preload.designtime.js",
							"!sap/ui/core/designtime/**/*.properties",
							"!sap/ui/core/designtime/**/*.svg",
							"!sap/ui/core/designtime/**/*.xml"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(6).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/library-preload.support.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.support.js",
							"!sap/ui/core/**/*-preload.support.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: false,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
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

test.serial("generateLibraryPreload for sap.ui.core with own bundle configuration (w/o ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const coreProject = {
		specVersion: "2.4" // A newer specVersion is the indicator that the hardcoded bundle config should be skipped
	};
	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library"), _project: coreProject},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
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

	t.is(moduleBundlerStub.callCount, 3, "moduleBundler should have been called 3 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
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
							"sap/ui/core/**/manifest.json",
							"!sap/ui/core/*-preload.js",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",

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
							"sap/ui/thirdparty/caja-html-sanitizer.js",
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/designtime/library-preload.designtime.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.designtime.js",
							"sap/ui/core/designtime/",
							"!sap/ui/core/**/*-preload.designtime.js",
							"!sap/ui/core/designtime/**/*.properties",
							"!sap/ui/core/designtime/**/*.svg",
							"!sap/ui/core/designtime/**/*.xml"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(2).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/library-preload.support.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.support.js",
							"!sap/ui/core/**/*-preload.support.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: false,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
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

test.serial("generateLibraryPreload for sap.ui.core with own bundle configuration (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub, ReaderCollectionPrioritizedStub,
		workspace, dependencies, comboByGlob
	} = t.context;

	const coreProject = {
		specVersion: "2.6" // A newer specVersion is the indicator that the hardcoded bundle config should be skipped
	};
	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library"), _project: coreProject},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
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

	t.is(moduleBundlerStub.callCount, 3, "moduleBundler should have been called 3 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
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
							"sap/ui/core/**/manifest.json",
							"!sap/ui/core/*-preload.js",
							"!sap/ui/core/designtime/",
							"!sap/ui/core/**/*.designtime.js",
							"!sap/ui/core/**/*.support.js",

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
							"sap/ui/thirdparty/caja-html-sanitizer.js",
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
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(1).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/designtime/library-preload.designtime.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.designtime.js",
							"sap/ui/core/designtime/",
							"!sap/ui/core/**/*-preload.designtime.js",
							"!sap/ui/core/designtime/**/*.properties",
							"!sap/ui/core/designtime/**/*.svg",
							"!sap/ui/core/designtime/**/*.xml"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: true,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
			}
		},
		resources
	}]);
	t.deepEqual(moduleBundlerStub.getCall(2).args, [{
		options: {
			bundleDefinition: {
				name: "sap/ui/core/library-preload.support.js",
				sections: [
					{
						filters: [
							"sap/ui/core/**/*.support.js",
							"!sap/ui/core/**/*-preload.support.js"
						],
						mode: "preload",
						renderer: false,
						resolve: false,
						resolveConditional: false,
					}
				]
			},
			bundleOptions: {
				optimize: false,
				usePredefineCalls: true,
				ignoreMissingModules: true,
				skipIfEmpty: true
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

test.serial("generateLibraryPreload with excludes", async (t) => {
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
			projectName: "Test Library",
			excludes: [
				"my/lib/thirdparty/",
				"!my/lib/thirdparty/NotExcluded.js"
			]
		}
	});

	t.is(moduleBundlerStub.callCount, 3, "moduleBundler should have been called 3 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				name: "my/lib/library-preload.js",
				sections: [
					{
						filters: [
							"my/lib/",
							"my/lib/**/manifest.json",
							"!my/lib/*-preload.js",
							"!my/lib/designtime/",
							"!my/lib/**/*.designtime.js",
							"!my/lib/**/*.support.js",

							// via excludes option
							"!my/lib/thirdparty/",
							"+my/lib/thirdparty/NotExcluded.js"
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


test.serial("generateLibraryPreload with invalid excludes", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, comboByGlob, log
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
			projectName: "Test Library",
			excludes: [
				"!**/foo/",
				"!my/other/lib/"
			]
		}
	});

	t.is(moduleBundlerStub.callCount, 3, "moduleBundler should have been called 3 times");
	t.deepEqual(moduleBundlerStub.getCall(0).args, [{
		options: {
			bundleDefinition: {
				name: "my/lib/library-preload.js",
				sections: [
					{
						filters: [
							"my/lib/",
							"my/lib/**/manifest.json",
							"!my/lib/*-preload.js",
							"!my/lib/designtime/",
							"!my/lib/**/*.designtime.js",
							"!my/lib/**/*.support.js"
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

	t.is(log.warn.callCount, 2, "log.warn should be called twice");
	t.deepEqual(log.warn.getCall(0).args, [
		"Configured preload exclude contains invalid re-include: !**/foo/. " +
		"Re-includes must start with the library's namespace my/lib"
	]);
	t.deepEqual(log.warn.getCall(1).args, [
		"Configured preload exclude contains invalid re-include: !my/other/lib/. " +
		"Re-includes must start with the library's namespace my/lib"
	]);

	t.is(log.verbose.callCount, 0, "log.verbose should not be called");
	t.is(log.error.callCount, 0, "log.error should not be called");
});
