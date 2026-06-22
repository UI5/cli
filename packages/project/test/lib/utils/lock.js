import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getLockDir, LOCK_STALE_MS, CLEANUP_LOCK_NAME, acquireLock} from "../../../lib/utils/lock.js";

const lockfileUnlock = promisify(lockfileLib.unlock);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "utils-lock");

test.beforeEach(async (t) => {
	const testDir = path.join(TEST_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
	t.context.lockPath = path.join(testDir, "test.lock");
});

test.afterEach.always(async (t) => {
	await lockfileUnlock(t.context.lockPath).catch(() => {});
});

// ─── getLockDir ───────────────────────────────────────────────────────────────

test("getLockDir: appends locks subdirectory to the given ui5DataDir", (t) => {
	t.is(getLockDir("/some/ui5/data"), path.join("/some/ui5/data", "locks"));
});

// ─── LOCK_STALE_MS ────────────────────────────────────────────────────────────

test("LOCK_STALE_MS: is exported and equals 60000", (t) => {
	t.is(LOCK_STALE_MS, 60000);
});

test("CLEANUP_LOCK_NAME: is exported and equals cache-cleanup.lock", (t) => {
	t.is(CLEANUP_LOCK_NAME, "cache-cleanup.lock");
});

// ─── acquireLock ──────────────────────────────────────────────────────────────

test.serial("acquireLock: creates lock dir and acquires lock, returns release fn", async (t) => {
	const lockPath = t.context.lockPath;

	const release = await acquireLock(lockPath);

	// Lock file exists while lock is held
	await t.notThrowsAsync(fs.access(lockPath), "lock file exists after acquire");

	release();

	// Lock file removed after release
	await t.throwsAsync(fs.access(lockPath), {code: "ENOENT"}, "lock file removed after release");
});
