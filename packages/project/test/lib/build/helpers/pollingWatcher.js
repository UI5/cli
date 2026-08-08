import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import os from "node:os";
import * as realFsPromises from "node:fs/promises";
import {mkdtemp, writeFile, rm, mkdir, unlink} from "node:fs/promises";

// The polling loop is exercised against a real temp directory: a filesystem poller is only as good
// as its real walk/diff/stat behavior, so faking fs would test the mock, not the watcher. parcel is
// mocked only where the native backend is involved (native delegation and the auto-detect probe).

let tmpRoot;

test.before(async () => {
	tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-pollingwatcher-test-"));
});

test.after.always(async () => {
	await rm(tmpRoot, {recursive: true, force: true});
});

test.afterEach.always(() => {
	sinon.restore();
	delete process.env.UI5_WATCH_MODE;
});

let dirCounter = 0;
async function makeDir() {
	const dir = path.join(tmpRoot, `case-${dirCounter++}`);
	await mkdir(dir, {recursive: true});
	return dir;
}

// Imports a fresh module instance (so the memoized backend decision starts unset) with an optional
// parcel mock. Env vars set by the test are read at decision time. An optional fsPromises override
// wraps node:fs/promises so a test can make specific walk syscalls fail (e.g. inject EMFILE).
async function importWatcher({parcelSubscribe, fsPromises} = {}) {
	const mocks = {};
	if (parcelSubscribe) {
		mocks["@parcel/watcher"] = {default: {subscribe: parcelSubscribe}};
	}
	if (fsPromises) {
		mocks["node:fs/promises"] = fsPromises;
	}
	return esmock("../../../../lib/build/helpers/pollingWatcher.js", mocks);
}

// Wraps the real node:fs/promises, letting a test intercept stat so it can throw a controllable
// error for a bounded number of calls and then resume real behavior.
function fsPromisesWithStatFault({code, failCalls}) {
	let remaining = failCalls;
	const stat = async (...args) => {
		if (remaining > 0) {
			remaining--;
			const err = new Error(`${code}: injected`);
			err.code = code;
			throw err;
		}
		return realFsPromises.stat(...args);
	};
	return {...realFsPromises, stat};
}

// Collects events from the callback and lets a test await the next batch.
function eventCollector() {
	const batches = [];
	const errors = [];
	let waiters = [];
	const callback = (err, events) => {
		if (err) {
			errors.push(err);
		} else {
			batches.push(events);
		}
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
	return {callback, waitForBatch, batches, errors};
}

test.serial("subscribe: native delegation when UI5_WATCH_MODE=native", async (t) => {
	process.env.UI5_WATCH_MODE = "native";
	const nativeSubscription = {unsubscribe: sinon.stub().resolves()};
	const parcelSubscribe = sinon.stub().resolves(nativeSubscription);
	const {subscribe} = await importWatcher({parcelSubscribe});

	const cb = () => {};
	const opts = {ignore: ["**/x/**"]};
	const subscription = await subscribe("/some/dir", cb, opts);

	t.is(subscription, nativeSubscription, "returns the native subscription unchanged");
	t.true(parcelSubscribe.calledOnceWithExactly("/some/dir", cb, opts),
		"delegates verbatim to the native backend");
});

test.serial("subscribe: polling emits create, update and delete events", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	const {subscribe} = await importWatcher();
	const dir = await makeDir();
	const {callback, waitForBatch} = eventCollector();

	const subscription = await subscribe(dir, callback);
	try {
		const filePath = path.join(dir, "a.js");
		await writeFile(filePath, "one");
		let batch = await waitForBatch();
		t.deepEqual(batch, [{type: "create", path: filePath}], "new file reported as create");

		// A size change is the cheap definite signal; no reliance on mtime resolution.
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

test.serial("subscribe: polling ignores globbed paths and does not descend ignored dirs", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	const {subscribe} = await importWatcher();
	const dir = await makeDir();
	await mkdir(path.join(dir, "node_modules", "dep"), {recursive: true});
	const {callback, waitForBatch} = eventCollector();

	const subscription = await subscribe(dir, callback, {ignore: ["**/node_modules/**"]});
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

test.serial("subscribe: polling coalesces multiple changes into one batch per poll", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	const {subscribe} = await importWatcher();
	const dir = await makeDir();
	const {callback, waitForBatch} = eventCollector();

	const subscription = await subscribe(dir, callback);
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

test.serial("subscribe: unsubscribe stops polling and is idempotent", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	const {subscribe} = await importWatcher();
	const dir = await makeDir();
	const {callback, batches} = eventCollector();

	const subscription = await subscribe(dir, callback);
	await subscription.unsubscribe();
	await subscription.unsubscribe(); // second call must be a no-op, not throw

	await writeFile(path.join(dir, "late.js"), "late");
	// Wait well past the interval; no batch should be delivered after unsubscribe.
	await new Promise((resolve) => setTimeout(resolve, 200));
	t.is(batches.length, 0, "no events after unsubscribe");
});

test.serial("subscribe: polling rides out a transient fd-exhaustion error and reports the change", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	// Fail the first stat with EMFILE. The initial snapshot walks an empty dir (no stat calls), so
	// this fault lands on the poll that first sees the new file: that walk throws, the cycle is
	// skipped without an error callback, and the next poll succeeds and reports the create.
	const fsPromises = fsPromisesWithStatFault({code: "EMFILE", failCalls: 1});
	const {subscribe} = await importWatcher({fsPromises});
	const dir = await makeDir();
	const {callback, waitForBatch, errors} = eventCollector();

	const subscription = await subscribe(dir, callback);
	try {
		const filePath = path.join(dir, "a.js");
		await writeFile(filePath, "one");
		const batch = await waitForBatch();
		t.deepEqual(batch, [{type: "create", path: filePath}],
			"the change is reported once the transient error clears");
		t.is(errors.length, 0, "the transient error is not surfaced as a watcher error");
	} finally {
		await subscription.unsubscribe();
	}
});

test.serial("subscribe: polling escalates a persistent fd-exhaustion error through the callback", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	// Keep stat failing with EMFILE well past the grace window (2500 ms at a 250 ms interval, ~10
	// cycles). The initial snapshot walks an empty dir (no stat), so every failure lands in the poll
	// loop: cycles within the window are skipped, and the first poll after the window elapses surfaces
	// the error through the callback.
	const fsPromises = fsPromisesWithStatFault({code: "EMFILE", failCalls: 1000});
	const {subscribe} = await importWatcher({fsPromises});
	const dir = await makeDir();
	const {callback, errors} = eventCollector();

	const subscription = await subscribe(dir, callback);
	try {
		// A file to stat each poll, so every walk has a syscall to fail while failures remain.
		await writeFile(path.join(dir, "a.js"), "one");
		const deadline = Date.now() + 5000;
		while (!errors.length && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		t.is(errors.length, 1, "the persistent error is surfaced once after the grace window elapses");
		t.is(errors[0].code, "EMFILE", "the original error is passed through unchanged");
	} finally {
		await subscription.unsubscribe();
	}
});

test.serial("shouldUsePolling: UI5_WATCH_MODE forces the backend, no probe", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	const parcelSubscribe = sinon.stub().resolves({unsubscribe: sinon.stub().resolves()});
	let watcher = await importWatcher({parcelSubscribe});
	t.true(await watcher.shouldUsePolling("/dir"), "polling forced");
	t.is(parcelSubscribe.callCount, 0, "no probe when forced");

	process.env.UI5_WATCH_MODE = "native";
	watcher = await importWatcher({parcelSubscribe});
	t.false(await watcher.shouldUsePolling("/dir"), "native forced");
	t.is(parcelSubscribe.callCount, 0, "no probe when forced");
});

test.serial("shouldUsePolling: probe picks native when the watcher reports the change", async (t) => {
	// The probe subscribes to its own temp dir, writes into it, and waits for an event. Fire one
	// synchronously from the mock so it reads as a working native backend.
	const parcelSubscribe = sinon.stub().callsFake(async (dir, cb) => {
		setImmediate(() => cb(null, [{type: "create", path: path.join(dir, "probe.tmp")}]));
		return {unsubscribe: sinon.stub().resolves()};
	});
	const {shouldUsePolling} = await importWatcher({parcelSubscribe});
	t.false(await shouldUsePolling(tmpRoot), "native backend detected");
});

test.serial("shouldUsePolling: probe falls back to polling when no event arrives", async (t) => {
	// Never invoke the callback: a silent backend, as in a container.
	const parcelSubscribe = sinon.stub().resolves({unsubscribe: sinon.stub().resolves()});
	const {shouldUsePolling} = await importWatcher({parcelSubscribe});
	// Accepts the real 1500 ms probe timeout. Stubbing the timer to shorten it would couple the test
	// to the probe's internals.
	t.true(await shouldUsePolling(tmpRoot), "silent backend falls back to polling");
});

test.serial("shouldUsePolling: the decision is memoized across calls", async (t) => {
	process.env.UI5_WATCH_MODE = "polling";
	const {shouldUsePolling} = await importWatcher();
	const first = shouldUsePolling("/dir");
	const second = shouldUsePolling("/other");
	t.is(first, second, "same promise returned, decision runs once per process");
	t.true(await first);
});

test.serial("shouldUsePolling: an invalid UI5_WATCH_MODE auto-detects", async (t) => {
	process.env.UI5_WATCH_MODE = "bogus";
	const parcelSubscribe = sinon.stub().callsFake(async (dir, cb) => {
		setImmediate(() => cb(null, [{type: "create", path: path.join(dir, "probe.tmp")}]));
		return {unsubscribe: sinon.stub().resolves()};
	});
	const {shouldUsePolling} = await importWatcher({parcelSubscribe});
	t.false(await shouldUsePolling(tmpRoot), "invalid mode is ignored and the probe runs");
	t.true(parcelSubscribe.calledOnce, "the probe subscribed");
});
