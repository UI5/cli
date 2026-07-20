import test from "ava";
import path from "node:path";
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

	t.context.resolveUi5DataDirStub = sinon.stub().resolves(TEST_UI5_DATA_DIR);

	t.context.frameworkCacheGetCacheInfo = sinon.stub();
	t.context.frameworkCacheCleanCache = sinon.stub();
	t.context.frameworkCacheCleanAdditional = sinon.stub().resolves([]);
	t.context.frameworkCacheGetOrphanedInfo = sinon.stub().resolves([]);
	t.context.buildCacheGetCacheInfo = sinon.stub();
	t.context.buildCacheCleanCache = sinon.stub();

	t.context.yesnoStub = sinon.stub();

	t.context.cache = await esmock.p("../../../../lib/cli/commands/cache.js", {
		"@ui5/project/utils/dataDir": {
			resolveUi5DataDir: t.context.resolveUi5DataDirStub,
		},
		"@ui5/project/ui5Framework/cache": {
			getCacheInfo: t.context.frameworkCacheGetCacheInfo,
			cleanCache: t.context.frameworkCacheCleanCache,
			cleanAdditional: t.context.frameworkCacheCleanAdditional,
			getOrphanedInfo: t.context.frameworkCacheGetOrphanedInfo,
		},
		"@ui5/project/build/cache/CacheManager": {
			default: class {
				static getCacheInfo = t.context.buildCacheGetCacheInfo;
				static cleanCache = t.context.buildCacheCleanCache;
				static cleanAdditional = sinon.stub().resolves([]);
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
	const cliStub = {
		demandCommand: sinon.stub().returnsThis(),
		command: sinon.stub().returnsThis(),
		example: sinon.stub().returnsThis(),
	};
	const result = cacheModule.default.builder(cliStub);
	t.is(result, cliStub, "Builder returns cli instance");
	t.is(cliStub.demandCommand.callCount, 1, "demandCommand called once");
	t.is(cliStub.command.callCount, 1, "command called once");
	t.is(cliStub.example.callCount, 0, "example not called on parent command");
});

test.serial("Command definition is correct", (t) => {
	t.is(t.context.cache.command, "cache");
	t.is(t.context.cache.describe,
		"Manage the UI5 CLI cache (downloaded framework packages and build data)");
	t.is(typeof t.context.cache.builder, "function");
	t.is(typeof t.context.cache.handler, "function");
});

// ─── ui5DataDir resolution ──────────────────────────────────────────────────

test.serial("ui5 cache clean: uses resolved path from resolveUi5DataDir", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo,
		stderrWriteStub, resolveUi5DataDirStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(resolveUi5DataDirStub.callCount, 1, "resolveUi5DataDir called exactly once");
	t.deepEqual(resolveUi5DataDirStub.getCall(0).args, [],
		"resolveUi5DataDir called with no arguments");

	t.is(frameworkCacheGetCacheInfo.firstCall.args[0], TEST_UI5_DATA_DIR,
		"getCacheInfo receives the path returned by resolveUi5DataDir");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes(TEST_UI5_DATA_DIR), "Resolved ui5DataDir shown in checking line");
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
	t.true(allOutput.includes("Cleaned UI5 Framework packages and Build cache (DB)"),
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
	t.false(allOutput.includes("Build cache (DB)"), "Does not mention build cache");

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
	t.true(allOutput.includes("Cleaned Build cache (DB)"), "Success mentions build cache only");
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
		frameworkCacheCleanCache, frameworkCacheGetOrphanedInfo} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetOrphanedInfo.resolves([
		{path: ".framework_to_delete_abcd", libraryCount: 5, versionCount: 2},
	]);
	frameworkCacheCleanCache.resolves(null);

	yesnoStub.resolves(true);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Orphaned framework data"), "Shows orphaned section in pre-confirm summary");
	t.true(allOutput.includes("incomplete previous clean"), "Shows orphaned context message");
	t.true(allOutput.includes("1 directory"), "Shows singular 'directory' for one orphan");
	t.true(allOutput.includes(".framework_to_delete_abcd"), "Shows orphaned dir path");
	t.true(allOutput.includes("2 versions of 5 libraries"), "Shows orphaned dir stats");
});

test.serial("ui5 cache clean: shows orphaned framework data in post-clean summary", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheGetOrphanedInfo,
		frameworkCacheCleanCache, frameworkCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves({path: "framework", libraryCount: 3, versionCount: 1});
	t.context.buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetOrphanedInfo.resolves([
		{path: ".framework_to_delete_ab12", libraryCount: 3, versionCount: 1},
		{path: ".framework_to_delete_cd34", libraryCount: 3, versionCount: 1},
	]);
	frameworkCacheCleanCache.resolves({path: "framework", libraryCount: 3, versionCount: 1});
	frameworkCacheCleanAdditional.resolves([
		{path: ".framework_to_delete_ab12", libraryCount: 3, versionCount: 1},
		{path: ".framework_to_delete_cd34", libraryCount: 3, versionCount: 1},
	]);

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Removed Orphaned framework data"), "Shows orphaned section in result");
	t.true(allOutput.includes("2 directories"), "Shows plural 'directories' for multiple orphans");
	t.true(allOutput.includes(".framework_to_delete_ab12"), "Shows first orphaned dir path");
	t.true(allOutput.includes(".framework_to_delete_cd34"), "Shows second orphaned dir path");
});

test.serial("ui5 cache clean: shows orphaned-only success summary when no active framework", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheGetOrphanedInfo,
		frameworkCacheCleanCache, frameworkCacheCleanAdditional} = t.context;

	t.context.frameworkCacheGetCacheInfo.resolves(null);
	t.context.buildCacheGetCacheInfo.resolves(null);
	frameworkCacheGetOrphanedInfo.resolves([
		{path: ".framework_to_delete_zz99", libraryCount: 10, versionCount: 3},
	]);
	frameworkCacheCleanCache.resolves(null);
	frameworkCacheCleanAdditional.resolves([
		{path: ".framework_to_delete_zz99", libraryCount: 10, versionCount: 3},
	]);

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Orphaned framework data"), "Shows orphaned section");
	t.true(allOutput.includes("Cleaned Orphaned framework data"), "Success summary mentions orphaned data");
	t.false(allOutput.includes("UI5 Framework packages"), "Does not mention main framework when absent");
});
