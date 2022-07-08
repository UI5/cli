const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const logger = require("@ui5/logger");

test.beforeEach((t) => {
	t.context.log = {
		warn: sinon.stub()
	};
	sinon.stub(logger, "getLogger").withArgs("build:helpers:composeTaskList").returns(t.context.log);

	t.context.composeTaskList = mock.reRequire("../../../../lib/build/helpers/composeTaskList");
});

test.afterEach.always(() => {
	sinon.restore();
	mock.stopAll();
});

const allTasks = [
	"replaceCopyright",
	"replaceVersion",
	"replaceBuildtime",
	"escapeNonAsciiCharacters",
	"executeJsdocSdkTransformation",
	"generateApiIndex",
	"generateJsdoc",
	"minify",
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
];


[
	[
		"composeTaskList: archive=false / selfContained=false / jsdoc=false", {
			archive: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"minify",
			"buildThemes",
			"generateLibraryManifest",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateBundle",
			"generateLibraryPreload",
		]
	],
	[
		"composeTaskList: archive=true / selfContained=false / jsdoc=false", {
			archive: true,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"minify",
			"buildThemes",
			"generateLibraryManifest",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateBundle",
			"generateLibraryPreload",
		]
	],
	[
		"composeTaskList: archive=false / selfContained=true / jsdoc=false", {
			archive: false,
			selfContained: true,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"minify",
			"buildThemes",
			"transformBootstrapHtml",
			"generateLibraryManifest",
			"generateFlexChangesBundle",
			"generateStandaloneAppBundle",
			"generateBundle"
		]
	],
	[
		"composeTaskList: archive=false / selfContained=false / jsdoc=true", {
			archive: false,
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
			"generateBundle",
		]
	],
	[
		"composeTaskList: includedTasks / excludedTasks", {
			archive: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: ["generateResourcesJson", "replaceVersion"],
			excludedTasks: ["replaceCopyright", "generateApiIndex"]
		}, [
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"minify",
			"buildThemes",
			"generateLibraryManifest",
			"generateFlexChangesBundle",
			"generateComponentPreload",
			"generateResourcesJson",
			"generateBundle",
			"generateLibraryPreload",
		]
	],
	[
		"composeTaskList: includedTasks=*", {
			archive: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: ["*"],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"executeJsdocSdkTransformation",
			"generateApiIndex",
			"generateJsdoc",
			"minify",
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
			archive: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: ["*"]
		}, []
	],
	[
		"composeTaskList: includedTasks with unknown tasks", {
			archive: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: ["foo", "bar"],
			excludedTasks: []
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"minify",
			"buildThemes",
			"generateLibraryManifest",
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
			archive: false,
			selfContained: false,
			jsdoc: false,
			includedTasks: [],
			excludedTasks: ["foo", "bar"],
		}, [
			"replaceCopyright",
			"replaceVersion",
			"replaceBuildtime",
			"escapeNonAsciiCharacters",
			"minify",
			"buildThemes",
			"generateLibraryManifest",
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
		const taskList = composeTaskList(allTasks, args);
		t.deepEqual(taskList, expectedTaskList);
		if (assertCb) {
			assertCb(t);
		} else {
			// When no cb is defined, no logs are expected
			t.is(log.warn.callCount, 0);
		}
	});
});
