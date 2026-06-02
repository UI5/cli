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
	// Import cache module directly for builder test (before beforeEach stubs are created)
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

test.serial("ui5 cache clean: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo} = t.context;

	// Simulate no cache items
	frameworkCacheGetCacheInfo.resolves(null);
	buildCacheGetCacheInfo.resolves(null);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg, "Nothing to clean\n");
	t.is(frameworkCacheCleanCache.callCount, 0, "frameworkCache.cleanCache should not be called");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache should not be called");
});

test.serial("ui5 cache clean: removes entries and reports", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	// Simulate existing cache items
	frameworkCacheGetCacheInfo.resolves({path: "framework/", size: 15 * 1024 * 1024});
	buildCacheGetCacheInfo.resolves({
		path: "buildCache/v0_7 (database records)", size: 8 * 1024 * 1024
	});

	// Mock user confirmation
	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves({path: "framework", size: 15 * 1024 * 1024});
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 8 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	// Check that confirmation was asked
	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");
	t.true(yesnoStub.firstCall.args[0].question.includes("continue"),
		"Confirmation question should ask to continue");

	// Check that cleanCache was called
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache should be called once");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache should be called once");

	// Check output
	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("following items from cache will be removed"), "Shows items to be removed");
	t.true(allOutput.includes("2 entries"), "Summary mentions entry count");
	t.true(allOutput.includes("Success"), "Shows success message");
});

test.serial("ui5 cache clean: user cancels", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	// Simulate existing cache items
	frameworkCacheGetCacheInfo.resolves({path: "framework/", size: 5 * 1024 * 1024});
	buildCacheGetCacheInfo.resolves(null);

	// Mock user cancellation
	yesnoStub.resolves(false);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	// Check that confirmation was asked
	t.is(yesnoStub.callCount, 1, "Should ask for confirmation");

	// Check that cleanup was NOT called
	t.is(frameworkCacheCleanCache.callCount, 0, "frameworkCache.cleanCache should not be called when user cancels");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache should not be called when user cancels");

	// Check output
	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("following items from cache will be removed"), "Shows items to be removed");
	t.true(allOutput.includes("Cancelled"), "Shows cancelled message");
	t.false(allOutput.includes("Success"), "Should not show success message");
});

test.serial("Command definition is correct", (t) => {
	// Import without esmock for structure check
	t.is(t.context.cache.command, "cache");
	t.is(t.context.cache.describe, "Manage UI5 CLI cache");
	t.is(typeof t.context.cache.builder, "function");
	t.is(typeof t.context.cache.handler, "function");
});

test.serial("ui5 cache clean: formats byte sizes correctly", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	// Test with B, KB sizes
	frameworkCacheGetCacheInfo.resolves({path: "small", size: 512});
	buildCacheGetCacheInfo.resolves({path: "medium", size: 50 * 1024});

	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves({path: "small", size: 512});
	buildCacheCleanCache.resolves({path: "medium", size: 50 * 1024});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("512 B"), "Shows bytes format");
	t.true(allOutput.includes("50.0 KB"), "Shows KB format");
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

	frameworkCacheGetCacheInfo.resolves({path: "framework/", size: 10 * 1024 * 1024});
	buildCacheGetCacheInfo.resolves({
		path: "buildCache/v0_7 (database records)", size: 5 * 1024 * 1024
	});

	frameworkCacheCleanCache.resolves({path: "framework", size: 10 * 1024 * 1024});
	buildCacheCleanCache.resolves({path: "buildCache/v0_7", size: 5 * 1024 * 1024});

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	// Confirmation should NOT be asked
	t.is(yesnoStub.callCount, 0, "Should not ask for confirmation with --yes");

	// Cleanup should still proceed
	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache should be called");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache should be called");

	// Check output
	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("following items from cache will be removed"), "Shows items to be removed");
	t.true(allOutput.includes("Success"), "Shows success message");
});

test.serial("ui5 cache clean: single entry with zero size and GB formatting", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, buildCacheGetCacheInfo, yesnoStub} = t.context;

	// Single cache item with size 0 — covers singular "entry", no "freed", and size=0 branches
	frameworkCacheGetCacheInfo.resolves({path: "framework/", size: 0});
	buildCacheGetCacheInfo.resolves(null);

	yesnoStub.resolves(true);

	frameworkCacheCleanCache.resolves({path: "framework", size: 0});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(frameworkCacheCleanCache.callCount, 1, "frameworkCache.cleanCache should be called");
	t.is(buildCacheCleanCache.callCount, 1, "buildCache.cleanCache should be called");

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("1 entry"), "Summary uses singular 'entry'");
	t.false(allOutput.includes("freed"), "Should not show 'freed' for zero-size removal");

	// Reset and test GB formatting
	stderrWriteStub.resetHistory();
	frameworkCacheGetCacheInfo.resetBehavior();
	frameworkCacheCleanCache.resetBehavior();
	buildCacheGetCacheInfo.resetBehavior();
	buildCacheCleanCache.resetBehavior();
	frameworkCacheGetCacheInfo.resolves({path: "large", size: 2.5 * 1024 * 1024 * 1024});
	buildCacheGetCacheInfo.resolves(null);
	frameworkCacheCleanCache.resolves({path: "large", size: 2.5 * 1024 * 1024 * 1024});

	argv["yes"] = true;
	await cache.handler(argv);

	const gbOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(gbOutput.includes("2.5 GB"), "Shows GB format");
});

test.serial("ui5 cache clean: aborts when framework cache is locked", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache, frameworkCacheGetCacheInfo,
		buildCacheCleanCache, frameworkCacheIsFrameworkLocked} = t.context;

	// Simulate active lock
	frameworkCacheIsFrameworkLocked.resolves(true);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Error:"), "Shows Error (not Warning)");
	t.true(allOutput.includes("currently locked by an active operation"), "Shows lock conflict message");
	t.false(allOutput.includes("Success"), "Does not show success message");

	// Neither getCacheInfo nor cleanCache should be called after a lock abort
	t.is(frameworkCacheGetCacheInfo.callCount, 0, "getCacheInfo should not be called when locked");
	t.is(frameworkCacheCleanCache.callCount, 0, "cleanCache should not be called when locked");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache should not be called when locked");
	t.is(process.exitCode, 1, "Exit code should be 1");
});

test.serial("ui5 cache clean --yes: also aborts when framework cache is locked", async (t) => {
	const {cache, argv, stderrWriteStub, frameworkCacheCleanCache,
		buildCacheCleanCache, frameworkCacheIsFrameworkLocked} = t.context;

	// Simulate active lock — --yes must NOT bypass the lock check
	frameworkCacheIsFrameworkLocked.resolves(true);

	argv["_"] = ["cache", "clean"];
	argv["yes"] = true;
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("Error:"), "Shows Error even with --yes");
	t.false(allOutput.includes("Success"), "Does not show success message");
	t.is(frameworkCacheCleanCache.callCount, 0, "cleanCache should not be called when locked");
	t.is(buildCacheCleanCache.callCount, 0, "buildCache.cleanCache should not be called when locked");
	t.is(process.exitCode, 1, "Exit code should be 1");
});
