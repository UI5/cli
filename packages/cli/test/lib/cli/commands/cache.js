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

	t.context.cache = await esmock.p("../../../../lib/cli/commands/cache.js", {
		"@ui5/project/config/Configuration": t.context.Configuration,
		"@ui5/project/build/cache/CacheCleanup": {
			cleanCache: t.context.cleanCacheStub,
		},
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.cache);
});

test.serial("ui5 cache clean: nothing to clean", async (t) => {
	const {cache, argv, stderrWriteStub, cleanCacheStub} = t.context;

	cleanCacheStub.resolves({entries: [], totalSize: 0, totalCount: 0});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg, "Nothing to clean\n");
});

test.serial("ui5 cache clean: removes entries and reports", async (t) => {
	const {cache, argv, stderrWriteStub, cleanCacheStub} = t.context;

	cleanCacheStub.resolves({
		entries: [
			{path: "@openui5/sap.ui.core/1.120.0", type: "framework", size: 15 * 1024 * 1024},
			{path: "@openui5/sap.m/1.120.0", type: "framework", size: 8 * 1024 * 1024},
		],
		totalSize: 23 * 1024 * 1024,
		totalCount: 2,
	});

	argv["_"] = ["cache", "clean"];
	await cache.handler(argv);

	// Should have 4 writes: 2 entries + 1 newline + summary
	t.true(stderrWriteStub.callCount >= 3, "Multiple lines written to stderr");
	// Check that summary mentions entries count
	const allOutput = stderrWriteStub.args.map((a) => a[0]).join("");
	t.true(allOutput.includes("2 entries"), "Summary mentions entry count");
	t.true(allOutput.includes("23.0 MB"), "Summary mentions freed size");
});

test("Command definition is correct", (t) => {
	// Import without esmock for structure check
	t.is(t.context.cache.command, "cache");
	t.is(t.context.cache.describe, "Manage UI5 CLI cache");
	t.is(typeof t.context.cache.builder, "function");
	t.is(typeof t.context.cache.handler, "function");
});
