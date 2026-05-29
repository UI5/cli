import test from "ava";
import StageCache from "../../../../lib/build/cache/StageCache.js";

function fakeStage(id) {
	return {id};
}

test("discardPending removes pending entries from queue and map", (t) => {
	const cache = new StageCache();
	cache.addSignature("task/a", "sig-a", fakeStage("a"), [], new Map(), new Map());
	cache.addSignature("task/b", "sig-b", fakeStage("b"), [], new Map(), new Map());

	t.true(cache.hasPendingCacheQueue(), "Queue is non-empty before discard");
	t.truthy(cache.getCacheForSignature("task/a", "sig-a"), "Entry a is present before discard");
	t.truthy(cache.getCacheForSignature("task/b", "sig-b"), "Entry b is present before discard");

	cache.discardPending();

	t.false(cache.hasPendingCacheQueue(), "Queue is empty after discard");
	t.is(cache.getCacheForSignature("task/a", "sig-a"), null, "Entry a is removed from map");
	t.is(cache.getCacheForSignature("task/b", "sig-b"), null, "Entry b is removed from map");
});

test("discardPending is a no-op when the queue is empty", (t) => {
	const cache = new StageCache();
	cache.addSignature("task/a", "sig-a", fakeStage("a"), [], new Map(), new Map());

	// Simulate a successful build: flush persists the queue but leaves the map intact.
	const flushed = cache.flushCacheQueue();
	t.deepEqual(flushed, [["task/a", "sig-a"]]);
	t.false(cache.hasPendingCacheQueue());
	t.truthy(cache.getCacheForSignature("task/a", "sig-a"), "Flushed entry still in map");

	cache.discardPending();

	t.truthy(
		cache.getCacheForSignature("task/a", "sig-a"),
		"Already-flushed entry must NOT be removed by a later discardPending");
});

test("discardPending only removes entries added since the last flush", (t) => {
	const cache = new StageCache();
	// Build #1: add and flush -> persisted
	cache.addSignature("task/a", "sig-1", fakeStage("a1"), [], new Map(), new Map());
	cache.flushCacheQueue();

	// Build #2: aborted before flush
	cache.addSignature("task/a", "sig-2", fakeStage("a2"), [], new Map(), new Map());
	cache.addSignature("task/b", "sig-3", fakeStage("b1"), [], new Map(), new Map());

	cache.discardPending();

	t.truthy(cache.getCacheForSignature("task/a", "sig-1"), "Build #1 entry retained");
	t.is(cache.getCacheForSignature("task/a", "sig-2"), null, "Build #2 entry on existing stageId removed");
	t.is(cache.getCacheForSignature("task/b", "sig-3"), null, "Build #2 entry on new stageId removed");
});

test("discardPending removes the latest write for an overwritten signature", (t) => {
	const cache = new StageCache();
	// Build #1: add and flush
	cache.addSignature("task/a", "sig-x", fakeStage("v1"), [], new Map(), new Map());
	cache.flushCacheQueue();

	// Build #2: re-add the SAME signature (e.g. inputs unchanged), then abort
	cache.addSignature("task/a", "sig-x", fakeStage("v2"), [], new Map(), new Map());

	cache.discardPending();

	// The entry was overwritten and is now removed; persistent cache (not modeled here) would
	// still hold the prior version, and #findStageCache would fall back to disk.
	t.is(cache.getCacheForSignature("task/a", "sig-x"), null,
		"Overwritten-and-then-discarded entry is removed from the in-memory map");
});
