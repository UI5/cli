import test from "ava";
import path from "node:path";
import sinon from "sinon";
import esmock from "esmock";
import Configuration from "@ui5/project/config/Configuration";

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

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");

	t.context.Configuration = Configuration;
	sinon.stub(Configuration, "fromFile").resolves(new Configuration({}));

	t.context.frameworkCacheGetCacheInfo = sinon.stub();
	t.context.frameworkCacheCleanCache = sinon.stub();
	t.context.frameworkCacheIsFrameworkLocked = sinon.stub().resolves(false);
	t.context.buildCacheGetCacheInfo = sinon.stub();
	t.context.buildCacheCleanCache = sinon.stub();

	// Mock yesno to simulate user confirmation
	t.context.yesnoStub = sinon.stub();

	t.context.cache = await esmock.p("../../../../lib/cli/commands/cache.js", {
		"@ui5/project/config/Configuration": t.context.Configuration,
		"@ui5/project/ui5Framework/cache": {
			getCacheInfo: t.context.frameworkCacheGetCacheInfo,
			cleanCache: t.context.frameworkCacheCleanCache,
			isFrameworkLocked: t.context.frameworkCacheIsFrameworkLocked,
		},
		"@ui5/project/build/cache/CacheManager": {
			default: class {
				static getCacheInfo = t.context.buildCacheGetCacheInfo;
				static cleanCache = t.context.buildCacheCleanCache;
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
	// Reset exit code — some tests verify that the handler sets process.exitCode = 1
	process.exitCode = undefined;
});

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
	t.is(cliStub.example.callCount, 2, "example called twice");
});

test.serial("Command definition is correct", (t) => {
	t.is(t.context.cache.command, "cache");
	t.is(t.context.cache.describe, "Manage UI5 CLI cache");
	t.is(typeof t.context.cache.builder, "function");
	t.is(typeof t.context.cache.handler, "function");
});

test.serial("ui5 cache clean: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg, "Nothing to clean\n");
	t.is(frameworkCacheCleanCache.callCount, 0, "frameworkCache.cleanCache should not be called");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache should not be called");
});

test.serial("ui5 cache clean: removes both entries and reports", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves({path: "framework/", count: 340});
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 8 * 1024 * 1024});

	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves({path: "framework", count: 340});
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 8 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache should be called once");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache should be called once");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	// Pre-clean listing
	t.true(allOutput.includes("UI5 Framework packages"), "Shows framework label");
	t.true(allOutput.includes("Build cache (DB)"), "Shows build cache label");
	t.true(allOutput.includes("framework/"), "Shows framework path");
	t.true(allOutput.includes("buildCache/v0_7"), "Shows build cache path");
	t.true(allOutput.includes("340 files"), "Shows framework file count");
	t.true(allOutput.includes("8.0 MB"), "Shows build cache size");
	t.false(allOutput.includes("Total:"), "Does not show total line");
	// Post-clean output
	t.true(allOutput.includes("Removed UI5 Framework packages"), "Shows framework removed line");
	t.true(allOutput.includes("Removed Build cache (DB)"), "Shows build cache removed line");
	// Success line
	t.true(allOutput.includes("Cleaned UI5 Framework packages and Build cache (DB)"), "Shows success summary");
});

test.serial("ui5 cache clean: user cancels", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves({path: "framework/", count: 10});
	buildCacheGetCacheInfo.resolves(null);

	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");
	t.is(frameworkCacheCleanCache.callCount, 0, "frameworkCache.cleanCache should not be called when user cancels");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache should not be called when user cancels");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Cancelled"), "Shows cancelled message");
	t.false(allOutput.includes("Success"), "Should not show success message");
});

test.serial("ui5 cache clean: framework only", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves({path: "framework/", count: 1});
	buildCacheGetCacheInfo.resolves(null);

	yesnoStub.resolves(true);
	frameworkCacheCleanCache.resolves({path: "framework", count: 1});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("1 file"), "Uses singular 'file'");
	t.false(allOutput.includes("Build cache (DB)"), "Does not mention build cache");
	t.true(allOutput.includes("Cleaned UI5 Framework packages"), "Success mentions framework only");
	t.false(allOutput.includes("and Build"), "Success does not mention build cache");
});

test.serial("ui5 cache clean: build only", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
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

test.serial("ui5 cache clean: formats byte sizes correctly", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves(null);
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

test.serial("ui5 cache clean: uses UI5_DATA_DIR from environment", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo} = t.context;
	const originalEnv = process.env.UI5_DATA_DIR;

	try {
		process.env.UI5_DATA_DIR = "/custom/ui5/path";

		frameworkCacheGetCacheInfo.resolves(null);
		buildCacheGetCacheInfo.resolves(null);

		argv["_"] = ["cache", "clean"];
		await cache.handler(argv);

		t.is(frameworkCacheGetCacheInfo.callCount, 1, "frameworkCache.getCacheInfo called");
		t.true(frameworkCacheGetCacheInfo.firstCall.args[0].includes(path.join("custom", "ui5", "path")),
			"Uses environment variable path");
	} finally {
		if (originalEnv) {
			process.env.UI5_DATA_DIR = originalEnv;
		} else {
			delete process.env.UI5_DATA_DIR;
		}
	}
});

test.serial("ui5 cache clean: uses config.getUi5DataDir when no env var", async (t) => {
	const {cache, argv, frameworkCacheGetCacheInfo, buildCacheGetCacheInfo, Configuration} = t.context;
	const originalEnv = process.env.UI5_DATA_DIR;

	try {
		delete process.env.UI5_DATA_DIR;

		Configuration.fromFile.resolves(new Configuration({ui5DataDir: "/config/path"}));
		frameworkCacheGetCacheInfo.resolves(null);
		buildCacheGetCacheInfo.resolves(null);

		argv["_"] = ["cache", "clean"];
		await cache.handler(argv);

		t.is(frameworkCacheGetCacheInfo.callCount, 1, "frameworkCache.getCacheInfo called");
	} finally {
		if (originalEnv) {
			process.env.UI5_DATA_DIR = originalEnv;
		}
	}
});

test.serial("ui5 cache clean --yes: skips confirmation prompt", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	frameworkCacheGetCacheInfo.resolves({path: "framework/", count: 100});
	buildCacheGetCacheInfo.resolves({path: "buildCache/v0_7", size: 5 * 1024 * 1024});

	frameworkCacheCleanCache.resolves({path: "framework", count: 100});
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 5 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	t.is(yesnoStub.callCount, 0, "Should not ask for confirmation with --yes");
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache should be called");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache should be called");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Success"), "Shows success message");
});

test.serial("ui5 cache clean: aborts when framework cache is locked", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, frameworkCacheIsFrameworkLocked} = t.context;

	frameworkCacheIsFrameworkLocked.resolves(true);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Error:"), "Shows Error");
	t.true(allOutput.includes("currently locked by an active operation"), "Shows lock message");
	t.false(allOutput.includes("Success"), "Does not show success");

	t.is(frameworkCacheGetCacheInfo.callCount, 0, "getCacheInfo not called when locked");
	t.is(frameworkCacheCleanCache.callCount, 0, "cleanCache not called when locked");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache not called when locked");
	t.is(process.exitCode, 1, "Exit code should be 1");
});

test.serial("ui5 cache clean --yes: also aborts when framework cache is locked", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache,
		buildCacheCleanCache, frameworkCacheIsFrameworkLocked} = t.context;

	frameworkCacheIsFrameworkLocked.resolves(true);

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Error:"), "Shows Error even with --yes");
	t.false(allOutput.includes("Success"), "Does not show success");
	t.is(frameworkCacheCleanCache.callCount, 0, "cleanCache not called when locked");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache not called when locked");
	t.is(process.exitCode, 1, "Exit code should be 1");
});
