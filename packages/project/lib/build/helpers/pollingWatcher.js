import {readdir, stat} from "node:fs/promises";
import path from "node:path";
import micromatch from "micromatch";
import {getLogger} from "@ui5/logger";

const log = getLogger("build:helpers:pollingWatcher");

/**
 * Polling backend for <code>fileWatcher.js</code>, used where the native <code>@parcel/watcher</code>
 * does not deliver the events the incremental build relies on (a bind-mounted volume inside a
 * container is the common case). Parcel offers no polling subscription of its own, so this walks the
 * watched tree on an interval, diffs a <code>{path -> {mtimeMs, size}}</code> snapshot, and emits the
 * same <code>{type, path}</code> events through the same <code>(err, events)</code> callback and
 * <code>{unsubscribe()}</code> contract as the native backend.
 *
 * <code>fileWatcher.js</code> imports this module lazily, only when polling is selected, so it stays
 * off the common path. See that module for the backend decision.
 *
 * @private
 * @module @ui5/project/build/helpers/pollingWatcher
 */

// Poll interval (ms). Kept below WATCHER_BURST_SETTLE_MS (550) so the gap between polls stays within
// a downstream settle window.
const DEFAULT_POLL_INTERVAL_MS = 250;

/**
 * Subscribes to filesystem changes below <code>dir</code> by polling, matching
 * <code>@parcel/watcher</code>'s <code>subscribe</code> signature and return contract.
 *
 * @param {string} dir Directory to watch
 * @param {Function} callback Invoked as <code>(err, events)</code>, events being
 *   <code>{type: "create"|"update"|"delete", path: string}</code>
 * @param {object} [opts]
 * @param {string[]} [opts.ignore] Path/glob patterns to ignore, matched relative to <code>dir</code>
 *   (same semantics as the native backend)
 * @param {number} [opts.pollInterval] Poll interval in ms. Defaults to 250 ms.
 * @returns {Promise<{unsubscribe: Function}>} Resolves once the initial snapshot is taken
 */
export async function subscribe(dir, callback, opts = {}) {
	const rootDir = path.resolve(dir);
	const ignore = opts.ignore ?? [];
	const isIgnored = createIgnoreMatcher(rootDir, ignore);
	const intervalMs = opts.pollInterval ?? DEFAULT_POLL_INTERVAL_MS;

	let stopped = false;
	let timer = null;

	// Initial snapshot. Awaited before resolving so a change made right after startup is reported by
	// the next poll rather than absorbed into the baseline and never reported.
	let snapshot = await walk(rootDir, isIgnored);

	log.verbose(`Polling for changes in ${rootDir} every ${intervalMs} ms`);

	const scheduleNext = () => {
		if (stopped) {
			return;
		}
		timer = setTimeout(poll, intervalMs);
		// The inter-poll wait must not, on its own, keep the process alive: a consumer that has
		// finished (its server closed, all real handles gone) should exit even if unsubscribe() has
		// not yet run. Referenced, this timer would pin the event loop for up to one interval and can
		// make a process "fail to exit" on teardown. Real change detection is unaffected — the poll
		// still fires while any other handle keeps the loop running.
		timer.unref?.();
	};

	const poll = async () => {
		timer = null;
		try {
			const next = await walk(rootDir, isIgnored);
			if (stopped) {
				return;
			}
			const events = diff(snapshot, next);
			snapshot = next;
			if (events.length) {
				callback(null, events);
			}
		} catch (err) {
			if (stopped) {
				return;
			}
			// Report through the callback rather than throwing, matching how the native backend
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
// the path relative to rootDir with POSIX separators, mirroring the native backend's glob semantics.
// The matcher is compiled once per subscription so the poll loop does not recompile the globs.
function createIgnoreMatcher(rootDir, ignore) {
	if (!ignore.length) {
		return () => false;
	}
	const matchGlobs = micromatch.matcher(ignore, {dot: true});
	const normalizeSep = path.sep !== "/";
	return (absPath) => {
		const rel = path.relative(rootDir, absPath);
		return matchGlobs(normalizeSep ? rel.split(path.sep).join("/") : rel);
	};
}

// Recursively walks rootDir, returning Map<absPath, {mtimeMs, size}> for every file. Ignored paths
// are skipped, and ignored directories are not descended, so a large node_modules is never crawled.
// Does not follow directory symlinks (matching the native backend), which also avoids symlink cycles.
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
				// Directory vanished between discovery and read (e.g. mid-checkout). Treat as empty.
				// Its former children surface as deletes against the previous snapshot.
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

// Diffs two snapshots into @parcel/watcher-style events. A file present only in next -> create,
// only in prev -> delete, in both with a changed mtime or size -> update.
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
