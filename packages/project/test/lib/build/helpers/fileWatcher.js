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

		t.is(subscription, nativeSubscription, "returns the native subscription unchanged");
		t.true(parcelSubscribe.calledOnceWithExactly("/some/dir", cb, opts),
			"delegates verbatim to the native backend");
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
