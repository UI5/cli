import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
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
	cm.writeStageRequestMetadata("project-x", "build-sig", "minify", "project", data);
	const result = cm.readStageRequestMetadata("project-x", "build-sig", "minify", "project");
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
	t.is(cm.readStageRequestMetadata("no-project", "no-sig", "no-task", "project"), null);
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
	process.env.UI5_DATA_DIR = testDir;

	const CacheManager = await esmock("../../../../lib/build/cache/CacheManager.js", {
		"../../../../lib/config/Configuration.js": {
			default: {
				fromFile: sinon.stub().resolves({getUi5DataDir: () => null})
			}
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

// Static cleanup/info helpers

test.serial("getCacheInfo: Returns null when cache db is not available", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;

	const info = await CacheManager.getCacheInfo(testDir);
	t.is(info, null);
});

test.serial("getCacheInfo: Returns null when cache has no records", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.close();

	const info = await CacheManager.getCacheInfo(testDir);
	t.is(info, null);
});

test.serial("getCacheInfo: Returns cache info when records exist", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.writeIndexCache("project-x", "build-sig", "source", {value: 1});
	cm.close();

	const info = await CacheManager.getCacheInfo(testDir);
	t.truthy(info);
	t.true(Number.isInteger(info.size));
	t.true(info.size > 0);
});

test.serial("cleanCache: Clears records and returns removal result", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.writeIndexCache("project-x", "build-sig", "source", {value: 1});
	cm.putContent("sha256-clean", Buffer.from("content"));
	cm.close();

	const result = await CacheManager.cleanCache(testDir);
	t.truthy(result);
	t.true(Number.isInteger(result.size));
	t.true(result.size >= 0);

	const infoAfterClean = await CacheManager.getCacheInfo(testDir);
	t.is(infoAfterClean, null, "getCacheInfo returns null for empty fresh tables after cleanCache");

	const additionalInfo = await CacheManager.getAdditionalCacheInfo(testDir);
	t.is(additionalInfo.length, 1, "vacuum pending reported as additional info");
	t.true(additionalInfo[0].size > 0);
});

test.serial("cleanCache: returns null when no records exist", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.close();

	const result = await CacheManager.cleanCache(testDir);
	t.is(result, null);
});

test.serial("cleanCache: returns null when db does not exist", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;

	const result = await CacheManager.cleanCache(testDir);
	t.is(result, null);
});

test.serial("getAdditionalCacheInfo: returns empty array when no stale tables", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.writeIndexCache("p", "sig", "source", {v: 1});
	cm.close();

	const info = await CacheManager.getAdditionalCacheInfo(testDir);
	t.deepEqual(info, []);
});

test.serial("getAdditionalCacheInfo: returns empty array when db does not exist", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;

	const info = await CacheManager.getAdditionalCacheInfo(testDir);
	t.deepEqual(info, []);
});

test.serial("getAdditionalCacheInfo: reports stale tables after cleanCache", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.writeIndexCache("p", "sig", "source", {v: 1});
	cm.close();

	await CacheManager.cleanCache(testDir);

	const info = await CacheManager.getAdditionalCacheInfo(testDir);
	t.is(info.length, 1);
	t.true(info[0].size > 0);
	t.truthy(info[0].path);
});

test.serial("cleanAdditional: returns empty array when no stale tables", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.writeIndexCache("p", "sig", "source", {v: 1});
	cm.close();

	const result = await CacheManager.cleanAdditional(testDir);
	t.deepEqual(result, []);
});

test.serial("cleanAdditional: returns empty array when db does not exist", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;

	const result = await CacheManager.cleanAdditional(testDir);
	t.deepEqual(result, []);
});

test.serial("cleanAdditional: drops stale tables, returns freed size, leaves nothing pending", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));
	cm.writeIndexCache("p", "sig", "source", {v: 1});
	cm.putContent("sha256-cleanup", Buffer.alloc(64 * 1024, "z"));
	cm.close();

	await CacheManager.cleanCache(testDir);

	const result = await CacheManager.cleanAdditional(testDir);
	t.is(result.length, 1);
	t.true(result[0].size >= 0);
	t.truthy(result[0].path);

	const remainingAdditional = await CacheManager.getAdditionalCacheInfo(testDir);
	t.deepEqual(remainingAdditional, [], "no stale tables remain after cleanAdditional");
});

// ─── getOlderVersionsInfo / markOlderVersionsForRemoval / removePendingVersions ──

test.serial("getOlderVersionsInfo: returns empty when buildCache dir does not exist", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");

	const result = await CacheManager.getOlderVersionsInfo(testDir);
	t.deepEqual(result, {removable: [], unknown: []});
});

test.serial("getOlderVersionsInfo: returns empty when buildCache has no versioned dirs", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");

	// Only malformed names and non-dirs — nothing matches ^v(\d+)_(\d+)$
	const buildCacheDir = path.join(testDir, "buildCache");
	await fs.mkdir(path.join(buildCacheDir, "not-a-version"), {recursive: true});
	await fs.writeFile(path.join(buildCacheDir, "file.txt"), "data");

	const result = await CacheManager.getOlderVersionsInfo(testDir);
	t.deepEqual(result, {removable: [], unknown: []});
});

test.serial("getOlderVersionsInfo: partitions known-older, unshipped, current, and unknown correctly", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	// Known-older (in KNOWN_DELETABLE_VERSIONS): v0_9
	await fs.mkdir(path.join(buildCacheDir, "v0_9"), {recursive: true});
	await fs.writeFile(path.join(buildCacheDir, "v0_9", "cache.db"), Buffer.alloc(2048));
	// Unshipped-older (NOT in KNOWN_DELETABLE_VERSIONS): v0_8 → must go to unknown, not removable
	await fs.mkdir(path.join(buildCacheDir, "v0_8"), {recursive: true});
	await fs.writeFile(path.join(buildCacheDir, "v0_8", "cache.db"), Buffer.alloc(1024));
	// Current: should be ignored
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});
	// Unknown (genuinely newer or unrecognized): v0_11
	await fs.mkdir(path.join(buildCacheDir, "v0_11"), {recursive: true});
	// Malformed and file: should be ignored (foreign bucket)
	await fs.mkdir(path.join(buildCacheDir, "not-a-version"), {recursive: true});
	await fs.writeFile(path.join(buildCacheDir, "file.txt"), "data");

	const result = await CacheManager.getOlderVersionsInfo(testDir);

	t.is(result.removable.length, 1, "only v0_9 (in KNOWN) is removable");
	t.is(result.removable[0].name, "v0_9");
	t.is(result.removable[0].path, "buildCache/v0_9");
	t.is(result.removable[0].size, 2048);

	t.is(result.unknown.length, 2, "v0_8 (unshipped) and v0_11 (newer) are unknown");
	const sortedUnknown = [...result.unknown].sort((a, b) => a.version.localeCompare(b.version));
	t.is(sortedUnknown[0].version, "v0_11");
	t.is(sortedUnknown[0].path, "buildCache/v0_11");
	t.is(sortedUnknown[1].version, "v0_8");
	t.is(sortedUnknown[1].path, "buildCache/v0_8");
});

test.serial("getOlderVersionsInfo: size falls back to 0 when cache.db is missing", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	await fs.mkdir(path.join(buildCacheDir, "v0_9"), {recursive: true}); // no cache.db — v0_9 is in KNOWN

	const result = await CacheManager.getOlderVersionsInfo(testDir);
	t.is(result.removable.length, 1);
	t.is(result.removable[0].name, "v0_9");
	t.is(result.removable[0].size, 0, "size is 0 when cache.db is absent");
});

test.serial("markOlderVersionsForRemoval: marks nothing when no older dirs exist", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	// Only current and newer — nothing to mark
	const buildCacheDir = path.join(testDir, "buildCache");
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});
	await fs.mkdir(path.join(buildCacheDir, "v0_11"), {recursive: true});

	const marked = await CacheManager.markOlderVersionsForRemoval(testDir);
	t.deepEqual(marked, []);

	// Dirs are untouched
	await t.notThrowsAsync(fs.access(path.join(buildCacheDir, CACHE_VERSION)));
	await t.notThrowsAsync(fs.access(path.join(buildCacheDir, "v0_11")));
});

test.serial("markOlderVersionsForRemoval: renames known-older dirs, leaves current, newer, unshipped", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	// Both known-older (in KNOWN_DELETABLE_VERSIONS) — should be marked
	await fs.mkdir(path.join(buildCacheDir, "v0_7"), {recursive: true});
	await fs.writeFile(path.join(buildCacheDir, "v0_7", "cache.db"), Buffer.alloc(512));
	await fs.mkdir(path.join(buildCacheDir, "v0_9"), {recursive: true});
	// Unshipped-older (NOT in KNOWN) — must NOT be marked
	await fs.mkdir(path.join(buildCacheDir, "v0_8"), {recursive: true});
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});
	await fs.mkdir(path.join(buildCacheDir, "v0_11"), {recursive: true});

	const marked = await CacheManager.markOlderVersionsForRemoval(testDir);

	// Only v0_7 and v0_9 (both in KNOWN) should be marked
	const sortedMarked = [...marked].sort((a, b) => a.path.localeCompare(b.path));
	t.is(sortedMarked.length, 2);
	t.is(sortedMarked[0].path, "buildCache/v0_7");
	t.is(sortedMarked[0].size, 512);
	t.is(sortedMarked[1].path, "buildCache/v0_9");

	// Known-older dirs no longer exist under their version name
	await t.throwsAsync(fs.access(path.join(buildCacheDir, "v0_7")), {code: "ENOENT"});
	await t.throwsAsync(fs.access(path.join(buildCacheDir, "v0_9")), {code: "ENOENT"});

	// They were renamed, not deleted — two pending removal dirs exist
	const entries = await fs.readdir(buildCacheDir);
	const pending = entries.filter((name) => name.startsWith("_buildcache_to_delete_"));
	t.is(pending.length, 2, "both known-older dirs renamed to pending removal dirs");

	// Unshipped-older, current, and newer are untouched
	await t.notThrowsAsync(fs.access(path.join(buildCacheDir, "v0_8")));
	await t.notThrowsAsync(fs.access(path.join(buildCacheDir, CACHE_VERSION)));
	await t.notThrowsAsync(fs.access(path.join(buildCacheDir, "v0_11")));
});

test.serial("getPendingRemovalsInfo: returns empty when no remnants exist", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});

	const result = await CacheManager.getPendingRemovalsInfo(testDir);
	t.deepEqual(result, []);
});

test.serial("getPendingRemovalsInfo: reports each remnant with cache.db size", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	const remnantA = path.join(buildCacheDir, "_buildcache_to_delete_3819");
	await fs.mkdir(remnantA, {recursive: true});
	await fs.writeFile(path.join(remnantA, "cache.db"), Buffer.alloc(2048));
	// A remnant with no cache.db → size 0
	await fs.mkdir(path.join(buildCacheDir, "_buildcache_to_delete_aa0c"), {recursive: true});

	const result = await CacheManager.getPendingRemovalsInfo(testDir);
	const sorted = [...result].sort((a, b) => a.path.localeCompare(b.path));
	t.is(sorted.length, 2);
	t.is(sorted[0].path, "buildCache/_buildcache_to_delete_3819");
	t.is(sorted[0].size, 2048);
	t.is(sorted[1].path, "buildCache/_buildcache_to_delete_aa0c");
	t.is(sorted[1].size, 0, "size falls back to 0 when cache.db is absent");
});

test.serial("removePendingVersions: returns outcomes for all pending dirs, marks fromThisRun correctly", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	// A remnant left behind by a prior interrupted run — NOT this run's
	const leftoverPending = path.join(buildCacheDir, "_buildcache_to_delete_abcd");
	await fs.mkdir(leftoverPending, {recursive: true});
	await fs.writeFile(path.join(leftoverPending, "cache.db"), Buffer.alloc(512));
	// An older dir in KNOWN (v0_9) — will be marked in this run
	await fs.mkdir(path.join(buildCacheDir, "v0_9"), {recursive: true});
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});

	const marked = await CacheManager.markOlderVersionsForRemoval(testDir);
	const markedPendingPaths = marked.map((entry) => entry.pendingPath);
	t.is(markedPendingPaths.length, 1, "v0_9 was marked with a pending path");

	const outcomes = await CacheManager.removePendingVersions(testDir, markedPendingPaths);

	// Both dirs (stale + this-run) are returned
	t.is(outcomes.length, 2, "outcomes include both the pre-existing stale and this-run dir");

	const staleOutcome = outcomes.find((o) => !o.fromThisRun);
	const thisRunOutcome = outcomes.find((o) => o.fromThisRun);
	t.truthy(staleOutcome, "pre-existing stale dir has an outcome");
	t.is(staleOutcome.path, "buildCache/_buildcache_to_delete_abcd");
	t.is(staleOutcome.size, 512);
	t.is(staleOutcome.removed, true, "stale dir was removed");
	t.truthy(thisRunOutcome, "this-run dir has an outcome");
	t.is(thisRunOutcome.removed, true, "this-run dir was removed");
	t.is(thisRunOutcome.size, 0, "no cache.db in this-run dir — size is 0");

	// ALL pending removal dirs are physically gone
	const entries = await fs.readdir(buildCacheDir);
	const pending = entries.filter((name) => name.startsWith("_buildcache_to_delete_"));
	t.is(pending.length, 0, "no pending removal dirs remain on disk");
	await t.throwsAsync(fs.access(leftoverPending), {code: "ENOENT"});

	// Current version is untouched
	await t.notThrowsAsync(fs.access(path.join(buildCacheDir, CACHE_VERSION)));
});

test.serial("mark/removePendingVersions: no-op when buildCache dir does not exist", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager} = await import("../../../../lib/build/cache/CacheManager.js");

	// buildCache dir is never created
	const marked = await CacheManager.markOlderVersionsForRemoval(testDir);
	t.deepEqual(marked, []);
	await t.notThrowsAsync(CacheManager.removePendingVersions(testDir));
});

test.serial("removePendingVersions: removed:false on rm failure; sibling still cleaned", async (t) => {
	const testDir = getUniqueTestDir();
	const buildCacheDir = path.join(testDir, "buildCache");

	// Two pending dirs: one whose rm will be rejected, one that succeeds
	const blockedDir = path.join(buildCacheDir, "_buildcache_to_delete_blocked");
	const siblingDir = path.join(buildCacheDir, "_buildcache_to_delete_sibling");
	await fs.mkdir(blockedDir, {recursive: true});
	await fs.mkdir(siblingDir, {recursive: true});

	// Stub removePendingDir: reject EACCES for blockedDir, actually delete sibling
	const removePendingDirStub = sinon.stub();
	removePendingDirStub.withArgs(blockedDir).rejects(
		Object.assign(new Error("EACCES: permission denied"), {code: "EACCES"})
	);
	removePendingDirStub.callsFake(async (p) => {
		await fs.rm(p, {recursive: true, force: true});
	});

	const {default: CacheManager} = await esmock("../../../../lib/build/cache/CacheManager.js", {
		"../../../../lib/utils/interruptibleRemoval.js": {
			markForRemoval: (await import("../../../../lib/utils/interruptibleRemoval.js")).markForRemoval,
			scanPendingRemovals: (await import("../../../../lib/utils/interruptibleRemoval.js")).scanPendingRemovals,
			removePendingDir: removePendingDirStub,
		},
	});

	const outcomes = await CacheManager.removePendingVersions(testDir);

	const blockedOutcome = outcomes.find((o) => o.path.includes("blocked"));
	const siblingOutcome = outcomes.find((o) => o.path.includes("sibling"));
	t.truthy(blockedOutcome, "blocked dir has an outcome");
	t.is(blockedOutcome.removed, false, "blocked dir must NOT be reported as removed");
	t.truthy(siblingOutcome, "sibling dir has an outcome");
	t.is(siblingOutcome.removed, true, "sibling dir is removed despite blocked dir failing");

	// Sibling is gone; blocked dir is still present (the stub prevented its deletion)
	await t.throwsAsync(fs.access(siblingDir), {code: "ENOENT"}, "sibling was actually deleted");
	await t.notThrowsAsync(fs.access(blockedDir), "blocked dir still exists");

	// cleanup: blocked dir was never removed by the stub, clean it up
	await fs.rm(blockedDir, {recursive: true, force: true});
});

test.serial("markOlderVersionsForRemoval: accepts pre-computed removable list, skips re-scan", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	await fs.mkdir(path.join(buildCacheDir, "v0_9"), {recursive: true});
	await fs.writeFile(path.join(buildCacheDir, "v0_9", "cache.db"), Buffer.alloc(256));
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});

	const {removable} = await CacheManager.getOlderVersionsInfo(testDir);
	t.is(removable.length, 1);

	// Pass removable directly — markOlderVersionsForRemoval must not re-scan
	const marked = await CacheManager.markOlderVersionsForRemoval(testDir, removable);
	t.is(marked.length, 1);
	t.is(marked[0].path, "buildCache/v0_9");
	t.truthy(marked[0].pendingPath, "pendingPath is populated");

	// v0_9 is no longer accessible under its version name
	await t.throwsAsync(fs.access(path.join(buildCacheDir, "v0_9")), {code: "ENOENT"});
});

test.serial("getOlderVersionsInfo: current version dir is never in removable (sanity check)", async (t) => {
	const testDir = getUniqueTestDir();
	const {default: CacheManager, CACHE_VERSION} = await import("../../../../lib/build/cache/CacheManager.js");

	const buildCacheDir = path.join(testDir, "buildCache");
	// Only the current version dir exists
	await fs.mkdir(path.join(buildCacheDir, CACHE_VERSION), {recursive: true});

	const result = await CacheManager.getOlderVersionsInfo(testDir);
	const removableNames = result.removable.map((e) => e.name);
	t.false(removableNames.includes(CACHE_VERSION), "current version must never appear in removable");
	t.deepEqual(result.unknown, []);
});
