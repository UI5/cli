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
	t.context.stdoutWriteStub = sinon.stub(process.stdout, "write");

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
	t.context.buildCacheGetProjectCacheInfo = sinon.stub();
	t.context.buildCacheCleanProject = sinon.stub();
	t.context.buildCacheGetProjectsCacheEntries = sinon.stub().resolves(new Map());
	t.context.buildCacheGetStageDetails = sinon.stub().resolves([]);
	t.context.getProjectBuildSignaturesStub = sinon.stub().resolves(new Map());

	t.context.yesnoStub = sinon.stub();

	t.context.getRootStub = sinon.stub().returns({getId: () => "my.project"});
	// Projects yielded by the graph traversal in inspect tests
	t.context.inspectProjects = [
		{name: "my.project", id: "my.project", type: "application", version: "1.0.0", framework: false},
		{name: "sap.ui.core", id: "sap.ui.core", type: "library", version: "1.120.0", framework: true},
	];
	t.context.traverseBreadthFirstStub = sinon.stub().callsFake(async (cb) => {
		for (const p of t.context.inspectProjects) {
			await cb({project: {
				getName: () => p.name,
				getId: () => p.id,
				getType: () => p.type,
				getVersion: () => p.version,
				isFrameworkProject: () => p.framework,
			}});
		}
	});
	const graphStub = {
		getRoot: t.context.getRootStub,
		traverseBreadthFirst: t.context.traverseBreadthFirstStub,
	};
	t.context.graphFromPackageDependencies = sinon.stub().resolves(graphStub);
	t.context.graphFromStaticFile = sinon.stub().resolves(graphStub);

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
				static getProjectCacheInfo = t.context.buildCacheGetProjectCacheInfo;
				static cleanProject = t.context.buildCacheCleanProject;
				static getProjectsCacheEntries = t.context.buildCacheGetProjectsCacheEntries;
				static getStageDetails = t.context.buildCacheGetStageDetails;
			}
		},
		"@ui5/project/internal/build/helpers/getProjectBuildSignatures": {
			getProjectBuildSignatures: t.context.getProjectBuildSignaturesStub,
		},
		"@ui5/project/graph": {
			graphFromPackageDependencies: t.context.graphFromPackageDependencies,
			graphFromStaticFile: t.context.graphFromStaticFile,
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
		positional: sinon.stub().returnsThis(),
		coerce: sinon.stub().returnsThis(),
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
	t.is(cliStub.command.callCount, 3, "command called for 'clean', 'inspect' and 'inspect-stage'");
	t.is(yargsStub.usage.callCount, 1, "usage called once for warning help banner (clean only)");
	t.true(yargsStub.usage.firstCall.args[0].startsWith("WARNING:"),
		"usage banner starts with warning");
	// clean: config, dependency-definition, workspace-config, workspace, force, project (6)
	// inspect: config, dependency-definition, workspace-config, workspace, include-task, exclude-task,
	//   build-mode, all, stale, stages, sizes, framework-version, snapshot-cache, json (14)
	// inspect-stage: sizes, json (2)
	t.is(yargsStub.option.callCount, 22, "option called for all clean, inspect and inspect-stage options");
	t.is(yargsStub.positional.callCount, 2, "positional called for inspect projectId and inspect-stage signature");
	// clean: 5 examples, inspect: 4 examples, inspect-stage: 2 examples
	t.is(yargsStub.example.callCount, 11, "example called 11 times across all sub-commands");
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

// ─── Project-scoped clean (ui5 cache clean --project) ────────────────────────

test.serial("ui5 cache clean --project: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetProjectCacheInfo,
		buildCacheCleanProject, frameworkCacheCleanCache, yesnoStub} = t.context;

	buildCacheGetProjectCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(buildCacheGetProjectCacheInfo.callCount, 1, "Looks up project cache info");
	t.is(buildCacheGetProjectCacheInfo.firstCall.args[0], TEST_UI5_DATA_DIR, "Uses resolved ui5DataDir");
	t.is(buildCacheGetProjectCacheInfo.firstCall.args[1], "my.project", "Uses resolved root project id");
	t.is(yesnoStub.callCount, 0, "Does not prompt when nothing to clean");
	t.is(buildCacheCleanProject.callCount, 0, "Does not clean when nothing to clean");
	t.is(frameworkCacheCleanCache.callCount, 0, "Never touches framework cache in project mode");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Nothing to clean"), "Prints nothing to clean");
});

test.serial("ui5 cache clean --project: removes project build cache with --force", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetProjectCacheInfo,
		buildCacheCleanProject, frameworkCacheCleanCache, buildCacheCleanCache, yesnoStub} = t.context;

	buildCacheGetProjectCacheInfo.resolves({path: BUILD_CACHE_PATH, projectId: "my.project"});
	buildCacheCleanProject.resolves({path: BUILD_CACHE_PATH, projectId: "my.project", deletedEntries: 42});

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	argv["force"] = true;
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 0, "Does not prompt with --force");
	t.is(buildCacheCleanProject.callCount, 1, "Cleans project build cache");
	t.is(buildCacheCleanProject.firstCall.args[1], "my.project", "Cleans the resolved root project id");
	t.is(frameworkCacheCleanCache.callCount, 0, "Does not touch framework cache");
	t.is(buildCacheCleanCache.callCount, 0, "Does not run full build cache clean");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("my.project"), "Names the project");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, BUILD_CACHE_PATH)), "Shows absolute build cache path");
	t.true(allOutput.includes("42 entries"), "Reports number of removed entries");
	t.true(allOutput.includes("Success:"), "Shows success summary");
});

test.serial("ui5 cache clean --project: user cancels", async (t) => {
	const {cache, argv, buildCacheGetProjectCacheInfo, buildCacheCleanProject, yesnoStub} = t.context;

	buildCacheGetProjectCacheInfo.resolves({path: BUILD_CACHE_PATH, projectId: "my.project"});
	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Prompts for confirmation");
	t.is(buildCacheCleanProject.callCount, 0, "Does not clean when user cancels");
});

test.serial("ui5 cache clean --project: reports parallel cleanup when result is empty", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetProjectCacheInfo,
		buildCacheCleanProject, yesnoStub} = t.context;

	buildCacheGetProjectCacheInfo.resolves({path: BUILD_CACHE_PATH, projectId: "my.project"});
	buildCacheCleanProject.resolves(null);
	yesnoStub.resolves(true);

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(buildCacheCleanProject.callCount, 1, "Attempts cleanup");
	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(PARALLEL_CLEANUP_NOTICE), "Reports parallel cleanup for empty result");
	t.false(allOutput.includes("Success:"), "Does not claim success for empty result");
});

test.serial("ui5 cache clean --project: non-verbose --force stays quiet", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetProjectCacheInfo, buildCacheCleanProject} = t.context;

	buildCacheGetProjectCacheInfo.resolves({path: BUILD_CACHE_PATH, projectId: "my.project"});
	buildCacheCleanProject.resolves({path: BUILD_CACHE_PATH, projectId: "my.project", deletedEntries: 3});

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	argv["force"] = true;
	await cache.handler(argv);

	t.is(buildCacheCleanProject.callCount, 1, "Cleans project build cache");
	t.is(stderrWriteStub.callCount, 0, "Writes nothing in non-verbose --force mode");
});

test.serial("ui5 cache clean --project: resolves graph via package dependencies by default", async (t) => {
	const {cache, argv, graphFromPackageDependencies, graphFromStaticFile,
		buildCacheGetProjectCacheInfo} = t.context;

	buildCacheGetProjectCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	await cache.handler(argv);

	t.is(graphFromPackageDependencies.callCount, 1, "Resolves graph from package dependencies");
	t.is(graphFromStaticFile.callCount, 0, "Does not use static file resolution");
});

test.serial("ui5 cache clean --project: uses static file when dependency-definition is given", async (t) => {
	const {cache, argv, graphFromPackageDependencies, graphFromStaticFile,
		buildCacheGetProjectCacheInfo} = t.context;

	buildCacheGetProjectCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	argv["project"] = ""; // bare --project resolves the root project id
	argv["dependencyDefinition"] = "/path/to/deps.yaml";
	await cache.handler(argv);

	t.is(graphFromStaticFile.callCount, 1, "Resolves graph from static file");
	t.is(graphFromStaticFile.firstCall.args[0].filePath, "/path/to/deps.yaml", "Passes dependency definition path");
	t.is(graphFromPackageDependencies.callCount, 0, "Does not use package dependency resolution");
});

test.serial("ui5 cache clean --project <id>: uses the given id without resolving the graph", async (t) => {
	const {cache, argv, stderrWriteStub, graphFromPackageDependencies, graphFromStaticFile,
		buildCacheGetProjectCacheInfo, buildCacheCleanProject, frameworkCacheCleanCache} = t.context;

	buildCacheGetProjectCacheInfo.resolves({path: BUILD_CACHE_PATH, projectId: "sap.ui.core"});
	buildCacheCleanProject.resolves({path: BUILD_CACHE_PATH, projectId: "sap.ui.core", deletedEntries: 7});

	argv["_"] = ["cache", "clean"];
	argv["project"] = "sap.ui.core";
	argv["force"] = true;
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(graphFromPackageDependencies.callCount, 0, "Does not resolve the project graph for an explicit id");
	t.is(graphFromStaticFile.callCount, 0, "Does not resolve the project graph for an explicit id");
	t.is(buildCacheGetProjectCacheInfo.firstCall.args[1], "sap.ui.core", "Looks up the given project id");
	t.is(buildCacheCleanProject.firstCall.args[1], "sap.ui.core", "Cleans the given project id");
	t.is(frameworkCacheCleanCache.callCount, 0, "Never touches framework cache in project mode");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("sap.ui.core"), "Names the given project");
	t.true(allOutput.includes("7 entries"), "Reports number of removed entries");
	t.true(allOutput.includes("Success:"), "Shows success summary");
});

test.serial("ui5 cache clean --project <id>: nothing to clean for an unknown id", async (t) => {
	const {cache, argv, stderrWriteStub, graphFromPackageDependencies,
		buildCacheGetProjectCacheInfo, buildCacheCleanProject, yesnoStub} = t.context;

	buildCacheGetProjectCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	argv["project"] = "does.not.exist";
	setLogLevel("verbose");
	await cache.handler(argv);

	t.is(graphFromPackageDependencies.callCount, 0, "Does not resolve the project graph for an explicit id");
	t.is(buildCacheGetProjectCacheInfo.firstCall.args[1], "does.not.exist", "Looks up the given project id");
	t.is(yesnoStub.callCount, 0, "Does not prompt when nothing to clean");
	t.is(buildCacheCleanProject.callCount, 0, "Does not clean when nothing to clean");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Nothing to clean"), "Prints nothing to clean");
});

// ─── Inspect (ui5 cache inspect) ─────────────────────────────────────────────

// The inspect sub-commands register their handlers via the builder. Extract a handler by the
// command-name prefix from the (esmocked) command module so its closure uses the mocked imports.
function getCommandHandler(cacheModule, namePrefix) {
	let handler;
	const cliStub = {
		demandCommand: sinon.stub().returnsThis(),
		command: sinon.stub().callsFake((name, _desc, config) => {
			if (name.startsWith(namePrefix)) {
				handler = config.handler;
			}
			return cliStub;
		}),
	};
	cacheModule.builder(cliStub);
	return handler;
}

// "inspect [projectId]": the trailing space avoids also matching "inspect-stage <signature>".
function getInspectHandler(cacheModule) {
	return getCommandHandler(cacheModule, "inspect ");
}

function getStageInspectHandler(cacheModule) {
	return getCommandHandler(cacheModule, "inspect-stage");
}

function inspectEntry(buildSignature, overrides = {}) {
	return {
		buildSignature,
		indexTimestamp: Date.now() - 3600 * 1000,
		tasks: ["minify"],
		availableDependencies: "deps",
		stageEntries: [{stageId: "task/minify", stageSignature: "s"}],
		resultSignatures: ["r"],
		taskEntries: [{taskName: "minify", type: "project"}],
		...overrides,
	};
}

// ── Tree mode ──

test.serial("ui5 cache inspect: resolves via package dependencies with framework resolution", async (t) => {
	const {cache, argv, graphFromPackageDependencies, graphFromStaticFile,
		getProjectBuildSignaturesStub} = t.context;

	argv["_"] = ["cache", "inspect"];
	await getInspectHandler(cache)(argv);

	t.is(graphFromPackageDependencies.callCount, 1, "Resolves graph from package dependencies");
	t.is(graphFromStaticFile.callCount, 0, "Does not use static file resolution");
	t.true(graphFromPackageDependencies.firstCall.args[0].resolveFrameworkDependencies,
		"Resolves framework dependencies for inspect");
	t.is(getProjectBuildSignaturesStub.callCount, 1, "Computes the current build signatures");
});

test.serial("ui5 cache inspect: uses static file when dependency-definition is given", async (t) => {
	const {cache, argv, graphFromStaticFile, graphFromPackageDependencies} = t.context;

	argv["_"] = ["cache", "inspect"];
	argv["dependencyDefinition"] = "/path/to/deps.yaml";
	await getInspectHandler(cache)(argv);

	t.is(graphFromStaticFile.callCount, 1, "Resolves graph from static file");
	t.is(graphFromStaticFile.firstCall.args[0].filePath, "/path/to/deps.yaml", "Passes dependency definition path");
	t.true(graphFromStaticFile.firstCall.args[0].resolveFrameworkDependencies,
		"Resolves framework dependencies for inspect");
	t.is(graphFromPackageDependencies.callCount, 0, "Does not use package dependency resolution");
});

test.serial("ui5 cache inspect --build-mode: maps to the build config for signature computation", async (t) => {
	const {cache, argv, getProjectBuildSignaturesStub} = t.context;

	argv["_"] = ["cache", "inspect"];
	argv["buildMode"] = "jsdoc";
	argv["includeTask"] = ["generateJsdoc"];
	argv["excludeTask"] = ["minify"];
	await getInspectHandler(cache)(argv);

	t.deepEqual(getProjectBuildSignaturesStub.firstCall.args[1], {
		selfContained: false, jsdoc: true, includedTasks: ["generateJsdoc"], excludedTasks: ["minify"],
	}, "jsdoc mode and task filters feed the build config");
});

test.serial("ui5 cache inspect --build-mode self-contained: sets selfContained", async (t) => {
	const {cache, argv, getProjectBuildSignaturesStub} = t.context;

	argv["_"] = ["cache", "inspect"];
	argv["buildMode"] = "self-contained";
	await getInspectHandler(cache)(argv);

	t.true(getProjectBuildSignaturesStub.firstCall.args[1].selfContained);
	t.false(getProjectBuildSignaturesStub.firstCall.args[1].jsdoc);
});

test.serial("ui5 cache inspect: marks the current signature and summarizes the rest", async (t) => {
	const {cache, argv, stdoutWriteStub, getProjectBuildSignaturesStub,
		buildCacheGetProjectsCacheEntries} = t.context;

	getProjectBuildSignaturesStub.resolves(new Map([
		["my.project", "aaaaaaaaaaaa1111"],
		["sap.ui.core", "cccccccccccc3333"],
	]));
	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["my.project", [inspectEntry("aaaaaaaaaaaa1111"), inspectEntry("bbbbbbbbbbbb2222")]],
		["sap.ui.core", []], // current signature not on disk
	]));

	argv["_"] = ["cache", "inspect"];
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("current"), "Marks the current signature");
	t.true(allOutput.includes("aaaaaaaaaaaa"), "Shows the current signature");
	t.true(allOutput.includes("1 other signature on disk"), "Summarizes the stale signature");
	t.false(allOutput.includes("bbbbbbbbbbbb"), "Does not expand stale signatures by default");
	t.true(allOutput.includes("not cached"), "Shows not-cached note when the current signature is absent");
});

test.serial("ui5 cache inspect --all: expands stale signatures", async (t) => {
	const {cache, argv, stdoutWriteStub, getProjectBuildSignaturesStub,
		buildCacheGetProjectsCacheEntries} = t.context;

	getProjectBuildSignaturesStub.resolves(new Map([["my.project", "aaaaaaaaaaaa1111"]]));
	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["my.project", [inspectEntry("aaaaaaaaaaaa1111"), inspectEntry("bbbbbbbbbbbb2222")]],
		["sap.ui.core", []],
	]));

	argv["_"] = ["cache", "inspect"];
	argv["all"] = true;
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("bbbbbbbbbbbb"), "Expands the stale signature with --all");
	t.false(allOutput.includes("other signature on disk"), "Does not summarize when expanded");
});

test.serial("ui5 cache inspect --stale: shows only stale signatures", async (t) => {
	const {cache, argv, stdoutWriteStub, getProjectBuildSignaturesStub,
		buildCacheGetProjectsCacheEntries} = t.context;

	getProjectBuildSignaturesStub.resolves(new Map([["my.project", "aaaaaaaaaaaa1111"]]));
	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["my.project", [inspectEntry("aaaaaaaaaaaa1111"), inspectEntry("bbbbbbbbbbbb2222")]],
		["sap.ui.core", []],
	]));

	argv["_"] = ["cache", "inspect"];
	argv["stale"] = true;
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("bbbbbbbbbbbb"), "Shows the stale signature");
	t.false(allOutput.includes("aaaaaaaaaaaa"), "Does not show the current signature in stale-only mode");
	t.true(allOutput.includes("No stale signatures"), "Notes projects with no stale signatures");
});

test.serial("ui5 cache inspect --sizes: requests sizes from the cache", async (t) => {
	const {cache, argv, buildCacheGetProjectsCacheEntries} = t.context;

	argv["_"] = ["cache", "inspect"];
	argv["sizes"] = true;
	await getInspectHandler(cache)(argv);

	t.deepEqual(buildCacheGetProjectsCacheEntries.firstCall.args[2], {withSizes: true},
		"Passes withSizes through to the cache read");
});

test.serial("ui5 cache inspect --stages: lists contained stage signatures under the current entry", async (t) => {
	const {cache, argv, stdoutWriteStub, getProjectBuildSignaturesStub,
		buildCacheGetProjectsCacheEntries} = t.context;

	getProjectBuildSignaturesStub.resolves(new Map([["my.project", "aaaaaaaaaaaa1111"]]));
	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["my.project", [inspectEntry("aaaaaaaaaaaa1111", {stageEntries: [
			{stageId: "task/minify", stageSignature: "stagesigminify00"},
			{stageId: "source", stageSignature: "stagesigsource00"},
		]})]],
		["sap.ui.core", []],
	]));

	argv["_"] = ["cache", "inspect"];
	argv["stages"] = true;
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("task/minify"), "Lists the stage id");
	t.true(allOutput.includes("stagesigmini"), "Lists the short stage signature (drillable via --stage)");
	t.true(allOutput.includes("source"), "Lists all contained stages");
});

test.serial("ui5 cache inspect: does not list stage signatures without --stages", async (t) => {
	const {cache, argv, stdoutWriteStub, getProjectBuildSignaturesStub,
		buildCacheGetProjectsCacheEntries} = t.context;

	getProjectBuildSignaturesStub.resolves(new Map([["my.project", "aaaaaaaaaaaa1111"]]));
	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["my.project", [inspectEntry("aaaaaaaaaaaa1111", {stageEntries: [
			{stageId: "task/minify", stageSignature: "stagesigminify00"},
		]})]],
		["sap.ui.core", []],
	]));

	argv["_"] = ["cache", "inspect"];
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes("task/minify"), "Stage signatures are hidden by default");
});

test.serial("ui5 cache inspect --json: emits parseable JSON with current/stale split", async (t) => {
	const {cache, argv, stdoutWriteStub, getProjectBuildSignaturesStub,
		buildCacheGetProjectsCacheEntries} = t.context;

	getProjectBuildSignaturesStub.resolves(new Map([["my.project", "aaaaaaaaaaaa1111"]]));
	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["my.project", [inspectEntry("aaaaaaaaaaaa1111")]],
		["sap.ui.core", []],
	]));

	argv["_"] = ["cache", "inspect"];
	argv["json"] = true;
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	const parsed = JSON.parse(allOutput);
	t.is(parsed.ui5DataDir, TEST_UI5_DATA_DIR, "JSON carries the resolved data dir");
	t.is(parsed.projects.length, 2, "JSON lists all projects");
	t.is(parsed.projects[0].current.buildSignature, "aaaaaaaaaaaa1111", "Marks the current entry");
	t.deepEqual(parsed.projects[1].stale, [], "Framework project without entries has no stale entries");
});

// ── Project mode ──

test.serial("ui5 cache inspect <projectId>: lists all signatures without resolving a graph", async (t) => {
	const {cache, argv, stdoutWriteStub, graphFromPackageDependencies, graphFromStaticFile,
		getProjectBuildSignaturesStub, buildCacheGetProjectsCacheEntries} = t.context;

	buildCacheGetProjectsCacheEntries.resolves(new Map([
		["some.project", [inspectEntry("aaaaaaaaaaaa1111"), inspectEntry("bbbbbbbbbbbb2222")]],
	]));

	argv["_"] = ["cache", "inspect"];
	argv["projectId"] = "some.project";
	await getInspectHandler(cache)(argv);

	t.is(graphFromPackageDependencies.callCount, 0, "Does not resolve a graph");
	t.is(graphFromStaticFile.callCount, 0, "Does not resolve a graph");
	t.is(getProjectBuildSignaturesStub.callCount, 0, "Does not compute signatures");
	t.deepEqual(buildCacheGetProjectsCacheEntries.firstCall.args[1], ["some.project"],
		"Queries only the requested project id");

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("some.project"), "Names the project");
	t.true(allOutput.includes("aaaaaaaaaaaa"), "Shows the first signature");
	t.true(allOutput.includes("bbbbbbbbbbbb"), "Shows all signatures");
});

test.serial("ui5 cache inspect <projectId> --json: emits parseable JSON", async (t) => {
	const {cache, argv, stdoutWriteStub, buildCacheGetProjectsCacheEntries} = t.context;

	buildCacheGetProjectsCacheEntries.resolves(new Map([["some.project", [inspectEntry("aaaaaaaaaaaa1111")]]]));

	argv["_"] = ["cache", "inspect"];
	argv["projectId"] = "some.project";
	argv["json"] = true;
	await getInspectHandler(cache)(argv);

	const parsed = JSON.parse(stdoutWriteStub.args.map((a) => a[0]).join(""));
	t.is(parsed.projectId, "some.project");
	t.is(parsed.entries.length, 1);
});

test.serial("ui5 cache inspect <projectId>: empty cache renders no entries", async (t) => {
	const {cache, argv, stdoutWriteStub, buildCacheGetProjectsCacheEntries} = t.context;

	buildCacheGetProjectsCacheEntries.resolves(new Map());

	argv["_"] = ["cache", "inspect"];
	argv["projectId"] = "some.project";
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("No cache entries"), "Renders empty-cache line");
});

test.serial("ui5 cache inspect <projectId> --stages: lists stage signatures per entry", async (t) => {
	const {cache, argv, stdoutWriteStub, buildCacheGetProjectsCacheEntries} = t.context;

	buildCacheGetProjectsCacheEntries.resolves(new Map([["some.project", [
		inspectEntry("aaaaaaaaaaaa1111", {stageEntries: [
			{stageId: "task/minify", stageSignature: "stagesigminify00"},
		]}),
	]]]));

	argv["_"] = ["cache", "inspect"];
	argv["projectId"] = "some.project";
	argv["stages"] = true;
	await getInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("task/minify"), "Lists the stage id under the entry");
	t.true(allOutput.includes("stagesigmini"), "Lists the short stage signature");
});

// ── Stage mode (ui5 cache inspect-stage) ──

test.serial("ui5 cache inspect-stage: renders the cached resources of a stage", async (t) => {
	const {cache, argv, stdoutWriteStub, buildCacheGetStageDetails,
		graphFromPackageDependencies} = t.context;

	buildCacheGetStageDetails.resolves([{
		projectId: "some.project",
		buildSignature: "aaaaaaaaaaaa1111",
		stageId: "task/minify",
		resources: [{path: "/a.js", integrity: "sha256-abc", size: 100, lastModified: 1}],
	}]);

	argv["_"] = ["cache", "inspect-stage"];
	argv["signature"] = "stagesig01234567";
	await getStageInspectHandler(cache)(argv);

	t.is(graphFromPackageDependencies.callCount, 0, "Does not resolve a graph");
	t.is(buildCacheGetStageDetails.firstCall.args[1], "stagesig01234567", "Passes the stage signature");
	t.falsy(buildCacheGetStageDetails.firstCall.args[2].withSizes, "Sizes off by default");

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("task/minify"), "Shows the stage id");
	t.true(allOutput.includes("/a.js"), "Shows the cached resource path");
});

test.serial("ui5 cache inspect-stage: passes a signature prefix through unchanged", async (t) => {
	const {cache, argv, buildCacheGetStageDetails} = t.context;

	buildCacheGetStageDetails.resolves([{
		projectId: "some.project", buildSignature: "bs", stageId: "task/minify", resources: [],
	}]);

	argv["_"] = ["cache", "inspect-stage"];
	argv["signature"] = "26b223c2c5f1";
	await getStageInspectHandler(cache)(argv);

	t.is(buildCacheGetStageDetails.firstCall.args[1], "26b223c2c5f1",
		"Forwards the short prefix; the storage layer resolves it");
});

test.serial("ui5 cache inspect-stage --sizes: requests on-disk sizes", async (t) => {
	const {cache, argv, buildCacheGetStageDetails} = t.context;

	buildCacheGetStageDetails.resolves([]);

	argv["_"] = ["cache", "inspect-stage"];
	argv["signature"] = "stagesig01234567";
	argv["sizes"] = true;
	await getStageInspectHandler(cache)(argv);

	t.true(buildCacheGetStageDetails.firstCall.args[2].withSizes, "Requests sizes from the cache");
});

test.serial("ui5 cache inspect-stage: reports when no stage matches", async (t) => {
	const {cache, argv, stdoutWriteStub, buildCacheGetStageDetails} = t.context;

	buildCacheGetStageDetails.resolves([]);

	argv["_"] = ["cache", "inspect-stage"];
	argv["signature"] = "missing0123456789";
	await getStageInspectHandler(cache)(argv);

	const allOutput = stdoutWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("No cached stage found"), "Reports the miss");
});

test.serial("ui5 cache inspect-stage --json: emits parseable JSON", async (t) => {
	const {cache, argv, stdoutWriteStub, buildCacheGetStageDetails} = t.context;

	buildCacheGetStageDetails.resolves([{
		projectId: "some.project", buildSignature: "bs", stageId: "task/minify", resources: [],
	}]);

	argv["_"] = ["cache", "inspect-stage"];
	argv["signature"] = "stagesig01234567";
	argv["json"] = true;
	await getStageInspectHandler(cache)(argv);

	const parsed = JSON.parse(stdoutWriteStub.args.map((a) => a[0]).join(""));
	t.is(parsed.stageSignature, "stagesig01234567");
	t.is(parsed.stageEntries.length, 1);
});
