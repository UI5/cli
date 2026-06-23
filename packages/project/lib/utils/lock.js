import path from "node:path";
import {readdir} from "node:fs/promises";
import {mkdir} from "node:fs/promises";
import {promisify} from "node:util";
import lockfile from "lockfile";

/**
 * Lockfile staleness threshold shared across all lock users (framework installer,
 * cache cleanup, server, build). Must be consistent so that hasActiveLocks()
 * and individual lock acquisitions agree on when a lock is stale.
 */
export const LOCK_STALE_MS = 60000;

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
	for (const lockFileName of lockFiles) {
		const lockPath = path.join(lockDir, lockFileName);
		const isLocked = await check(lockPath, {stale: LOCK_STALE_MS});
		if (isLocked) {
			return true;
		}
	}
	return false;
}

/**
 * Acquire a lockfile and return a release function.
 *
 * The returned <code>release</code> function must be called to release the lock on graceful
 * shutdown. On abnormal process exit (signals), lockfile's own
 * signal-exit handler handles cleanup automatically.
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
	await mkdir(path.dirname(lockPath), {recursive: true});
	await promisify(lockfile.lock)(lockPath, {stale: LOCK_STALE_MS, wait, retries});
	return () => {
		// unlockSync is used here as in some cases the process may be exiting
		// and async cleanup may not complete in time.
		lockfile.unlockSync(lockPath);
	};
}
