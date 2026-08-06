import {readdir, stat, mkdtemp, writeFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import parcelWatcher from "@parcel/watcher";
import micromatch from "micromatch";
import {getLogger} from "@ui5/logger";
import {findExistingDir} from "../../utils/fsHelper.js";

const log = getLogger("build:helpers:pollingWatcher");

/**
 * Drop-in replacement for <code>@parcel/watcher</code>'s <code>subscribe</code> that adds a polling
 * fallback for environments where the native watcher never delivers events.
 *
 * Some container setups (Docker over overlayfs, bind mounts, network filesystems) do not surface
 * filesystem events: <code>subscribe</code> resolves and then stays silent, with no error to catch.
 *
 * The fallback polls the watched tree on an interval, diffs a <code>{path -> {mtimeMs, size}}</code>
 * snapshot, and emits the same <code>{type, path}</code> events through the same
 * <code>(err, events)</code> callback and <code>{unsubscribe()}</code> contract, so a caller cannot
 * tell whether the native watcher or polling is in use.
 *
 * @private
 * @module @ui5/project/build/helpers/pollingWatcher
 */

// Poll interval (ms). Kept below WATCHER_BURST_SETTLE_MS (550) so the gap between polls stays within
// a downstream settle window.
const POLL_INTERVAL_MS = 250;

// How long (ms) the detection test waits for the native watcher to report a change it made itself
// before deciding the watcher is silent and switching to polling.
const PROBE_TIMEOUT_MS = 1500;

// Filesystem errors that mean the process briefly ran out of file descriptors, not that the watch is
// broken. The poll loop retries these rather than reporting them (see subscribePolling).
//
// This module reads node:fs/promises directly, unlike the rest of @ui5/project, which uses
// graceful-fs. graceful-fs retries EMFILE/ENFILE internally, which would hide the shortage from the
// poll loop and stop it from measuring how long the shortage lasts.
const TRANSIENT_ERROR_CODES = new Set(["EMFILE", "ENFILE", "EAGAIN"]);

// How long (ms) to keep retrying transient errors before reporting one through the callback. A brief
// shortage of file descriptors clears within a second or two; failures past this window are a real
// fault.
const TRANSIENT_GRACE_MS = 2500;

// Distinguishes a glob pattern from a plain path in an ignore entry, so plain paths get a cheap
// prefix check and only real globs go through micromatch.
const rIsGlob = /[*?[\]{}()!+@]/;

// Remembers the polling-vs-native decision, made once per process. Holds a Promise so concurrent
// first calls await the same test and run it only once.
let usePollingPromise = null;

/**
 * Decides whether to poll, once per process. Reads UI5_WATCH_MODE first (polling|native force),
 * otherwise runs a test: subscribe with the native watcher to a temp dir on the same filesystem as
 * <code>seedDir</code>, write a file, and wait for the event. If it arrives the native watcher
 * works; if it times out the watcher is silent and polling is used.
 *
 * @param {string} [seedDir] A real directory to place the test dir next to, so the test runs on the
 *   same filesystem (overlayfs/bind mount) the real watch will use. Falls back to the OS temp dir.
 * @returns {Promise<boolean>} Resolves true when polling should be used
 */
export function shouldUsePolling(seedDir) {
	if (!usePollingPromise) {
		usePollingPromise = decideBackend(seedDir);
	}
	return usePollingPromise;
}

async function decideBackend(seedDir) {
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
		log.warn(`Ignoring invalid UI5_WATCH_MODE '${mode}', auto-detecting file watcher backend`);
	}

	try {
		const nativeWorks = await probeNativeWatcher(seedDir);
		if (nativeWorks) {
			log.verbose(`Native file watcher verified, using it`);
			return false;
		}
		log.info(`Native file watcher did not report changes within ${PROBE_TIMEOUT_MS} ms ` +
			`(common in container environments). Falling back to polling. ` +
			`Set UI5_WATCH_MODE=native to force the native watcher.`);
		return true;
	} catch (err) {
		log.warn(`File watcher probe failed (${err?.message ?? err}), falling back to polling`);
		return true;
	}
}

// Subscribes with the native watcher to a fresh temp dir, writes a file into it, and resolves true
// if the watcher reports the change within PROBE_TIMEOUT_MS. Always removes its subscription and
// temp dir.
async function probeNativeWatcher(seedDir) {
	const base = seedDir ? await findExistingDir(seedDir) : os.tmpdir();
	const probeDir = await mkdtemp(path.join(base, ".ui5-watch-probe-"));
	let subscription;
	let timer;
	try {
		const detected = new Promise((resolve) => {
			const settle = (value) => {
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				resolve(value);
			};
			timer = setTimeout(() => settle(false), PROBE_TIMEOUT_MS);
			parcelWatcher.subscribe(probeDir, (err, events) => {
				if (err) {
					settle(false);
					return;
				}
				if (events.length) {
					settle(true);
				}
			}).then((sub) => {
				subscription = sub;
				// Trigger an event the native watcher must report if it works.
				return writeFile(path.join(probeDir, "probe.tmp"), "probe");
			}).catch(() => settle(false));
		});
		return await detected;
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
		if (subscription) {
			await subscription.unsubscribe().catch(() => {});
		}
		await rm(probeDir, {recursive: true, force: true}).catch(() => {});
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
 *   (same semantics as the native watcher)
 * @returns {Promise<{unsubscribe: Function}>} Resolves once the watcher is ready
 */
export async function subscribe(dir, callback, opts = {}) {
	const polling = await shouldUsePolling(dir);
	if (!polling) {
		return parcelWatcher.subscribe(dir, callback, opts);
	}
	return subscribePolling(dir, callback, opts);
}

async function subscribePolling(dir, callback, opts) {
	const rootDir = path.resolve(dir);
	const ignore = opts.ignore ?? [];
	const isIgnored = createIgnoreMatcher(rootDir, ignore);

	let stopped = false;
	let timer = null;
	// Timestamp (ms) of the first transient error in the current streak, or null when the last walk
	// succeeded. Drives the TRANSIENT_GRACE_MS retry window; cleared on any successful walk.
	let transientStreakStartedAt = null;

	// Initial snapshot, awaited before resolving so a change made right after startup is caught by
	// the next poll rather than baked silently into the baseline.
	let snapshot = await walk(rootDir, isIgnored);

	log.verbose(`Polling for changes in ${rootDir} every ${POLL_INTERVAL_MS} ms`);

	const scheduleNext = () => {
		if (stopped) {
			return;
		}
		timer = setTimeout(poll, POLL_INTERVAL_MS);
	};

	const poll = async () => {
		timer = null;
		try {
			const next = await walk(rootDir, isIgnored);
			if (stopped) {
				return;
			}
			transientStreakStartedAt = null;
			const events = diff(snapshot, next);
			snapshot = next;
			if (events.length) {
				callback(null, events);
			}
		} catch (err) {
			if (stopped) {
				return;
			}
			// A brief shortage of file descriptors is not a broken watch. Skip this sample and keep the
			// last snapshot so no change is lost; the next poll resamples the whole tree and rebuilds it.
			// Only report once the errors last past the grace window, since reporting makes every
			// consumer tear down and re-subscribe.
			if (TRANSIENT_ERROR_CODES.has(err?.code)) {
				const now = Date.now();
				if (transientStreakStartedAt === null) {
					transientStreakStartedAt = now;
				}
				const elapsed = now - transientStreakStartedAt;
				if (elapsed < TRANSIENT_GRACE_MS) {
					log.verbose(`Transient error polling ${rootDir} (${err.code}), retrying next cycle ` +
						`(${elapsed}/${TRANSIENT_GRACE_MS} ms)`);
					return;
				}
			}
			transientStreakStartedAt = null;
			// Report through the callback rather than throwing, matching how the native watcher
			// surfaces errors.
			callback(err, []);
		} finally {
			scheduleNext();
		}
	};

	scheduleNext();

	return {
		async unsubscribe() {
			stopped = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		},
	};
}

// Builds a predicate that tells whether an absolute path below rootDir should be ignored. Matches
// the path relative to rootDir with POSIX separators, mirroring the native watcher's glob semantics.
function createIgnoreMatcher(rootDir, ignore) {
	const globs = [];
	const literals = new Set();
	for (const entry of ignore) {
		if (rIsGlob.test(entry)) {
			globs.push(entry);
		} else {
			// A plain path (relative or absolute) ignores that file/dir and its children.
			literals.add(path.resolve(rootDir, entry));
		}
	}
	return (absPath) => {
		for (const literal of literals) {
			if (absPath === literal || absPath.startsWith(literal + path.sep)) {
				return true;
			}
		}
		if (!globs.length) {
			return false;
		}
		const rel = path.relative(rootDir, absPath).split(path.sep).join("/");
		return micromatch.isMatch(rel, globs, {dot: true});
	};
}

// Recursively walks rootDir, returning Map<absPath, {mtimeMs, size}> for every file. Ignored paths
// are skipped, and ignored directories are not descended, so a large node_modules is never crawled.
// Does not follow directory symlinks (matching the native watcher), which also avoids symlink cycles.
async function walk(rootDir, isIgnored) {
	const snapshot = new Map();
	const stack = [rootDir];
	while (stack.length) {
		const current = stack.pop();
		let entries;
		try {
			entries = await readdir(current, {withFileTypes: true});
		} catch (err) {
			if (err.code === "ENOENT") {
				// Directory vanished between discovery and read (e.g. mid-checkout). Treat as empty;
				// its former children surface as deletes against the previous snapshot.
				continue;
			}
			throw err;
		}
		for (const entry of entries) {
			const entryPath = path.join(current, entry.name);
			if (isIgnored(entryPath)) {
				continue;
			}
			if (entry.isDirectory()) {
				stack.push(entryPath);
			} else if (entry.isFile()) {
				try {
					const {mtimeMs, size} = await stat(entryPath);
					snapshot.set(entryPath, {mtimeMs, size});
				} catch (err) {
					if (err.code === "ENOENT") {
						continue;
					}
					throw err;
				}
			}
		}
	}
	return snapshot;
}

// Diffs two snapshots into the same event shape @parcel/watcher emits. A file present only in next
// -> create, only in prev -> delete, in both with a changed mtime or size -> update.
function diff(prev, next) {
	const events = [];
	for (const [filePath, meta] of next) {
		const before = prev.get(filePath);
		if (!before) {
			events.push({type: "create", path: filePath});
		} else if (before.mtimeMs !== meta.mtimeMs || before.size !== meta.size) {
			events.push({type: "update", path: filePath});
		}
	}
	for (const filePath of prev.keys()) {
		if (!next.has(filePath)) {
			events.push({type: "delete", path: filePath});
		}
	}
	return events;
}
