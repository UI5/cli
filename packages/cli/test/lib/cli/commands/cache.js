import test from "ava";
import path from "node:path";
import os from "node:os";
import sinon from "sinon";
import esmock from "esmock";
import {setLogLevel} from "@ui5/logger";
import {CACHE_VERSION} from "@ui5/project/internal/build/cache/CacheManager";

// Versioned build cache path, derived from CacheManager's CACHE_VERSION so it
// stays in sync when the version is bumped instead of being hardcoded here.
const BUILD_CACHE_PATH = `buildCache/${CACHE_VERSION}`;

function getDefaultArgv() {
	return {
		"_": ["cache", "clean"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
		"$0": "ui5"
	};
}

// Stable absolute path used as the resolved ui5DataDir in most tests. Anchored outside the home
// directory so path assertions are not affected by the ~ shortening applied to home-dir paths.
const TEST_UI5_DATA_DIR = path.join(path.resolve(path.sep), "test-ui5-home");

// Typical framework stub result shape: { path, libraryCount, versionCount }
const FRAMEWORK_STUB = {path: "framework", libraryCount: 18, versionCount: 5};
const WARNING_PREFIX = "Warning:";
const WARNING_TEXT =
	"Only run ui5 cache clean when no UI5 CLI process and no @ui5/* API consumer is actively running.";
const WARNING_IMPACT_TEXT =
	"Running ui5 cache clean while ui5 build or ui5 serve is in progress can break the running process " +
	"and lead to failed or inconsistent results.";
const PARALLEL_CLEANUP_NOTICE = "Nothing left to clean. A parallel cleanup might have happened.";
const ACTIVE_CACHE_HEADER = "Active Cache";
const STALE_CACHE_HEADER = "Stale Cache";

test.beforeEach(async (t) => {
	setLogLevel("info");
	t.context.argv = getDefaultArgv();
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");

	// Tests rely on not having UI5_DATA_DIR defined
	t.context.originalUi5DataDirEnv = process.env.UI5_DATA_DIR;
	delete process.env.UI5_DATA_DIR;

	t.context.getUi5DataDirOrDefaultStub = sinon.stub().resolves(TEST_UI5_DATA_DIR);

	t.context.frameworkCacheGetCacheInfo = sinon.stub();
	t.context.frameworkCacheCleanCache = sinon.stub();
	t.context.frameworkCacheCleanAdditional = sinon.stub().resolves([]);
	t.context.frameworkCacheGetAdditionalCacheInfo = sinon.stub().resolves([]);
	t.context.buildCacheGetCacheInfo = sinon.stub();
	t.context.buildCacheCleanCache = sinon.stub();
	t.context.buildCacheCleanAdditional = sinon.stub().resolves([]);
	t.context.buildCacheGetAdditionalCacheInfo = sinon.stub().resolves([]);

	t.context.yesnoStub = sinon.stub();

	t.context.cache = await esmock.p("../../../../lib/cli/commands/cache.js", {
		"@ui5/project/internal/ui5Framework/cache": {
			default: class {
				static getCacheInfo = t.context.frameworkCacheGetCacheInfo;
				static cleanCache = t.context.frameworkCacheCleanCache;
				static cleanAdditional = t.context.frameworkCacheCleanAdditional;
				static getAdditionalCacheInfo = t.context.frameworkCacheGetAdditionalCacheInfo;
			}
		},
		"@ui5/project/internal/build/cache/CacheManager": {
			default: class {
				static getCacheInfo = t.context.buildCacheGetCacheInfo;
				static cleanCache = t.context.buildCacheCleanCache;
				static cleanAdditional = t.context.buildCacheCleanAdditional;
				static getAdditionalCacheInfo = t.context.buildCacheGetAdditionalCacheInfo;
			}
		},
		"yesno": {
			default: t.context.yesnoStub,
		},
	}, {
		"../../../../lib/dataDir.js": {
			getUi5DataDirOrDefault: t.context.getUi5DataDirOrDefaultStub
		}
	});
});

test.afterEach.always((t) => {
	setLogLevel("info");
	sinon.restore();
	esmock.purge(t.context.cache);
	process.exitCode = undefined;
	if (typeof t.context.originalUi5DataDirEnv === "undefined") {
		delete process.env.UI5_DATA_DIR;
	} else {
		process.env.UI5_DATA_DIR = t.context.originalUi5DataDirEnv;
	}
});

// ─── Command structure ──────────────────────────────────────────────────────

test("Command builder", async (t) => {
	const cacheModule = await import("../../../../lib/cli/commands/cache.js");
	const yargsStub = {
		usage: sinon.stub().returnsThis(),
		option: sinon.stub().returnsThis(),
		example: sinon.stub().returnsThis(),
	};
	const cliStub = {
		demandCommand: sinon.stub().returnsThis(),
		command: sinon.stub().callsFake((_name, _desc, config) => {
			// Invoke the sub-command builder to cover the inner yargs setup
			if (config?.builder) {
				config.builder(yargsStub);
			}
			return cliStub;
		}),
	};
	const result = cacheModule.default.builder(cliStub);
	t.is(result, cliStub, "Builder returns cli instance");
	t.is(cliStub.demandCommand.callCount, 1, "demandCommand called once");
	t.is(cliStub.command.callCount, 1, "command called once");
	t.is(yargsStub.usage.callCount, 1, "usage called once for warning help banner");
	t.true(yargsStub.usage.firstCall.args[0].startsWith("WARNING:"),
		"usage banner starts with warning");
	t.is(yargsStub.option.callCount, 1, "option called for --force flag");
	t.is(yargsStub.example.callCount, 3, "example called 3 times");
});

test.serial("Command definition is correct", (t) => {
	t.is(t.context.cache.command, "cache");
	t.is(t.context.cache.describe,
		"Manage the UI5 CLI cache (downloaded framework packages and build data)");
	t.is(typeof t.context.cache.builder, "function");
	t.is(typeof t.context.cache.handler, "function");
});

// ─── ui5DataDir resolution ──────────────────────────────────────────────────

test.serial("ui5 cache clean: uses resolved path from getUi5DataDirOrDefault", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		stderrWriteStub, getUi5DataDirOrDefaultStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(getUi5DataDirOrDefaultStub.callCount, 1, "getUi5DataDirOrDefault called exactly once");

	t.is(frameworkCacheGetCacheInfo.firstCall.args[0], TEST_UI5_DATA_DIR,
		"getCacheInfo receives the resolved path");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(TEST_UI5_DATA_DIR), "Resolved ui5DataDir shown in checking line");
});

test.serial("ui5 cache clean: uses ~/.ui5 fallback provided by getUi5DataDirOrDefault", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		stderrWriteStub, getUi5DataDirOrDefaultStub} = t.context;

	const fallbackUi5DataDir = path.join(os.homedir(), ".ui5");
	getUi5DataDirOrDefaultStub.resolves(fallbackUi5DataDir);
	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(frameworkCacheGetCacheInfo.firstCall.args[0], fallbackUi5DataDir,
		"getCacheInfo receives default ~/.ui5 path when no configured value exists");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	const shortenedDataDir = "~" + path.sep + ".ui5";
	t.true(allOutput.includes(shortenedDataDir),
		"Fallback ui5DataDir shown with ~ in checking line");
	t.false(allOutput.includes(os.homedir()), "Full home directory is not printed");
});

// ─── Basic flow ─────────────────────────────────────────────────────────────

test.serial("ui5 cache clean: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Checking cache at"), "Prints checking line");
	t.true(allOutput.includes("Nothing to clean"), "Prints nothing to clean");
	t.false(allOutput.includes(ACTIVE_CACHE_HEADER), "Does not show Active Cache group when nothing can be cleaned");
	t.false(allOutput.includes(STALE_CACHE_HEADER), "Does not show Stale Cache group when nothing can be cleaned");
	t.is(frameworkCacheCleanCache.callCount, 0, "frameworkCache.cleanCache not called");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache not called");
});

test.serial("ui5 cache clean: removes both entries and reports", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 8 * 1024 * 1024});

	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 7 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache called once");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache called once");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Checking cache at"), "Prints checking line");
	t.true(allOutput.includes(TEST_UI5_DATA_DIR), "Shows resolved ui5DataDir");
	t.true(allOutput.includes(WARNING_PREFIX), "Shows safety warning before interactive confirmation");
	t.true(allOutput.includes(WARNING_TEXT), "Shows safety warning details");
	t.true(allOutput.includes(WARNING_IMPACT_TEXT), "Shows warning impact details");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, "framework")), "Shows absolute framework path");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, BUILD_CACHE_PATH)), "Shows absolute build path");
	t.true(allOutput.includes("5 versions of 18 libraries"), "Shows library stats format");
	t.true(allOutput.includes("8.0 MB"), "Shows pre-clean build cache size");
	t.false(allOutput.includes("Stale Cache"), "Does not report stale cache section when only active cache existed");
	t.true(allOutput.includes("Cleaned Active Cache (Framework and Build)"),
		"Shows success summary");
	const warningCall = stderrWriteStub.getCalls().find((call) => {
		return call.args[0].includes(WARNING_PREFIX);
	});
	t.truthy(warningCall, "Warning line is written to stderr");
	t.true(warningCall.callId < yesnoStub.firstCall.callId,
		"Warning is displayed before the confirmation prompt is shown");
});

test.serial("ui5 cache clean: cleanup result uses fresh active cache paths after confirmation", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves(null);
	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 2 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes("Removed null"), "Does not print null cache path in cleanup result");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, BUILD_CACHE_PATH)),
		"Shows absolute build cache path in cleanup result when build cache appears after confirmation");
	t.true(allOutput.includes("Cleaned Active Cache (Framework and Build)"),
		"Success summary includes both active framework and build cache");
});

test.serial("ui5 cache clean: reports parallel cleanup in verbose mode", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves(null);
	yesnoStub.resolves(true);
	frameworkCacheCleanCache.resolves(null);
	buildCacheCleanCache.resolves(null);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("The following cached data will be removed:"),
		"Keeps pre-confirmation preview output");
	t.true(allOutput.includes(PARALLEL_CLEANUP_NOTICE),
		"Reports that cleanup was already performed in parallel");
	t.false(allOutput.includes("Cleanup result:"), "Does not print cleanup result table for no-op cleanup");
	t.false(allOutput.includes("Success:"), "Does not print success summary for no-op cleanup");
});

test.serial("ui5 cache clean: non-verbose mode suppresses detailed summaries", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 8 * 1024 * 1024});
	yesnoStub.resolves(true);
	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 7 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(WARNING_PREFIX), "Shows warning in non-verbose mode before confirmation");
	t.true(allOutput.includes(WARNING_IMPACT_TEXT), "Shows warning impact in non-verbose mode");
	t.false(allOutput.includes("Checking cache at"), "Does not show checking line in non-verbose mode");
	t.false(allOutput.includes("The following cached data will be removed:"),
		"Does not show pre-clean detailed section without --verbose");
	t.false(allOutput.includes("Cleanup result:"),
		"Does not show post-clean detailed section without --verbose");
	t.false(allOutput.includes("Success:"), "Does not show success message in non-verbose mode");
	t.false(allOutput.includes("Cancelled"), "Does not show cancelled message in non-verbose mode");
});

test.serial("ui5 cache clean: does not report parallel cleanup in non-verbose mode", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves(null);
	yesnoStub.resolves(true);
	frameworkCacheCleanCache.resolves(null);
	buildCacheCleanCache.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(WARNING_PREFIX),
		"Shows warning in non-verbose mode before confirmation");
	t.true(allOutput.includes(WARNING_IMPACT_TEXT),
		"Shows warning impact in non-verbose mode before confirmation");
	t.false(allOutput.includes(PARALLEL_CLEANUP_NOTICE),
		"Does not print parallel cleanup notice in non-verbose mode");
	t.false(allOutput.includes("Cleanup result:"), "Does not print cleanup result table for no-op cleanup");
	t.false(allOutput.includes("Success:"), "Does not print success summary for no-op cleanup");
});

test.serial("ui5 cache clean: non-verbose mode with active cache skips additional info lookup", async (t) => {
	const {cache, argv, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub,
		frameworkCacheGetAdditionalCacheInfo, buildCacheGetAdditionalCacheInfo} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 8 * 1024 * 1024});
	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 7 * 1024 * 1024});
	yesnoStub.resolves(true);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(frameworkCacheGetAdditionalCacheInfo.callCount, 0,
		"Does not fetch additional framework cache info in non-verbose mode when active cache exists");
	t.is(buildCacheGetAdditionalCacheInfo.callCount, 0,
		"Does not fetch additional build cache info in non-verbose mode when active cache exists");
});

test.serial("ui5 cache clean: non-verbose mode with stale cache only stays quiet except warning/prompt", async (t) => {
	const {cache, argv, stderrWriteStub, yesnoStub,
		frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		frameworkCacheGetAdditionalCacheInfo, buildCacheGetAdditionalCacheInfo,
		frameworkCacheCleanAdditional, buildCacheCleanAdditional,
		frameworkCacheCleanCache, buildCacheCleanCache} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetAdditionalCacheInfo.resolves([
		{path: "_framework_to_delete_abcd", libraryCount: 5, versionCount: 2},
	]);
	buildCacheGetAdditionalCacheInfo.resolves([]);
	frameworkCacheCleanCache.resolves(null);
	buildCacheCleanCache.resolves(null);
	frameworkCacheCleanAdditional.resolves([
		{path: "_framework_to_delete_abcd", libraryCount: 5, versionCount: 2},
	]);
	buildCacheCleanAdditional.resolves([]);
	yesnoStub.resolves(true);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Prompts for confirmation in non-verbose mode when stale cache is found");
	t.is(frameworkCacheGetAdditionalCacheInfo.callCount, 1,
		"Fetches stale framework info when no active cache exists");
	t.is(buildCacheGetAdditionalCacheInfo.callCount, 1,
		"Fetches stale build info when no active cache exists");
	t.is(frameworkCacheCleanCache.callCount, 1, "Still executes framework cache cleanup flow");
	t.is(buildCacheCleanCache.callCount, 1, "Still executes build cache cleanup flow");
	t.is(frameworkCacheCleanAdditional.callCount, 1, "Cleans stale framework cache entries");
	t.is(buildCacheCleanAdditional.callCount, 1, "Cleans stale build cache entries");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(WARNING_PREFIX), "Shows warning in non-verbose mode");
	t.true(allOutput.includes(WARNING_IMPACT_TEXT), "Shows warning impact in non-verbose mode");
	t.false(allOutput.includes("Checking cache at"), "Does not show checking line in non-verbose mode");
	t.false(allOutput.includes("The following cached data will be removed:"),
		"Does not show detailed pre-clean summary in non-verbose mode");
	t.false(allOutput.includes("Cleanup result:"),
		"Does not show detailed cleanup summary in non-verbose mode");
	t.false(allOutput.includes("Success:"), "Does not show success message in non-verbose mode");
	t.false(allOutput.includes("Cancelled"), "Does not show cancelled message in non-verbose mode");
});

test.serial("ui5 cache clean: non-verbose --force mode is completely silent", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 8 * 1024 * 1024});
	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 7 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	argv["force"] = true;
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 0, "Does not prompt for confirmation when --force is used");
	t.is(stderrWriteStub.callCount, 0, "Does not write any output in non-verbose --force mode");
});

test.serial("ui5 cache clean: user cancels", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves(null);
	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");
	t.is(frameworkCacheCleanCache.callCount, 0, "cleanCache not called when user cancels");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache not called when user cancels");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(WARNING_PREFIX), "Shows warning before confirmation");
	t.false(allOutput.includes("Cancelled"), "Does not show cancelled message in non-verbose mode");
	t.false(allOutput.includes("Success"), "Does not show success message");
});

test.serial("ui5 cache clean: framework only — formats library stats correctly", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves(null);
	yesnoStub.resolves(true);
	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	let allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("5 versions of 18 libraries"), "Shows plural format");
	t.false(allOutput.includes("Build cache"), "Does not mention build cache");

	// Singular
	stderrWriteStub.resetHistory();
	const singleStub = {path: "framework", libraryCount: 1, versionCount: 1};
	frameworkCacheGetCacheInfo.resetBehavior();
	frameworkCacheCleanCache.resetBehavior();
	frameworkCacheGetCacheInfo.resolves(singleStub);
	frameworkCacheCleanCache.resolves(singleStub);

	argv["force"] = true;
	await cache.handler(argv);

	allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("1 version of 1 library"), "Uses singular 'version' and 'library'");
});

test.serial("ui5 cache clean: thousands separator in library stats", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheGetCacheInfo, yesnoStub} = t.context;

	const largeStub = {path: "framework", libraryCount: 155, versionCount: 1189};
	frameworkCacheGetCacheInfo.resolves(largeStub);
	buildCacheGetCacheInfo.resolves(null);
	yesnoStub.resolves(true);
	frameworkCacheCleanCache.resolves(largeStub);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("1,189 versions of 155 libraries"),
		"Shows thousands separator for large counts");
});

test.serial("ui5 cache clean: build only", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 50 * 1024});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 50 * 1024});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes("Framework cache"), "Does not mention framework");
	t.true(allOutput.includes("50.0 KB"), "Shows build cache size");
	t.true(allOutput.includes("Cleaned Active Cache (Build)"), "Success mentions active build group");
});

test.serial("ui5 cache clean: formats byte sizes correctly (< 1 KB)", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 500});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 500});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("500 B"), "Shows bytes format for size < 1 KB");
});

test.serial("ui5 cache clean: formats KB sizes correctly", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 50 * 1024});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 50 * 1024});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("50.0 KB"), "Shows KB format");
});

test.serial("ui5 cache clean: formats GB sizes correctly", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: "large", size: 2.5 * 1024 * 1024 * 1024});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: "large", size: 2.5 * 1024 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("2.5 GB"), "Shows GB format");
});

test.serial("ui5 cache clean --force: skips confirmation prompt", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 5 * 1024 * 1024});
	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 5 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 0, "Should not ask for confirmation with --force");
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache called");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache called");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Success"), "Shows success message");
	t.false(allOutput.includes(WARNING_PREFIX), "Does not show warning when --force is used");
});

test.serial("ui5 cache clean: shows stale framework data in pre-confirmation summary", async (t) => {
	const {cache, argv, stderrWriteStub, yesnoStub,
		frameworkCacheCleanCache, frameworkCacheGetAdditionalCacheInfo} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetAdditionalCacheInfo.resolves([
		{path: "_framework_to_delete_abcd", libraryCount: 5, versionCount: 2},
	]);
	frameworkCacheCleanCache.resolves(null);

	yesnoStub.resolves(true);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Stale Cache"), "Shows stale cache group in pre-confirm summary");
	t.true(allOutput.includes("Framework"), "Shows framework subgroup in pre-confirm summary");
	t.true(allOutput.includes("_framework_to_delete_abcd"), "Shows stale removal dir path indented");
	t.true(allOutput.includes("2 versions of 5 libraries"), "Shows stale removal dir stats");
});

test.serial("ui5 cache clean: shows stale framework data in post-clean summary", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheGetAdditionalCacheInfo,
		frameworkCacheCleanCache, frameworkCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves({path: "framework", libraryCount: 3, versionCount: 1});
	t.context.buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetAdditionalCacheInfo.resolves([
		{path: "_framework_to_delete_ab12", libraryCount: 3, versionCount: 1},
		{path: "_framework_to_delete_cd34", libraryCount: 3, versionCount: 1},
	]);
	frameworkCacheCleanCache.resolves({path: "framework", libraryCount: 3, versionCount: 1});
	frameworkCacheCleanAdditional.resolves([
		{path: "_framework_to_delete_ab12", libraryCount: 3, versionCount: 1},
		{path: "_framework_to_delete_cd34", libraryCount: 3, versionCount: 1},
	]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Cleanup result:"), "Shows cleanup result heading");
	t.true(allOutput.includes("Stale Cache"), "Shows stale cache group in result");
	t.true(allOutput.includes("Framework"), "Shows framework subgroup in result");
	t.true(allOutput.includes("_framework_to_delete_ab12"), "Shows first stale removal dir path indented");
	t.true(allOutput.includes("_framework_to_delete_cd34"), "Shows second stale removal dir path indented");
	const summaryLine = allOutput.split("\n").find((line) => line.includes("Success:"));
	t.truthy(summaryLine, "Output includes success summary line");
	t.true(summaryLine.includes("Active Cache (Framework) and Stale Cache (Framework)"),
		"Summary line distinguishes active and stale framework groups");
	t.false(summaryLine.includes("Stale Cache (Framework and Framework)"),
		"Summary line does not duplicate framework subgroup within stale section");
});

test.serial("ui5 cache clean: shows stale-only success summary when no active framework", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheGetAdditionalCacheInfo,
		frameworkCacheCleanCache, frameworkCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetAdditionalCacheInfo.resolves([
		{path: "_framework_to_delete_zz99", libraryCount: 10, versionCount: 3},
	]);
	frameworkCacheCleanCache.resolves(null);
	frameworkCacheCleanAdditional.resolves([
		{path: "_framework_to_delete_zz99", libraryCount: 10, versionCount: 3},
	]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Stale Cache"), "Shows stale cache group");
	t.true(allOutput.includes("Framework"), "Shows framework subgroup");
	t.true(allOutput.includes("Cleaned Stale Cache (Framework)"),
		"Success summary mentions stale framework group");
	t.false(allOutput.includes("Removed UI5 Framework packages"),
		"Does not show main framework removed line when absent");
});

test.serial("ui5 cache clean: shows stale build cache in pre-confirm and post-clean summary", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheCleanCache, buildCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	buildCacheGetAdditionalCacheInfo.resolves([
		{path: BUILD_CACHE_PATH, size: 40 * 1024 * 1024},
	]);
	buildCacheCleanCache.resolves(null);
	buildCacheCleanAdditional.resolves([
		{path: BUILD_CACHE_PATH, size: 40 * 1024 * 1024},
	]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Stale Cache"), "Shows stale cache group");
	t.true(allOutput.includes("Build"), "Shows build subgroup");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, BUILD_CACHE_PATH)),
		"Shows stale build cache path indented");
	t.true(allOutput.includes("Removed"), "Post-clean result shows removed entries");
	t.true(allOutput.includes("freed 40.0 MB"), "Shows freed size in post-clean result");
	t.true(allOutput.includes("Cleaned Stale Cache (Build)"), "Success summary mentions stale build group");
});

test.serial("ui5 cache clean: post-clean summary does not duplicate active build cleanup as stale", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheGetCacheInfo, buildCacheCleanCache, buildCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 30 * 1024 * 1024});
	buildCacheGetAdditionalCacheInfo.resolves([]);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 30 * 1024 * 1024});
	buildCacheCleanAdditional.resolves([
		{path: BUILD_CACHE_PATH, size: 30 * 1024 * 1024},
	]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("30.0 MB"), "Shows active build cleanup size in post-clean output");
	t.true(allOutput.includes("Cleaned Active Cache (Build)"),
		"Success summary reports active build cleanup");
	t.false(allOutput.includes("Stale Cache"),
		"Does not duplicate active build cleanup as stale build cleanup");
	t.false(allOutput.includes("freed 30.0 MB"),
		"Does not render stale build cleanup details when active build cleanup already covered it");
});

test.serial("ui5 cache clean: keeps stale build cleanup when stale existed pre-confirm", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheGetCacheInfo, buildCacheCleanCache, buildCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 30 * 1024 * 1024});
	buildCacheGetAdditionalCacheInfo.resolves([
		{path: BUILD_CACHE_PATH, size: 12 * 1024 * 1024},
	]);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 30 * 1024 * 1024});
	buildCacheCleanAdditional.resolves([
		{path: BUILD_CACHE_PATH, size: 30 * 1024 * 1024},
	]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Cleaned Active Cache (Build) and Stale Cache (Build)"),
		"Keeps stale build section when stale build existed before confirmation");
	t.true(allOutput.includes("freed 30.0 MB"),
		"Shows stale build cleanup details when stale build existed before confirmation");
});

test.serial("ui5 cache clean: post-clean summary ignores stale preview when cleanup result is empty", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheGetCacheInfo, buildCacheCleanCache, buildCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);
	buildCacheGetAdditionalCacheInfo.resolves([
		{path: BUILD_CACHE_PATH, size: 12 * 1024 * 1024},
	]);
	buildCacheCleanCache.resolves(null);
	buildCacheCleanAdditional.resolves([]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, BUILD_CACHE_PATH)),
		"Pre-confirm summary still shows stale build preview entry");
	t.true(allOutput.includes(PARALLEL_CLEANUP_NOTICE),
		"Post-clean summary reflects current cleanup state, not stale preview snapshot");
	t.false(allOutput.includes("Cleaned Stale Cache (Build)"),
		"Does not claim stale build cleanup without current cleanup result");
});

test.serial("ui5 cache clean: build cache and stale build cache with size 0 omit size detail", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheCleanCache, buildCacheCleanAdditional, buildCacheGetCacheInfo} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 0});
	buildCacheGetAdditionalCacheInfo.resolves([
		{path: BUILD_CACHE_PATH, size: 0},
	]);
	buildCacheCleanCache.resolves({path: BUILD_CACHE_PATH, size: 0});
	buildCacheCleanAdditional.resolves([
		{path: BUILD_CACHE_PATH, size: 0},
	]);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	argv["force"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes("0 B"), "Does not show zero size");
	t.true(allOutput.includes("Build"), "Shows build subgroup");
	t.true(allOutput.includes("Removed"), "Shows removed result lines");
	t.false(allOutput.includes("freed"), "Does not show freed label when size is 0");
});

test.serial("ui5 cache clean: pre-clean summary shows only Active Cache group", async (t) => {
	const {cache, argv, stderrWriteStub, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	t.context.buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 2 * 1024 * 1024});
	t.context.frameworkCacheGetAdditionalCacheInfo.resolves([]);
	t.context.buildCacheGetAdditionalCacheInfo.resolves([]);
	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(ACTIVE_CACHE_HEADER), "Shows Active Cache group header");
	t.false(allOutput.includes(STALE_CACHE_HEADER),
		"Does not show Stale Cache group header when no stale entries exist");
});

test.serial("ui5 cache clean: pre-clean summary shows only Stale Cache group", async (t) => {
	const {cache, argv, stderrWriteStub, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	t.context.frameworkCacheGetAdditionalCacheInfo.resolves([
		{path: "_framework_to_delete_abcd", libraryCount: 4, versionCount: 2},
	]);
	t.context.buildCacheGetAdditionalCacheInfo.resolves([
		{path: BUILD_CACHE_PATH, size: 5 * 1024 * 1024},
	]);
	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes(ACTIVE_CACHE_HEADER),
		"Does not show Active Cache group header when no active entries exist");
	t.true(allOutput.includes(STALE_CACHE_HEADER), "Shows Stale Cache group header");
});

test.serial("ui5 cache clean: pre-clean summary shows both groups when active and stale entries exist", async (t) => {
	const {cache, argv, stderrWriteStub, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	t.context.buildCacheGetCacheInfo.resolves({path: BUILD_CACHE_PATH, size: 6 * 1024 * 1024});
	t.context.frameworkCacheGetAdditionalCacheInfo.resolves([
		{path: "_framework_to_delete_xy12", libraryCount: 3, versionCount: 1},
	]);
	t.context.buildCacheGetAdditionalCacheInfo.resolves([
		{path: "buildCache/v0_6", size: 1 * 1024 * 1024},
	]);
	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	setLogLevel("verbose");
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(ACTIVE_CACHE_HEADER), "Shows Active Cache group header");
	t.true(allOutput.includes(STALE_CACHE_HEADER), "Shows Stale Cache group header");
});
