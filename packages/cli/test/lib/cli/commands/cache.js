import test from "ava";
import path from "node:path";
import os from "node:os";
import sinon from "sinon";
import esmock from "esmock";

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

// Stable absolute path used as the resolved ui5DataDir in most tests
const TEST_UI5_DATA_DIR = path.resolve("test-ui5-home");

// Typical framework stub result shape: { path, libraryCount, versionCount }
const FRAMEWORK_STUB = {path: "framework", libraryCount: 18, versionCount: 5};

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");

	// Prevent real env var from leaking into tests
	delete process.env.UI5_DATA_DIR;

	t.context.configurationGetUi5DataDirStub = sinon.stub().returns(TEST_UI5_DATA_DIR);
	t.context.configurationFromFileStub = sinon.stub().resolves({
		getUi5DataDir: t.context.configurationGetUi5DataDirStub,
	});

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
		"@ui5/project/config/Configuration": {
			default: {
				fromFile: t.context.configurationFromFileStub,
			},
		},
		"@ui5/project/ui5Framework/cache": {
			default: class {
				static getCacheInfo = t.context.frameworkCacheGetCacheInfo;
				static cleanCache = t.context.frameworkCacheCleanCache;
				static cleanAdditional = t.context.frameworkCacheCleanAdditional;
				static getAdditionalCacheInfo = t.context.frameworkCacheGetAdditionalCacheInfo;
			}
		},
		"@ui5/project/build/cache/CacheManager": {
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
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.cache);
	process.exitCode = undefined;
	delete process.env.UI5_DATA_DIR;
});

// ─── Command structure ──────────────────────────────────────────────────────

test("Command builder", async (t) => {
	const cacheModule = await import("../../../../lib/cli/commands/cache.js");
	const yargsStub = {
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
	t.is(yargsStub.option.callCount, 1, "option called for --yes flag");
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

test.serial("ui5 cache clean: uses resolved path from configuration", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		stderrWriteStub, configurationFromFileStub, configurationGetUi5DataDirStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(configurationFromFileStub.callCount, 1, "Configuration.fromFile called exactly once");
	t.is(configurationGetUi5DataDirStub.callCount, 1, "Configuration#getUi5DataDir called exactly once");

	t.is(frameworkCacheGetCacheInfo.firstCall.args[0], TEST_UI5_DATA_DIR,
		"getCacheInfo receives the path returned by configuration");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(TEST_UI5_DATA_DIR), "Resolved ui5DataDir shown in checking line");
});

test.serial("ui5 cache clean: prefers UI5_DATA_DIR env var over configuration", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		configurationFromFileStub} = t.context;

	const envUi5DataDir = path.resolve("env-ui5-home");
	process.env.UI5_DATA_DIR = envUi5DataDir;
	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(configurationFromFileStub.callCount, 0,
		"Configuration.fromFile must not be called when UI5_DATA_DIR is set");
	t.is(frameworkCacheGetCacheInfo.firstCall.args[0], envUi5DataDir,
		"getCacheInfo receives value from UI5_DATA_DIR");
});

test.serial("ui5 cache clean: falls back to ~/.ui5 when configuration has no value", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		stderrWriteStub, configurationGetUi5DataDirStub} = t.context;

	const fallbackUi5DataDir = path.join(os.homedir(), ".ui5");
	configurationGetUi5DataDirStub.returns(undefined);
	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(frameworkCacheGetCacheInfo.firstCall.args[0], fallbackUi5DataDir,
		"getCacheInfo receives default ~/.ui5 path when no configured value exists");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(fallbackUi5DataDir), "Fallback ui5DataDir shown in checking line");
});

// ─── Basic flow ─────────────────────────────────────────────────────────────

test.serial("ui5 cache clean: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Checking cache at"), "Prints checking line");
	t.true(allOutput.includes("Nothing to clean"), "Prints nothing to clean");
	t.is(frameworkCacheCleanCache.callCount, 0, "frameworkCache.cleanCache not called");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache not called");
});

test.serial("ui5 cache clean: removes both entries and reports", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 8 * 1024 * 1024});

	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 7 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache called once");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache called once");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Checking cache at"), "Prints checking line");
	t.true(allOutput.includes(TEST_UI5_DATA_DIR), "Shows resolved ui5DataDir");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, "framework")), "Shows absolute framework path");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, "buildCache/v0_7")), "Shows absolute build path");
	t.true(allOutput.includes("5 versions of 18 libraries"), "Shows library stats format");
	t.true(allOutput.includes("8.0 MB"), "Shows pre-clean build cache size");
	t.false(allOutput.includes("7.0 MB"), "Does not show VACUUM-freed size");
	t.true(allOutput.includes("Cleaned UI5 Framework packages and Build cache (Db)"),
		"Shows success summary");
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
	t.true(allOutput.includes("Cancelled"), "Shows cancelled message");
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
	await cache.handler(argv);

	let allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("5 versions of 18 libraries"), "Shows plural format");
	t.false(allOutput.includes("Build cache (Db)"), "Does not mention build cache");

	// Singular
	stderrWriteStub.resetHistory();
	const singleStub = {path: "framework", libraryCount: 1, versionCount: 1};
	frameworkCacheGetCacheInfo.resetBehavior();
	frameworkCacheCleanCache.resetBehavior();
	frameworkCacheGetCacheInfo.resolves(singleStub);
	frameworkCacheCleanCache.resolves(singleStub);

	argv["yes"] = true;
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
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("1,189 versions of 155 libraries"),
		"Shows thousands separator for large counts");
});

test.serial("ui5 cache clean: build only", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 50 * 1024});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 50 * 1024});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes("UI5 Framework packages"), "Does not mention framework");
	t.true(allOutput.includes("50.0 KB"), "Shows build cache size");
	t.true(allOutput.includes("Cleaned Build cache (Db)"), "Success mentions build cache only");
});

test.serial("ui5 cache clean: formats byte sizes correctly (< 1 KB)", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 500});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 500});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("500 B"), "Shows bytes format for size < 1 KB");
});

test.serial("ui5 cache clean: formats KB sizes correctly", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 50 * 1024});
	yesnoStub.resolves(true);
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 50 * 1024});

	argv["_"] = ["cache", "clean"];
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
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("2.5 GB"), "Shows GB format");
});

test.serial("ui5 cache clean --yes: skips confirmation prompt", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(FRAMEWORK_STUB);
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 5 * 1024 * 1024});
	frameworkCacheCleanCache.resolves(FRAMEWORK_STUB);
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 5 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 0, "Should not ask for confirmation with --yes");
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache called");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache called");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Success"), "Shows success message");
});

test.serial("ui5 cache clean: shows orphaned framework data in pre-confirmation summary", async (t) => {
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
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Orphaned UI5 Framework packages"), "Shows orphaned header in pre-confirm summary");
	t.true(allOutput.includes("_framework_to_delete_abcd"), "Shows orphaned dir path indented");
	t.true(allOutput.includes("2 versions of 5 libraries"), "Shows orphaned dir stats");
});

test.serial("ui5 cache clean: shows orphaned framework data in post-clean summary", async (t) => {
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
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Removed Orphaned UI5 Framework packages"), "Shows orphaned header in result");
	t.true(allOutput.includes("_framework_to_delete_ab12"), "Shows first orphaned dir path indented");
	t.true(allOutput.includes("_framework_to_delete_cd34"), "Shows second orphaned dir path indented");
});

test.serial("ui5 cache clean: shows orphaned-only success summary when no active framework", async (t) => {
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
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Orphaned UI5 Framework packages"), "Shows orphaned header");
	t.true(allOutput.includes("Cleaned Orphaned UI5 Framework packages"), "Success summary mentions orphaned label");
	t.false(allOutput.includes("Removed UI5 Framework packages"), "Does not show main framework removed line when absent");
});

test.serial("ui5 cache clean: shows orphaned build cache in pre-confirm and post-clean summary", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheCleanCache, buildCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	buildCacheGetAdditionalCacheInfo.resolves([
		{path: "buildCache/v0_7", size: 40 * 1024 * 1024},
	]);
	buildCacheCleanCache.resolves(null);
	buildCacheCleanAdditional.resolves([
		{path: "buildCache/v0_7", size: 40 * 1024 * 1024},
	]);

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Orphaned build cache (Db)"), "Shows orphaned build cache header");
	t.true(allOutput.includes(path.join(TEST_UI5_DATA_DIR, "buildCache/v0_7")),
		"Shows orphaned build cache path indented");
	t.true(allOutput.includes("Removed Orphaned build cache (Db)"), "Post-clean result shows orphaned build label");
	t.true(allOutput.includes("freed 40.0 MB"), "Shows freed size in post-clean result");
	t.true(allOutput.includes("Cleaned Orphaned build cache (Db)"), "Success summary mentions orphaned build cache");
});

test.serial("ui5 cache clean: build cache and orphaned build cache with size 0 omit size detail", async (t) => {
	const {cache, argv, stderrWriteStub, buildCacheGetAdditionalCacheInfo,
		buildCacheCleanCache, buildCacheCleanAdditional, buildCacheGetCacheInfo} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 0});
	buildCacheGetAdditionalCacheInfo.resolves([
		{path: "buildCache/v0_7", size: 0},
	]);
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 0});
	buildCacheCleanAdditional.resolves([
		{path: "buildCache/v0_7", size: 0},
	]);

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.false(allOutput.includes("0 B"), "Does not show zero size");
	t.true(allOutput.includes("Removed Build cache (Db)"), "Shows build cache result line");
	t.true(allOutput.includes("Removed Orphaned build cache (Db)"), "Shows orphaned build cache result line");
	t.false(allOutput.includes("freed"), "Does not show freed label when size is 0");
});
