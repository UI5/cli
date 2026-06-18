import test from "ava";
import path from "node:path";
import sinon from "sinon";
import esmock from "esmock";
import {rimraf} from "rimraf";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "CacheManager");

test.after.always(async () => {
	// Best-effort cleanup; on Windows, SQLite WAL files may still be locked briefly after close
	await rimraf(TEST_DIR).catch(() => {});
});

test.afterEach.always(() => {
	sinon.restore();
	delete process.env.UI5_DATA_DIR;
});

function getUniqueTestDir() {
	return path.join(TEST_DIR, `cm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// Metadata delegation (round-trip through CacheManager)

test.serial("Index cache: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	process.env.UI5_DATA_DIR = testDir;
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {indexTimestamp: 1234, root: {name: "", hash: "abc"}};
	cm.writeIndexCache("project-x", "build-sig", "source", data);
	const result = cm.readIndexCache("project-x", "build-sig", "source");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Stage cache: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {resourceMetadata: {"/a.js": {integrity: "hash-a"}}};
	cm.writeStageCache("project-x", "build-sig", "task/minify", "stage-sig", data);
	const result = cm.readStageCache("project-x", "build-sig", "task/minify", "stage-sig");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Task metadata: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {requestSetGraph: {nodes: []}};
	cm.writeTaskMetadata("project-x", "build-sig", "minify", "project", data);
	const result = cm.readTaskMetadata("project-x", "build-sig", "minify", "project");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Result metadata: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {stageSignatures: {"task/minify": "sig-abc"}};
	cm.writeResultMetadata("project-x", "build-sig", "result-sig", data);
	const result = cm.readResultMetadata("project-x", "build-sig", "result-sig");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Cache miss returns null for all metadata types", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	t.is(cm.readIndexCache("no-project", "no-sig", "source"), null);
	t.is(cm.readStageCache("no-project", "no-sig", "no-stage", "no-sig"), null);
	t.is(cm.readTaskMetadata("no-project", "no-sig", "no-task", "project"), null);
	t.is(cm.readResultMetadata("no-project", "no-sig", "no-sig"), null);
	cm.close();
});

// CAS delegation

test.serial("Content round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const content = Buffer.from("test content");
	cm.putContent("sha256-test", content);
	t.true(cm.hasContent("sha256-test"));
	t.deepEqual(cm.readContent("sha256-test"), content);
	cm.close();
});

test.serial("hasResourceForStage delegates to content storage", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	t.false(cm.hasResourceForStage("sha256-missing"));
	cm.putContent("sha256-exists", Buffer.from("data"));
	t.true(cm.hasResourceForStage("sha256-exists"));
	cm.close();
});

test.serial("hasResourceForStage throws without integrity", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	t.throws(() => cm.hasResourceForStage(null), {
		message: "Integrity hash must be provided to read from cache"
	});
	cm.close();
});

// Singleton via create()

test.serial("create() returns singleton per cache directory", async (t) => {
	const testDir = getUniqueTestDir();

	const CacheManager = await esmock("../../../../lib/build/cache/CacheManager.js", {
		"../../../../lib/utils/dataDir.js": {
			getDefaultUi5DataDir: sinon.stub().resolves(testDir)
		}
	});

	const cm1 = await CacheManager.create(testDir);
	const cm2 = await CacheManager.create(testDir);
	t.is(cm1, cm2, "Same cache directory returns same instance");
	cm1.close();
	cm2.close();
});

test.serial("readContentRaw returns stored buffer", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const content = Buffer.from("test content for raw read");
	cm.putContent("sha256-raw", content);
	const raw = cm.readContentRaw("sha256-raw");
	t.truthy(raw, "Returns a value");
	cm.close();
});

test.serial("putCompressedContent stores pre-compressed data that readContent decompresses", async (t) => {
	const testDir = getUniqueTestDir();
	const {gzipSync} = await import("node:zlib");
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const content = Buffer.from("compressed content");
	const compressed = gzipSync(content);
	cm.putCompressedContent("sha256-comp", compressed);
	const decompressed = cm.readContent("sha256-comp");
	t.deepEqual(decompressed, content, "readContent returns decompressed content");
	cm.close();
});

test.serial("transaction: commits combined metadata and content writes atomically", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const result = cm.transaction(() => {
		cm.putContent("sha256-batch1", Buffer.from("batch1"));
		cm.putContent("sha256-batch2", Buffer.from("batch2"));
		cm.writeIndexCache("proj-batch", "sig", "source", {data: true});
		return "ok";
	});

	t.is(result, "ok");
	t.true(cm.hasContent("sha256-batch1"));
	t.true(cm.hasContent("sha256-batch2"));
	t.deepEqual(cm.readIndexCache("proj-batch", "sig", "source"), {data: true});
	cm.close();
});

test.serial("transaction: throwing rolls back metadata and content writes", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	t.throws(() => {
		cm.transaction(() => {
			cm.putContent("sha256-rollback", Buffer.from("rollback"));
			cm.writeIndexCache("proj-rollback", "sig", "source", {data: true});
			throw new Error("boom");
		});
	}, {message: "boom"});

	t.false(cm.hasContent("sha256-rollback"), "Content should not exist after rollback");
	t.is(cm.readIndexCache("proj-rollback", "sig", "source"), null,
		"Metadata should not exist after rollback");
	cm.close();
});

test.serial("getCacheInfo: returns null for non-existent cache", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");
	const result = await CacheManager.getCacheInfo(testDir);
	t.is(result, null);
});

test.serial("getCacheInfo: returns null for empty cache", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");
	// Create empty cache
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.close();

	const result = await CacheManager.getCacheInfo(testDir);
	t.is(result, null);
});

test.serial("getCacheInfo: returns info for cache with records", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");
	// Create cache with data
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	await cm.writeIndexCache("proj", "sig", "source", {data: true});
	cm.close();

	const result = await CacheManager.getCacheInfo(testDir);
	t.truthy(result);
	t.true(result.path.includes("buildCache"));
	t.true(result.path.includes("v0_7"));

	t.true(result.size > 0);
});

test.serial("cleanCache: returns null for non-existent cache", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");
	const result = await CacheManager.cleanCache(testDir);
	t.is(result, null);
});

test.serial("cleanCache: returns null for empty cache", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");
	// Create empty cache
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.close();

	const result = await CacheManager.cleanCache(testDir);
	t.is(result, null);
});

test.serial("cleanCache: clears cache and returns result", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");
	// Create cache with data
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	await cm.writeIndexCache("proj", "sig", "source", {data: true});
	cm.putContent("sha256-test", Buffer.from("content"));
	cm.close();

	const result = await CacheManager.cleanCache(testDir);
	t.truthy(result);
	t.true(result.path.includes("buildCache"));
	t.true(result.path.includes("v0_7"));

	t.true(result.size >= 0);

	// Verify cache is empty
	const cm2 = new CacheManager(path.join(testDir, "buildCache"));
	const check = await cm2.readIndexCache("proj", "sig", "source");
	t.is(check, null);
	t.false(cm2.hasContent("sha256-test"));
	cm2.close();
});
