import {existsSync, readFileSync} from "node:fs";
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
// (parcel-bundler/watcher#259). Overlapping a subscribe with an in-flight unsubscribe — the exact
// shape of a reinitialize() swap tearing down the old watcher while subscribing the new one — races
// that registry and access-violates (0xC0000005) on Windows. Funneling every native subscribe and
// unsubscribe through one promise chain means the process never has two registry mutations in
// flight at once: each waits for the previous to fully settle (the unsubscribe promise resolves
// only after the native teardown, including the worker-thread erase, has completed). The chain is
// process-wide because the registry it protects is process-global; it only orders watcher lifecycle
// calls (rare, at startup/teardown), so it costs nothing on the hot path.
let nativeWatcherChain = Promise.resolve();

// Runs fn after every previously-chained native watcher operation has settled, and extends the chain
// so the next one waits for fn. Rejections are isolated so one failed operation does not wedge the
// chain, while the returned promise still rejects for its own caller.
function serializeNativeWatcherOp(fn) {
	const result = nativeWatcherChain.then(fn, fn);
	nativeWatcherChain = result.then(() => undefined, () => undefined);
	return result;
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
			// Serialize against every other native subscribe/unsubscribe: see nativeWatcherChain.
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
