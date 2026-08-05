import test from "ava";
import path from "node:path";
import os from "node:os";
import {mkdtemp, writeFile, rm, mkdir, unlink} from "node:fs/promises";
import {subscribe} from "../../../../lib/build/helpers/pollingWatcher.js";

// The polling loop is exercised against a real temp directory: a filesystem poller is only as good
// as its real walk/diff/stat behavior, so faking fs would test the mock, not the watcher. subscribe
// is called directly here; fileWatcher's test covers when this backend is selected.

let tmpRoot;

test.before(async () => {
	tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-pollingwatcher-test-"));
});

test.after.always(async () => {
	await rm(tmpRoot, {recursive: true, force: true});
});

let dirCounter = 0;
async function makeDir() {
	const dir = path.join(tmpRoot, `case-${dirCounter++}`);
	await mkdir(dir, {recursive: true});
	return dir;
}

// Collects events from the callback and lets a test await the next batch.
function eventCollector() {
	const batches = [];
	let waiters = [];
	const callback = (_err, events) => {
		batches.push(events);
		const pending = waiters;
		waiters = [];
		pending.forEach((resolve) => resolve());
	};
	async function waitForBatch(timeoutMs = 2000) {
		if (batches.length) {
			return batches.shift();
		}
		await new Promise((resolve, reject) => {
			waiters.push(resolve);
			setTimeout(() => reject(new Error("Timed out waiting for a poll batch")), timeoutMs);
		});
		return batches.shift();
	}
	return {callback, waitForBatch, batches};
}

test("subscribe: emits create, update and delete events", async (t) => {
	const dir = await makeDir();
	const {callback, waitForBatch} = eventCollector();

	const subscription = await subscribe(dir, callback, {pollInterval: 50});
	try {
		const filePath = path.join(dir, "a.js");
		await writeFile(filePath, "one");
		let batch = await waitForBatch();
		t.deepEqual(batch, [{type: "create", path: filePath}], "new file reported as create");

		// A size change is the cheap definite signal, so the test does not rely on mtime resolution.
		await writeFile(filePath, "one-longer");
		batch = await waitForBatch();
		t.deepEqual(batch, [{type: "update", path: filePath}], "changed file reported as update");

		await unlink(filePath);
		batch = await waitForBatch();
		t.deepEqual(batch, [{type: "delete", path: filePath}], "removed file reported as delete");
	} finally {
		await subscription.unsubscribe();
	}
});

test("subscribe: ignores globbed paths and does not descend ignored dirs", async (t) => {
	const dir = await makeDir();
	await mkdir(path.join(dir, "node_modules", "dep"), {recursive: true});
	const {callback, waitForBatch} = eventCollector();

	const subscription = await subscribe(dir, callback, {ignore: ["**/node_modules/**"], pollInterval: 50});
	try {
		// A write inside the ignored tree must produce no event.
		await writeFile(path.join(dir, "node_modules", "dep", "index.js"), "dep");
		// A write outside it must, proving the poller is running and the ignore is selective.
		const kept = path.join(dir, "kept.js");
		await writeFile(kept, "kept");

		const batch = await waitForBatch();
		t.deepEqual(batch, [{type: "create", path: kept}], "only the non-ignored file is reported");
	} finally {
		await subscription.unsubscribe();
	}
});

test("subscribe: coalesces multiple changes into one batch per poll", async (t) => {
	const dir = await makeDir();
	const {callback, waitForBatch} = eventCollector();

	const subscription = await subscribe(dir, callback, {pollInterval: 50});
	try {
		const a = path.join(dir, "a.js");
		const b = path.join(dir, "b.js");
		await Promise.all([writeFile(a, "a"), writeFile(b, "b")]);
		const batch = await waitForBatch();
		t.deepEqual(batch.map((e) => e.type).sort(), ["create", "create"],
			"both creates arrive in one batch");
		t.deepEqual(batch.map((e) => e.path).sort(), [a, b].sort());
	} finally {
		await subscription.unsubscribe();
	}
});

test("subscribe: unsubscribe stops polling and is idempotent", async (t) => {
	const dir = await makeDir();
	const {callback, batches} = eventCollector();

	const subscription = await subscribe(dir, callback, {pollInterval: 50});
	await subscription.unsubscribe();
	await subscription.unsubscribe(); // second call must be a no-op, not throw

	await writeFile(path.join(dir, "late.js"), "late");
	// Wait well past the interval. No batch should be delivered after unsubscribe.
	await new Promise((resolve) => setTimeout(resolve, 200));
	t.is(batches.length, 0, "no events after unsubscribe");
});
