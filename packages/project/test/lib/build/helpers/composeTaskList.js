import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import logger from "@ui5/logger";

test.beforeEach(async (t) => {
	t.context.log = {
		warn: sinon.stub()
	};
	const logStub = sinon.stub(logger, "getLogger").withArgs("build:helpers:composeTaskList").returns(t.context.log);

	t.context.composeTaskList = await esmock("../../../../lib/build/helpers/composeTaskList.js", {
		"@ui5/logger": logStub
	});
});

test.afterEach.always(() => {
	sinon.restore();
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
			t.is(log.warn.callCount, 0);
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
			t.is(log.warn.callCount, 0);
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
