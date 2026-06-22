import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getLockDir, LOCK_STALE_MS, CLEANUP_LOCK_NAME, withLock} from "../../../lib/utils/lock.js";

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

// ─── withLock ─────────────────────────────────────────────────────────────────

test.serial("withLock: creates lock dir and acquires lock before callback", async (t) => {
	const lockPath = t.context.lockPath;
	let callbackRan = false;

	await withLock(lockPath, async () => {
		await t.notThrowsAsync(fs.access(lockPath), "lock file exists during callback");
		callbackRan = true;
	});

	t.true(callbackRan, "callback was called");
	await t.throwsAsync(fs.access(lockPath), {code: "ENOENT"}, "lock file removed after withLock");
});

test.serial("withLock: releases lock even when callback throws", async (t) => {
	const lockPath = t.context.lockPath;

	await t.throwsAsync(
		withLock(lockPath, async () => {
			throw new Error("callback error");
		}),
		{message: "callback error"}
	);

	await t.throwsAsync(fs.access(lockPath), {code: "ENOENT"}, "lock file removed after throw");
});

test.serial("withLock: returns callback return value", async (t) => {
	const result = await withLock(t.context.lockPath, async () => 42);
	t.is(result, 42, "withLock returns callback value");
});

test.serial("withLock: creates lock directory if missing", async (t) => {
	const deepLockPath = path.join(t.context.testDir, "nested", "dir", "test.lock");
	await withLock(deepLockPath, async () => {});
	await t.throwsAsync(fs.access(deepLockPath), {code: "ENOENT"}, "lock file removed after unlock");
});
