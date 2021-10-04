const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	t.context.log = {
		warn: sinon.stub()
	};
	const logger = require("@ui5/logger");
	sinon.stub(logger, "getGroupLogger").withArgs("builder:builder").returns(t.context.log);

	const builder = mock.reRequire("../../../lib/builder/builder");
	t.context.composeTaskList = builder._composeTaskList;
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});


[
	[
		"composeTaskList: dev=false / selfContained=false / jsdoc=false", {
			dev: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"createDebugFiles",
			"escapeNonAsciiCharacters",
			"uglify",
			"buildThemes",
			"generateLibraryManifest",
			"generateVersionInfo",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateBundle",
			"generateLibraryPreload",
		]
	],
	[
		"composeTaskList: dev=true / selfContained=false / jsdoc=false", {
			dev: true,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"buildThemes"
		]],
	[
		"composeTaskList: dev=false / selfContained=true / jsdoc=false", {
			dev: false,
			selfContained: true,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"createDebugFiles",
			"escapeNonAsciiCharacters",
			"uglify",
			"buildThemes",
			"transformBootstrapHtml",
			"generateLibraryManifest",
			"generateVersionInfo",
			"generateFlexChangesBundle",
			"generateStandaloneAppBundle",
			"generateBundle"
		]
	],
	[
		"composeTaskList: dev=false / selfContained=false / jsdoc=true", {
			dev: false,
			selfContained: false,
			jsdoc: true,
			includedTasks: [],
			excludedTasks: []
		}, [
			"escapeNonAsciiCharacters",
			"executeJsdocSdkTransformation",
			"generateApiIndex",
			"generateJsdoc",
			"buildThemes",
			"generateVersionInfo",
			"generateBundle",
		]
	],
	[
		"composeTaskList: includedTasks / excludedTasks", {
			dev: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: ["generateResourcesJson", "replaceVersion"],
			excludedTasks: ["replaceCopyright", "generateApiIndex"]
		}, [
			"replaceVersion",
			"replaceBuildtime",
			"createDebugFiles",
			"escapeNonAsciiCharacters",
			"uglify",
			"buildThemes",
			"generateLibraryManifest",
			"generateVersionInfo",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateResourcesJson",
			"generateBundle",
			"generateLibraryPreload",
		]
	],
	[
		"composeTaskList: includedTasks=*", {
			dev: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: ["*"],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"createDebugFiles",
			"escapeNonAsciiCharacters",
			"executeJsdocSdkTransformation",
			"generateApiIndex",
			"generateJsdoc",
			"uglify",
			"buildThemes",
			"transformBootstrapHtml",
			"generateLibraryManifest",
			"generateVersionInfo",
			"generateManifestBundle",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateResourcesJson",
			"generateThemeDesignerResources",
			"generateStandaloneAppBundle",
			"generateBundle",
			"generateLibraryPreload",
			"generateCachebusterInfo",
		]
	],
	[
		"composeTaskList: excludedTasks=*", {
			dev: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: ["*"]
		}, []
	],
	[
		"composeTaskList: includedTasks with unknown tasks", {
			dev: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: ["foo", "bar"],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"createDebugFiles",
			"escapeNonAsciiCharacters",
			"uglify",
			"buildThemes",
			"generateLibraryManifest",
			"generateVersionInfo",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateBundle",
			"generateLibraryPreload",
		], (t) => {
			const {log} = t.context;
			t.is(log.warn.callCount, 2);
			t.deepEqual(log.warn.getCall(0).args, [
				"Unable to include task 'foo': Task is unknown"
			]);
			t.deepEqual(log.warn.getCall(1).args, [
				"Unable to include task 'bar': Task is unknown"
			]);
		}
	],
	[
		"composeTaskList: excludedTasks with unknown tasks", {
			dev: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: ["foo", "bar"],
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"createDebugFiles",
			"escapeNonAsciiCharacters",
			"uglify",
			"buildThemes",
			"generateLibraryManifest",
			"generateVersionInfo",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateBundle",
			"generateLibraryPreload",
		], (t) => {
			const {log} = t.context;
			t.is(log.warn.callCount, 2);
			t.deepEqual(log.warn.getCall(0).args, [
				"Unable to exclude task 'foo': Task is unknown"
			]);
			t.deepEqual(log.warn.getCall(1).args, [
				"Unable to exclude task 'bar': Task is unknown"
			]);
		}
	],
].forEach(([testTitle, args, expectedTaskList, assertCb]) => {
	test.serial(testTitle, (t) => {
		const {composeTaskList, log} = t.context;
		const taskList = composeTaskList(args);
		t.deepEqual(taskList, expectedTaskList);
		if (assertCb) {
			assertCb(t);
		} else {
			// When no cb is defined, no logs are expected
			t.is(log.warn.callCount, 0);
		}
	});
});
