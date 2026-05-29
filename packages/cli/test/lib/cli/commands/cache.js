import test from "ava";
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

	t.context.cleanCacheStub = sinon.stub();
	t.context.getCacheInfoStub = sinon.stub();

	// Mock readline to simulate user confirmation
	const mockRLInterface = {
		question: sinon.stub(),
		close: sinon.stub()
	};
	t.context.readlineCreateInterfaceStub = sinon.stub().returns(mockRLInterface);
	t.context.mockRLInterface = mockRLInterface;

	t.context.cache = await esmock.p("../../../../lib/cli/commands/cache.js", {
		"@ui5/project/config/Configuration": t.context.Configuration,
		"@ui5/project/build/cache/CacheCleanup": {
			cleanCache: t.context.cleanCacheStub,
			getCacheInfo: t.context.getCacheInfoStub,
		},
		"node:readline": {
			createInterface: t.context.readlineCreateInterfaceStub,
		},
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.cache);
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
	t.is(cliStub.example.callCount, 1, "example called once");
});

test.serial("ui5 cache clean: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, cleanCacheStub, getCacheInfoStub} = t.context;

	// Simulate no cache items
	getCacheInfoStub.resolves([]);

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg, "Nothing to clean\n");
	t.is(cleanCacheStub.callCount, 0, "cleanCache should not be called");
});

test.serial("ui5 cache clean: removes entries and reports", async (t) => {
	const {cache, argv, stderrWriteStub, cleanCacheStub, getCacheInfoStub,
		mockRLInterface} = t.context;

	// Simulate existing cache items
	getCacheInfoStub.resolves([
		{path: "framework/", size: 15 * 1024 * 1024, type: "directory"},
		{path: "buildCache/ (database records)", size: 8 * 1024 * 1024, type: "database"},
	]);

	// Mock user confirmation
	mockRLInterface.question.callsFake((question, callback) => {
		callback("y");
	});

	cleanCacheStub.resolves({
		entries: [
			{path: "framework", type: "framework", size: 15 * 1024 * 1024},
			{path: "buildCache", type: "buildCache", size: 8 * 1024 * 1024},
		],
		totalSize: 23 * 1024 * 1024,
		totalCount: 2,
	});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	// Check that confirmation was asked
	t.is(mockRLInterface.question.callCount, 1, "Should ask for confirmation");
	t.true(mockRLInterface.question.firstCall.args[0].includes("continue"),
		"Confirmation question should ask to continue");

	// Check that cleanCache was called
	t.is(cleanCacheStub.callCount, 1, "cleanCache should be called once");

	// Check output
	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("following items from cache will be removed"), "Shows items to be removed");
	t.true(allOutput.includes("2 entries"), "Summary mentions entry count");
	t.true(allOutput.includes("Success"), "Shows success message");
});

test.serial("ui5 cache clean: user cancels", async (t) => {
	const {cache, argv, stderrWriteStub, cleanCacheStub, getCacheInfoStub,
		mockRLInterface} = t.context;

	// Simulate existing cache items
	getCacheInfoStub.resolves([
		{path: "framework/", size: 5 * 1024 * 1024, type: "directory"}
	]);

	// Mock user cancellation
	mockRLInterface.question.callsFake((question, callback) => {
		callback("n");
	});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	// Check that confirmation was asked
	t.is(mockRLInterface.question.callCount, 1, "Should ask for confirmation");

	// Check that cleanCache was NOT called
	t.is(cleanCacheStub.callCount, 0, "cleanCache should not be called when user cancels");

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

test.serial("ui5 cache clean: accepts 'yes' as confirmation", async (t) => {
	const {cache, argv, cleanCacheStub, getCacheInfoStub, mockRLInterface} = t.context;

	getCacheInfoStub.resolves([
		{path: "framework/", size: 1024, type: "directory"}
	]);

	mockRLInterface.question.callsFake((question, callback) => {
		callback("yes");
	});

	cleanCacheStub.resolves({
		entries: [{path: "framework", type: "framework", size: 1024}],
		totalSize: 1024,
		totalCount: 1,
	});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(cleanCacheStub.callCount, 1, "cleanCache should be called with 'yes' confirmation");
});

test.serial("ui5 cache clean: formats byte sizes correctly", async (t) => {
	const {cache, argv, stderrWriteStub, cleanCacheStub, getCacheInfoStub, mockRLInterface} = t.context;

	// Test with small bytes (B), KB, and GB sizes
	getCacheInfoStub.resolves([
		{path: "small", size: 512, type: "directory"}, // < 1024 = B
		{path: "medium", size: 50 * 1024, type: "directory"}, // KB
		{path: "large", size: 2 * 1024 * 1024 * 1024, type: "directory"}, // GB
	]);

	mockRLInterface.question.callsFake((question, callback) => {
		callback("y");
	});

	cleanCacheStub.resolves({
		entries: [
			{path: "small", type: "directory", size: 512},
			{path: "medium", type: "directory", size: 50 * 1024},
			{path: "large", type: "directory", size: 2 * 1024 * 1024 * 1024},
		],
		totalSize: 2 * 1024 * 1024 * 1024 + 50 * 1024 + 512,
		totalCount: 3,
	});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("512 B"), "Shows bytes format");
	t.true(allOutput.includes("50.0 KB"), "Shows KB format");
	t.true(allOutput.includes("2.0 GB"), "Shows GB format");
});

test.serial("ui5 cache clean: uses UI5_DATA_DIR from environment", async (t) => {
	const {cache, argv, getCacheInfoStub} = t.context;
	const originalEnv = process.env.UI5_DATA_DIR;

	try {
		process.env.UI5_DATA_DIR = "/custom/ui5/path";

		getCacheInfoStub.resolves([]);

		argv["_"] = ["cache", "clean"];
		await cache.handler(argv);

		t.is(getCacheInfoStub.callCount, 1, "getCacheInfo called");
		t.true(getCacheInfoStub.firstCall.args[0].ui5DataDir.includes("custom/ui5/path"),
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
	const {cache, argv, getCacheInfoStub, Configuration} = t.context;
	const originalEnv = process.env.UI5_DATA_DIR;

	try {
		delete process.env.UI5_DATA_DIR;

		Configuration.fromFile.resolves(new Configuration({ui5DataDir: "/config/path"}));
		getCacheInfoStub.resolves([]);

		argv["_"] = ["cache", "clean"];
		await cache.handler(argv);

		t.is(getCacheInfoStub.callCount, 1, "getCacheInfo called");
	} finally {
		if (originalEnv) {
			process.env.UI5_DATA_DIR = originalEnv;
		}
	}
});
