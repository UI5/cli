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
	t.context.firstByGlob = t.context.workspace.byGlob.onFirstCall();
	t.context.secondByGlob = t.context.workspace.byGlob.onSecondCall();

	t.context.moduleBundlerStub = sinon.stub().resolves([]);

	t.context.generateLibraryPreload = await esmock("../../../../lib/tasks/bundlers/generateLibraryPreload.js", {
		"../../../../lib/processors/bundlers/moduleBundler.js": t.context.moduleBundlerStub,
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:tasks:bundlers:generateLibraryPreload").returns(t.context.log)
		}
	});
});

test.afterEach.always(() => {
	sinon.restore();
});

test.serial("generateLibraryPreload", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/my/lib/.library")}
	];
	firstByGlob.resolves(resources);

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
							"!my/lib/**/*-preload.js",
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

	t.is(workspace.byGlob.callCount, 2,
		"workspace.byGlob should have been called twice");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");
});

test.serial("generateLibraryPreload for sap.ui.core (w/o ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	firstByGlob.resolves(resources);

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
							"!sap/ui/core/**/*-preload.js",
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

	t.is(workspace.byGlob.callCount, 2,
		"workspace.byGlob should have been called twice");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");
});


test.serial("generateLibraryPreload for sap.ui.core (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob, secondByGlob,
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	firstByGlob.resolves(resources);
	secondByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	const coreProject = {
		getSpecVersion: () => {
			return {
				toString: () => "0.1",
				lte: () => true,
			};
		}
	};
	const taskUtil = {
		getTag: sinon.stub().returns(false),
		getProject: () => coreProject,
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};
	await generateLibraryPreload({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "sap.ui.core",
			// Should be ignored for hardcoded sap.ui.core bundle configuration
			excludes: ["sap/ui/core/**"]
		}
	});

	t.is(workspace.byGlob.callCount, 3,
		"workspace.byGlob should have been called three times");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(2).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");

	t.is(taskUtil.getTag.callCount, 2, "TaskUtil#getTag got called two times");
	t.is(taskUtil.getTag.getCall(0).args[0], resources[2],
		"TaskUtil#getTag got called with expected resource on first call");
	t.is(taskUtil.getTag.getCall(0).args[1], "<IsDebugVariant>",
		"TaskUtil#getTag got called with expected tag on first call");
	t.is(taskUtil.getTag.getCall(1).args[0], resources[1],
		"TaskUtil#getTag got called with expected resource on second call");
	t.is(taskUtil.getTag.getCall(1).args[1], "<IsDebugVariant>",
		"TaskUtil#getTag got called with expected tag on second call");

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
			},
			moduleNameMapping: {}
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
			},
			moduleNameMapping: {}
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
							"!sap/ui/core/**/*-preload.js",
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
});

test.serial("generateLibraryPreload for sap.ui.core with old specVersion defined (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob, secondByGlob,
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	firstByGlob.resolves(resources);
	secondByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	const coreProject = {
		getSpecVersion: () => {
			return {
				toString: () => "0.1",
				lte: () => true,
			};
		}
	};

	const taskUtil = {
		getTag: sinon.stub().returns(false),
		getProject: () => coreProject,
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};
	taskUtil.getTag
		.withArgs(sinon.match.any, taskUtil.STANDARD_TAGS.HasDebugVariant)
		.returns(true);
	await generateLibraryPreload({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "sap.ui.core",
			// Should be ignored for hardcoded sap.ui.core bundle configuration
			excludes: ["sap/ui/core/**"]
		}
	});

	t.is(workspace.byGlob.callCount, 3,
		"workspace.byGlob should have been called three times");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(2).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");

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
			},
			moduleNameMapping: {}
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
			},
			moduleNameMapping: {}
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
							"!sap/ui/core/**/*-preload.js",
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
});

test.serial("generateLibraryPreload for sap.ui.core with own bundle configuration (w/o ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	firstByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	const coreProject = {
		// A newer specVersion is the indicator that the hardcoded bundle config should be skipped
		getSpecVersion: () => {
			return {
				toString: () => "2.4",
				lte: () => false,
			};
		}
	};
	const taskUtil = {
		getTag: sinon.stub().returns(false),
		getProject: () => coreProject,
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};
	await generateLibraryPreload({
		workspace,
		dependencies,
		taskUtil,
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
							"!sap/ui/core/**/*-preload.js",
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

	t.is(workspace.byGlob.callCount, 2,
		"workspace.byGlob should have been called twice");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");
});

test.serial("generateLibraryPreload for sap.ui.core with own bundle configuration (/w ui5loader.js)", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")},
		{getPath: sinon.stub().returns("/resources/ui5loader.js")},
		{getPath: sinon.stub().returns("/resources/sap-ui-core.js")}
	];
	firstByGlob.resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	const coreProject = {
		// A newer specVersion is the indicator that the hardcoded bundle config should be skipped
		getSpecVersion: () => {
			return {
				toString: () => "2.6",
				lte: () => false,
			};
		}
	};
	const taskUtil = {
		getTag: sinon.stub().returns(false),
		getProject: () => coreProject,
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};
	taskUtil.getTag
		.withArgs(resources[0], taskUtil.STANDARD_TAGS.HasDebugVariant)
		.returns(true);
	await generateLibraryPreload({
		workspace,
		dependencies,
		taskUtil,
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
							"!sap/ui/core/**/*-preload.js",
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

	t.is(workspace.byGlob.callCount, 2,
		"workspace.byGlob should have been called twice");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");
});

test.serial("Error: Failed to resolve non-debug name", async (t) => {
	const {
		generateLibraryPreload,
		workspace, dependencies
	} = t.context;
	const resources = [
		{getPath: sinon.stub().returns("/resources/resource-tagged-as-debug-variant.js")}
	];
	t.context.workspace.byGlob.onFirstCall().resolves(resources);
	t.context.workspace.byGlob.onSecondCall().resolves(resources);

	workspace.byGlob.resolves([
		{getPath: sinon.stub().returns("/resources/sap/ui/core/.library")}
	]);

	const coreProject = {
		getSpecVersion: () => {
			return {
				toString: () => "0.1",
				lte: () => true,
			};
		}
	};
	const taskUtil = {
		getTag: sinon.stub().returns(false),
		getProject: () => coreProject,
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: () => workspace
		}
	};
	taskUtil.getTag
		.withArgs(resources[0], taskUtil.STANDARD_TAGS.IsDebugVariant)
		.returns(true);

	await t.throwsAsync(generateLibraryPreload({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "sap.ui.core",
			// Should be ignored for hardcoded sap.ui.core bundle configuration
			excludes: ["sap/ui/core/**"]
		}
	}), {
		message: "Failed to resolve non-debug name for /resources/resource-tagged-as-debug-variant.js"
	});
});

test.serial("generateLibraryPreload with excludes", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/my/lib/.library")}
	];
	firstByGlob.resolves(resources);

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
							"!my/lib/**/*-preload.js",
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

	t.is(workspace.byGlob.callCount, 2,
		"workspace.byGlob should have been called twice");
	t.deepEqual(workspace.byGlob.getCall(0).args, ["/**/*.{js,json,xml,html,properties,library,js.map}"],
		"workspace.byGlob should have been called with expected pattern");
	t.deepEqual(workspace.byGlob.getCall(1).args, ["/resources/**/.library"],
		"workspace.byGlob should have been called with expected pattern");
});


test.serial("generateLibraryPreload with invalid excludes", async (t) => {
	const {
		generateLibraryPreload, moduleBundlerStub,
		workspace, dependencies, firstByGlob, log
	} = t.context;

	const resources = [
		{getPath: sinon.stub().returns("/resources/my/lib/.library")}
	];
	firstByGlob.resolves(resources);

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
							"!my/lib/**/*-preload.js",
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
