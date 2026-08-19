import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import os from "node:os";
import {mkdtemp, writeFile, rm, mkdir} from "node:fs/promises";

// fileWatcher selects a backend and delegates. The native path is checked by mocking @parcel/watcher,
// the polling path by driving the real (lazily imported) backend against a temp directory, and the
// backend decision by mocking node:fs to drive container detection to a known answer. The polling
// backend's own event behavior is covered by pollingWatcher's test.
//
// subscribe() imports both backends dynamically. Plain esmock mocks do not reach a dynamic import, so
// tests that must intercept @parcel/watcher use esmock.p (which does) and purge afterwards. Tests
// that only steer the sync container detection use plain esmock with a node:fs mock.

const fileWatcherPath = "../../../../lib/build/helpers/fileWatcher.js";

let tmpRoot;

test.before(async () => {
	tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-filewatcher-test-"));
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

// Imports a fresh module instance (so the memoized backend decision starts unset), with a node:fs
// mock to drive container detection. Env vars set by the test are read at decision time.
async function importWatcher({existsSync, readFileSync} = {}) {
	const mocks = {};
	if (existsSync || readFileSync) {
		mocks["node:fs"] = {
			existsSync: existsSync ?? (() => false),
			readFileSync: readFileSync ?? (() => {
				throw Object.assign(new Error("ENOENT"), {code: "ENOENT"});
			}),
		};
	}
	return esmock(fileWatcherPath, mocks);
}

// Imports a fresh module instance with @parcel/watcher mocked across the dynamic import (esmock.p is
// the variant that reaches it). The mock is passed as a global def so it applies wherever the module
// is imported. Callers must purge the returned module when done.
function importWatcherWithParcel(parcelMock) {
	return esmock.p(fileWatcherPath, {}, {"@parcel/watcher": parcelMock});
}

test.serial("subscribe: native delegation when UI5_WATCH_MODE=native", async (t) => {
	process.env.UI5_WATCH_MODE = "native";
	const nativeSubscription = {unsubscribe: sinon.stub().resolves()};
	const parcelSubscribe = sinon.stub().resolves(nativeSubscription);
	const watcher = await importWatcherWithParcel({
		default: {subscribe: parcelSubscribe}, subscribe: parcelSubscribe,
	});
	try {
		const cb = () => {};
		const opts = {ignore: ["**/x/**"]};
		const subscription = await watcher.subscribe("/some/dir", cb, opts);

		t.true(parcelSubscribe.calledOnceWithExactly("/some/dir", cb, opts),
			"delegates verbatim to the native backend");

		// The returned subscription wraps the native one so unsubscribe is funneled through the
		// process-wide serialization chain (parcel-bundler/watcher#259); it still delegates to the
		// native unsubscribe verbatim.
		await subscription.unsubscribe();
		t.true(nativeSubscription.unsubscribe.calledOnce, "unsubscribe delegates to the native subscription");
	} finally {
		esmock.purge(watcher);
	}
});

test.serial("pinBackend/unpinBackend: hold one keep-alive across the session, released at the last unpin",
	async (t) => {
		// The destructive half of parcel-bundler/watcher#259 is the empty-transition rehash(0) when the
		// backend registry drops to zero subscribers. A pinned keep-alive keeps the registry non-empty
		// for the whole session; it is established once (refcounted) and released only at the last unpin.
		process.env.UI5_WATCH_MODE = "native";
		const keepAlive = {unsubscribe: sinon.stub().resolves()};
		const parcelSubscribe = sinon.stub().resolves(keepAlive);
		const watcher = await importWatcherWithParcel({
			default: {subscribe: parcelSubscribe}, subscribe: parcelSubscribe,
		});
		try {
			await watcher.pinBackend();
			await watcher.pinBackend(); // second session: refcount, not a second keep-alive

			t.is(parcelSubscribe.callCount, 1, "one keep-alive subscribe regardless of pin count");
			t.deepEqual(parcelSubscribe.getCall(0).args[0], os.tmpdir(), "keep-alive watches the temp dir");
			t.deepEqual(parcelSubscribe.getCall(0).args[2], {ignore: ["**"]}, "the keep-alive ignores every event");

			await watcher.unpinBackend(); // one session ends: keep-alive stays up
			t.is(keepAlive.unsubscribe.callCount, 0, "keep-alive held while another session is active");

			await watcher.unpinBackend(); // last session ends: keep-alive released
			t.is(keepAlive.unsubscribe.callCount, 1, "keep-alive released at the last unpin");

			// A later session re-establishes a fresh keep-alive.
			await watcher.pinBackend();
			t.is(parcelSubscribe.callCount, 2, "a new session re-pins the backend");
		} finally {
			esmock.purge(watcher);
		}
	});

test.serial("pinBackend: a failed keep-alive does not throw", async (t) => {
	// The keep-alive is an optimization, not a requirement: if it cannot start, the session must
	// still run (just without protection against the empty-transition race).
	process.env.UI5_WATCH_MODE = "native";
	const parcelSubscribe = sinon.stub().rejects(new Error("cannot subscribe"));
	const watcher = await importWatcherWithParcel({
		default: {subscribe: parcelSubscribe}, subscribe: parcelSubscribe,
	});
	try {
		await t.notThrowsAsync(watcher.pinBackend(), "a failed keep-alive is swallowed");
		await t.notThrowsAsync(watcher.unpinBackend(), "unpin after a failed pin is a no-op");
	} finally {
		esmock.purge(watcher);
	}
});

test.serial("subscribe: native subscribe and unsubscribe never overlap", async (t) => {
	// @parcel/watcher races its process-global backend registry when subscribe/unsubscribe overlap
	// (parcel-bundler/watcher#259), which segfaults on Windows. fileWatcher must serialize every
	// native subscribe and unsubscribe so no two are ever in flight at once.
	process.env.UI5_WATCH_MODE = "native";
	let inFlight = 0;
	let maxInFlight = 0;
	const enter = async () => {
		inFlight++;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await new Promise((resolve) => setImmediate(resolve));
		inFlight--;
	};
	const parcelSubscribe = sinon.stub().callsFake(async () => {
		await enter();
		return {unsubscribe: async () => enter()};
	});
	const watcher = await importWatcherWithParcel({
		default: {subscribe: parcelSubscribe}, subscribe: parcelSubscribe,
	});
	try {
		// Fire several subscribes concurrently, then unsubscribe them all concurrently. Without
		// serialization the native calls would overlap (maxInFlight > 1).
		const subs = await Promise.all([
			watcher.subscribe("/a", () => {}, {}),
			watcher.subscribe("/b", () => {}, {}),
			watcher.subscribe("/c", () => {}, {}),
		]);
		await Promise.all(subs.map((s) => s.unsubscribe()));

		t.is(maxInFlight, 1, "never more than one native subscribe/unsubscribe in flight at a time");
	} finally {
		esmock.purge(watcher);
	}
});

test.serial("subscribe: falls back to polling when the native backend is unavailable", async (t) => {
	// A missing prebuilt binary leaves no usable native backend. subscribe() must not fail the watch:
	// it uses polling, which needs no native code. The mock stands in for that unavailable module (no
	// usable default export); a real missing binary throws on import, which subscribe() also catches.
	process.env.UI5_WATCH_MODE = "native";
	const watcher = await importWatcherWithParcel({default: undefined});
	const dir = await makeDir();
	let batch;
	const ready = new Promise((resolve) => {
		batch = resolve;
	});
	const subscription = await watcher.subscribe(dir, (_err, events) => batch(events), {pollInterval: 50});
	try {
		const filePath = path.join(dir, "a.js");
		await writeFile(filePath, "one");
		t.deepEqual(await ready, [{type: "create", path: filePath}],
			"the polling backend reports the change after the native backend was unavailable");
	} finally {
		await subscription.unsubscribe();
		esmock.purge(watcher);
	}
});

test.serial("subscribe: polling backend is loaded and used when UI5_WATCH_MODE=polling", async (t) => {
	// Drives the real lazily-imported polling backend end to end, so this also proves the dynamic
	// import in subscribe() resolves. Polling mode never touches the native backend.
	process.env.UI5_WATCH_MODE = "polling";
	const {subscribe} = await importWatcher();
	const dir = await makeDir();

	let batch;
	const ready = new Promise((resolve) => {
		batch = resolve;
	});
	const subscription = await subscribe(dir, (_err, events) => batch(events), {pollInterval: 50});
	try {
		const filePath = path.join(dir, "a.js");
		await writeFile(filePath, "one");
		t.deepEqual(await ready, [{type: "create", path: filePath}],
			"the polling backend reports the change");
	} finally {
		await subscription.unsubscribe();
	}
});

test.serial("shouldUsePolling: UI5_WATCH_MODE forces the backend without inspecting the environment", async (t) => {
	const existsSync = sinon.stub().returns(false);
	process.env.UI5_WATCH_MODE = "polling";
	let watcher = await importWatcher({existsSync});
	t.true(watcher.shouldUsePolling(), "polling forced");
	t.is(existsSync.callCount, 0, "no environment check when forced");

	process.env.UI5_WATCH_MODE = "native";
	watcher = await importWatcher({existsSync});
	t.false(watcher.shouldUsePolling(), "native forced");
	t.is(existsSync.callCount, 0, "no environment check when forced");
});

test.serial("shouldUsePolling: a container marker file selects polling", async (t) => {
	const existsSync = sinon.stub().callsFake((p) => p === "/run/.containerenv");
	const {shouldUsePolling} = await importWatcher({existsSync});
	t.true(shouldUsePolling(), "the Podman marker file selects the polling backend");
});

test.serial("shouldUsePolling: a container cgroup selects polling", async (t) => {
	const existsSync = sinon.stub().returns(false);
	const readFileSync = sinon.stub().returns("0::/docker/2f8c...\n");
	const {shouldUsePolling} = await importWatcher({existsSync, readFileSync});
	t.true(shouldUsePolling(), "a container cgroup for PID 1 selects the polling backend");
});

test.serial("shouldUsePolling: no container markers selects the native backend", async (t) => {
	const existsSync = sinon.stub().returns(false);
	const readFileSync = sinon.stub().returns("0::/user.slice/user-1000.slice/session-2.scope\n");
	const {shouldUsePolling} = await importWatcher({existsSync, readFileSync});
	t.false(shouldUsePolling(), "a host cgroup selects the native backend");
});

test.serial("shouldUsePolling: an unreadable /proc/1/cgroup is treated as no container", async (t) => {
	const existsSync = sinon.stub().returns(false);
	const readFileSync = sinon.stub().throws(Object.assign(new Error("ENOENT"), {code: "ENOENT"}));
	const {shouldUsePolling} = await importWatcher({existsSync, readFileSync});
	t.false(shouldUsePolling(), "a missing cgroup file (e.g. on macOS) is not a container");
});

test.serial("shouldUsePolling: the decision is memoized across calls", async (t) => {
	const existsSync = sinon.stub().returns(false);
	const readFileSync = sinon.stub().returns("0::/docker/2f8c...\n");
	const {shouldUsePolling} = await importWatcher({existsSync, readFileSync});
	t.true(shouldUsePolling());
	t.true(shouldUsePolling());
	t.is(readFileSync.callCount, 1, "the environment is inspected once per process");
});

test.serial("shouldUsePolling: an invalid UI5_WATCH_MODE falls back to environment detection", async (t) => {
	process.env.UI5_WATCH_MODE = "bogus";
	const existsSync = sinon.stub().callsFake((p) => p === "/.dockerenv");
	const {shouldUsePolling} = await importWatcher({existsSync});
	t.true(shouldUsePolling(), "the invalid mode is ignored and the environment decides");
	t.true(existsSync.called, "the environment was inspected");
});
