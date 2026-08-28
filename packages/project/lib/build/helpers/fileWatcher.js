import {existsSync, readFileSync} from "node:fs";
import os from "node:os";
import {getLogger} from "@ui5/logger";
import {trace} from "./teardownTrace.js";

const log = getLogger("build:helpers:fileWatcher");

/**
 * Entry point every watcher consumer calls instead of <code>@parcel/watcher</code> directly. It
 * selects a watcher backend once per process and exposes a <code>subscribe</code> matching
 * <code>@parcel/watcher</code>'s exact signature and return contract, so a caller cannot tell which
 * backend is active.
 *
 * The native backend is <code>@parcel/watcher</code>. It is the default and covers the common case.
 * Inside a container, Linux inotify often reports the container's own writes but not writes made to a
 * mounted volume from outside the container (the common case in Podman). The incremental build
 * derives "what changed" solely from watcher events, so those missed events break rebuilds and live
 * reload. The polling backend in <code>pollingWatcher.js</code> reads the tree directly, so it sees
 * every change regardless of where it originated.
 *
 * Both backends are imported lazily, only when selected, so neither module enters the import tree on
 * the path that does not use it. <code>@parcel/watcher</code> resolves a native binding at load time
 * and throws when the platform's prebuilt binary is not installed, so a static import here would
 * break every consumer before the polling fallback could run. Loading it on demand keeps that failure
 * contained: when the native backend is selected but cannot load, subscribe() falls back to polling,
 * which needs no native code.
 *
 * @private
 * @module @ui5/project/build/helpers/fileWatcher
 */

// Marker files the container runtimes drop into the root filesystem: /.dockerenv by Docker,
// /run/.containerenv by Podman.
const CONTAINER_MARKER_FILES = ["/.dockerenv", "/run/.containerenv"];

// cgroup path fragments that appear only when PID 1 runs under a container runtime.
const rContainerCgroup = /\b(?:docker|libpod|containerd|kubepods)\b/;

// Memoized backend decision. Computed once per process and shared by every subscribe() call.
let usePolling = null;

// Memoized native backend: the @parcel/watcher module once loaded, or null when it could not load
// (e.g. no prebuilt binary for this platform). nativeBackendLoaded guards the one load attempt so a
// null result is not retried.
let nativeBackend = null;
let nativeBackendLoaded = false;

// Serialization chain for native subscribe/unsubscribe. @parcel/watcher mutates a process-global
// backend registry from both the JS thread (subscribe: find/emplace/rehash) and a libuv worker
// thread (unsubscribe of the last subscriber: erase/rehash), with no lock guarding that static map
// (parcel-bundler/watcher#259). Funneling every native subscribe and unsubscribe through one promise
// chain means the process never issues two overlapping registry mutations from the JS thread. This
// pairs with the keep-alive below: the keep-alive prevents the destructive empty-transition rehash,
// and serializing removes the remaining same-thread overlap so subscribe fan-out and teardown drain
// cannot interleave their native calls. The chain is process-wide because the registry it protects
// is process-global; it only orders watcher-lifecycle calls (rare, at startup/teardown), so it costs
// nothing on the hot path.
let nativeWatcherChain = Promise.resolve();

// Runs fn after every previously-chained native watcher operation has settled, and extends the chain
// so the next one waits for fn. Rejections are isolated so one failed operation does not wedge the
// chain, while the returned promise still rejects for its own caller.
function serializeNativeWatcherOp(fn) {
	const result = nativeWatcherChain.then(fn, fn);
	nativeWatcherChain = result.then(() => undefined, () => undefined);
	return result;
}

// Keep-alive subscription that pins @parcel/watcher's shared backend so its global registry never
// empties while a serving session is active. The destructive half of parcel-bundler/watcher#259 is
// the empty transition: when the last subscriber for a backend is removed, removeShared() runs
// erase() + rehash(0) on a libuv worker thread, and that rehash(0) races a concurrent subscribe from
// the JS thread — the exact shape of one reinitialize() swap fully tearing down its watchers before
// the next stack subscribes. Serializing our own subscribe/unsubscribe calls cannot fence this,
// because the worker-thread erase can run after our unsubscribe promise has already resolved.
//
// Holding one keep-alive subscription across the session keeps the registry size above zero, so
// rehash(0) never fires during the churn. It is released only when the last session ends
// (pinCount 0): by then nothing is serving, so no concurrent subscribe can race the final
// registry-empty, and releasing it lets the process (and AVA's test worker) drain the native handle
// and exit cleanly. The tmpdir target always exists and the "**" ignore drops every event, so the
// keep-alive delivers nothing and does no work beyond existing.
let keepAlivePromise = null;
let backendPinCount = 0;

/**
 * Pins the native watcher backend alive for the duration of a serving session, so its shared
 * registry never empties mid-session (see keepAlivePromise). Balanced by {@link unpinBackend}. A
 * no-op under the polling backend, which has no such registry. Awaiting the returned promise ensures
 * the keep-alive is in place before the first real subscribe of the session.
 *
 * @returns {Promise<void>} Resolves once the keep-alive is established (or skipped)
 */
export async function pinBackend() {
	if (shouldUsePolling()) {
		return;
	}
	const native = await loadNativeBackend();
	if (!native) {
		return;
	}
	backendPinCount++;
	keepAlivePromise ??= serializeNativeWatcherOp(() => {
		trace("fileWatcher: backend keep-alive subscribe start");
		return native.subscribe(os.tmpdir(), () => {}, {ignore: ["**"]});
	}).then((subscription) => {
		trace("fileWatcher: backend keep-alive subscribe done");
		return subscription;
	}, (err) => {
		// A failed keep-alive must not fail the session: it is an optimization, not a requirement.
		// Without it we simply fall back to the empty-transition race being possible again, so log and
		// carry on rather than rejecting the caller.
		log.verbose(`Watcher backend keep-alive could not start: ${err?.message ?? err}`);
		return null;
	});
	await keepAlivePromise;
}

/**
 * Releases a {@link pinBackend} reference. When the last session ends, the keep-alive subscription is
 * torn down so the native handle no longer holds the event loop open. Safe to over-call; a release
 * without a matching pin is a no-op.
 *
 * @returns {Promise<void>} Resolves once the keep-alive has been released (or on the balancing call)
 */
export async function unpinBackend() {
	if (backendPinCount === 0) {
		return;
	}
	if (--backendPinCount > 0) {
		return;
	}
	const pending = keepAlivePromise;
	keepAlivePromise = null;
	const subscription = await pending;
	if (subscription) {
		await serializeNativeWatcherOp(() => {
			trace("fileWatcher: backend keep-alive unsubscribe");
			return subscription.unsubscribe();
		});
	}
}

/**
 * Decides whether to poll, once per process. <code>UI5_WATCH_MODE=polling|native</code> forces the
 * choice; otherwise polling is the default inside a container and the native backend is the default
 * elsewhere.
 *
 * @returns {boolean} True when the polling backend should be used
 */
export function shouldUsePolling() {
	return (usePolling ??= decideBackend());
}

function decideBackend() {
	const mode = process.env.UI5_WATCH_MODE;
	if (mode === "polling") {
		log.verbose(`UI5_WATCH_MODE=polling: using polling file watcher`);
		return true;
	}
	if (mode === "native") {
		log.verbose(`UI5_WATCH_MODE=native: using native file watcher`);
		return false;
	}
	if (mode) {
		log.warn(`Ignoring invalid UI5_WATCH_MODE '${mode}', detecting file watcher backend`);
	}

	if (isRunningInContainer()) {
		log.info(`Detected a container environment: using the polling file watcher. Inside a ` +
			`container, inotify often does not report changes made to a mounted volume from outside ` +
			`the container. Set UI5_WATCH_MODE=native to force the native watcher.`);
		return true;
	}
	log.verbose(`No container environment detected, using the native file watcher`);
	return false;
}

// Reports whether the process runs inside a container. Checks the marker files the runtimes drop
// into the root filesystem, then PID 1's cgroup membership. A container is a heuristic, not a
// guarantee: UI5_WATCH_MODE overrides it either way. Any filesystem error means the check could not
// prove a container, so it reports false (the native backend), which also covers non-Linux hosts
// where /proc/1/cgroup does not exist.
function isRunningInContainer() {
	for (const marker of CONTAINER_MARKER_FILES) {
		if (existsSync(marker)) {
			return true;
		}
	}
	try {
		return rContainerCgroup.test(readFileSync("/proc/1/cgroup", "utf8"));
	} catch {
		return false;
	}
}

/**
 * Subscribes to filesystem changes below <code>dir</code>, matching
 * <code>@parcel/watcher</code>'s <code>subscribe</code> signature and return contract.
 *
 * @param {string} dir Directory to watch
 * @param {Function} callback Invoked as <code>(err, events)</code>, events being
 *   <code>{type: "create"|"update"|"delete", path: string}</code>
 * @param {object} [opts]
 * @param {string[]} [opts.ignore] Path/glob patterns to ignore, matched relative to <code>dir</code>
 *   (same semantics as the native backend)
 * @param {number} [opts.pollInterval] Poll interval in ms for the polling backend. Internal option.
 *   The native backend ignores it. Defaults to 250 ms.
 * @returns {Promise<{unsubscribe: Function}>} Resolves once the watcher is ready
 */
export async function subscribe(dir, callback, opts = {}) {
	if (!shouldUsePolling()) {
		const native = await loadNativeBackend();
		if (native) {
			// Serialize against every other native subscribe/unsubscribe: see nativeWatcherChain. The
			// shared backend is pinned for the session via pinBackend(), so the registry does not empty
			// between this subscribe and a concurrent teardown.
			const subscription = await serializeNativeWatcherOp(() => {
				trace(`fileWatcher.subscribe: native subscribe start (${dir})`);
				return native.subscribe(dir, callback, opts);
			});
			trace(`fileWatcher.subscribe: native subscribe done (${dir})`);
			// Route unsubscribe through the same chain so a teardown never overlaps a subscribe (or
			// another unsubscribe) on the shared registry.
			return {
				unsubscribe: () => serializeNativeWatcherOp(() => subscription.unsubscribe()),
			};
		}
		// The native binding could not load (see loadNativeBackend). Polling needs no native code, so
		// fall through to it rather than failing the watch.
	}
	// Loaded on demand: polling is the exception, so its module never enters the import tree when the
	// native backend is used.
	const {subscribe: subscribePolling} = await import("./pollingWatcher.js");
	return subscribePolling(dir, callback, opts);
}

// Loads @parcel/watcher on demand and memoizes the result. Imported here rather than at module top
// because it resolves a native binding at load time and throws when the platform's prebuilt binary is
// not installed. A failure returns null (logged once) so subscribe() can fall back to polling instead
// of taking down every consumer.
async function loadNativeBackend() {
	if (nativeBackendLoaded) {
		return nativeBackend;
	}
	nativeBackendLoaded = true;
	try {
		nativeBackend = (await import("@parcel/watcher")).default;
	} catch (err) {
		nativeBackend = null;
		log.warn(`Could not load the native file watcher (@parcel/watcher), falling back to ` +
			`polling. This usually means the prebuilt binary for this platform was not installed. ` +
			`Original error: ${err.message}`);
	}
	return nativeBackend;
}
