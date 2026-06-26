import path from "node:path";
import {readdir, mkdir} from "node:fs/promises";
import {mkdirSync, utimesSync, existsSync} from "node:fs";
import {promisify} from "node:util";
import lockfile from "lockfile";
import {getLogger} from "@ui5/logger";
const log = getLogger("lock");

/**
 * Lockfile staleness threshold shared across all lock users (framework installer,
 * cache cleanup, server, build). Must be consistent so that hasActiveLocks()
 * and individual lock acquisitions agree on when a lock is stale.
 */
export const LOCK_STALE_MS = 60000;

/**
 * Interval at which long-lived graph locks refresh their mtime.
 * Must be less than LOCK_STALE_MS to keep the lock always within the freshness window.
 * Must not be even of LOCK_STALE_MS to avoid a race condition where a lock is refreshed
 * at the same time another process checks for staleness.
 */
export const LOCK_REFRESH_INTERVAL_MS = LOCK_STALE_MS * 0.6;

/**
 * Lock file name held exclusively by <code>ui5 cache clean</code> for the full
 * deletion duration. Installers check for this lock before acquiring a per-package
 * lock so that cleanup in progress is detected.
 */
export const CLEANUP_LOCK_NAME = "cache-cleanup.lock";

/**
 * Resolve the absolute path to the shared locks directory within a UI5 data directory.
 *
 * All process-coordination lock files (framework installer, cache cleanup, server,
 * build) live here.
 *
 * @param {string} ui5DataDir Resolved absolute path to UI5 data directory
 * @returns {string} Absolute path to the locks directory (<code>~/.ui5/locks/</code>)
 */
export function getLockDir(ui5DataDir) {
	return path.join(ui5DataDir, "locks");
}

/**
 * Check whether any active (non-stale) lockfiles exist in the given locks directory,
 * indicating an ongoing download, installation, build, or server process.
 *
 * @param {string} lockDir Absolute path to a locks directory
 * @param {object} [options]
 * @param {string|string[]} [options.include] Only check these lock file names (allowlist).
 *   If provided, only files in this list are considered.
 * @param {string|string[]} [options.exclude] Lock file names to skip (denylist).
 *   If provided, these files are excluded from the scan.
 * @returns {Promise<boolean>} True if any matching non-stale lockfiles are held
 */
export async function hasActiveLocks(lockDir, {include, exclude} = {}) {
	let entries;
	try {
		entries = await readdir(lockDir);
	} catch {
		return false;
	}

	const includeSet = include ? new Set([].concat(include)) : null;
	const excludeSet = exclude ? new Set([].concat(exclude)) : null;

	const lockFiles = entries.filter((name) => {
		if (!name.endsWith(".lock")) return false;
		if (includeSet && !includeSet.has(name)) return false;
		if (excludeSet && excludeSet.has(name)) return false;
		return true;
	});

	if (lockFiles.length === 0) {
		return false;
	}

	const check = promisify(lockfile.check);
	const unlock = promisify(lockfile.unlock);

	for (const lockFileName of lockFiles) {
		const lockPath = path.join(lockDir, lockFileName);
		const isLocked = await check(lockPath, {stale: LOCK_STALE_MS});
		if (isLocked) {
			return true;
		}

		// This is a stale lock file that no longer serves its purpose.
		// It's maybe there as some process crashed and didn't clean up after itself.
		// We can try to remove it.
		await unlock(lockPath).catch(() => {});
	}
	return false;
}

/**
 * Creates the release function for a lock that has already been acquired.
 * Starts the mtime-refresh interval and returns an idempotent release function
 * that stops the interval and calls <code>lockfile.unlockSync</code>.
 *
 * @param {string} lockPath Absolute path to the lock file
 * @returns {Function} Synchronous <code>release()</code> function
 */
function resolveReleaseLockFn(lockPath) {
	const interval = setInterval(() => {
		if (!existsSync(lockPath)) {
			clearInterval(interval);
			return;
		}
		const now = new Date();
		utimesSync(lockPath, now, now);
	}, LOCK_REFRESH_INTERVAL_MS);
	interval.unref();

	let released = false;
	return function release() {
		if (released) return;
		released = true;
		clearInterval(interval);
		lockfile.unlockSync(lockPath);
		log.verbose(`Released ${lockPath} lock`);
	};
}

/**
 * Synchronously acquire a lockfile and return a release function.
 *
 * Use this for operations that run synchronously (e.g. graph construction).
 * For operations that need to wait for a contended lock without blocking the
 * event loop, use {@link acquireLock} instead.
 *
 * The returned <code>release()</code> function must be called to release the lock on graceful
 * shutdown. It also stops the mtime-refresh interval. On abnormal process exit (signals),
 * lockfile's own signal-exit handler handles cleanup automatically.
 *
 * Creates the lock directory if it does not exist.
 *
 * @param {string} lockPath Absolute path to the lock file
 * @param {object} [options]
 * @param {number} [options.retries] Number of synchronous retries on contention.
 *   Each retry blocks the event loop — only use with a unique lock path where
 *   contention is impossible (e.g. a path containing a per-process random suffix).
 * @returns {Function} Synchronous <code>release()</code> function
 */
export function acquireLockSync(lockPath, {retries} = {}) {
	mkdirSync(path.dirname(lockPath), {recursive: true});
	log.verbose(`Locking ${lockPath}`);
	lockfile.lockSync(lockPath, {stale: LOCK_STALE_MS, retries});
	return resolveReleaseLockFn(lockPath);
}

/**
 * Asynchronously acquire a lockfile and return a release function.
 *
 * Use this when the lock may be contended and waiting must not block the event loop
 * (e.g. the framework package installer, where multiple packages are installed concurrently).
 *
 * The returned <code>release()</code> function must be called to release the lock on graceful
 * shutdown. It also stops the mtime-refresh interval. On abnormal process exit (signals),
 * lockfile's own signal-exit handler handles cleanup automatically.
 *
 * Creates the lock directory if it does not exist.
 *
 * @param {string} lockPath Absolute path to the lock file
 * @param {object} [options]
 * @param {number} [options.wait] Milliseconds to wait for the lock before giving up
 * @param {number} [options.retries] Number of times to retry acquiring the lock
 * @returns {Promise<Function>} Resolves with a synchronous <code>release()</code> function
 */
export async function acquireLock(lockPath, {wait, retries} = {}) {
	log.verbose(`Locking ${lockPath}`);
	await mkdir(path.dirname(lockPath), {recursive: true});
	await promisify(lockfile.lock)(lockPath, {stale: LOCK_STALE_MS, wait, retries});
	return resolveReleaseLockFn(lockPath);
}
