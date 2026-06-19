import test from "ava";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getLockDir, LOCK_STALE_MS, CLEANUP_LOCK_NAME, withLock} from "../../../lib/utils/lock.js";

const lockfileUnlock = promisify(lockfileLib.unlock);

test.beforeEach(async (t) => {
	const testDir = path.join(os.tmpdir(), `ui5-lock-test-${Date.now()}-${Math.random()}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
	t.context.lockPath = path.join(testDir, "test.lock");
});

test.afterEach.always(async (t) => {
	await lockfileUnlock(t.context.lockPath).catch(() => {});
	await fs.rm(t.context.testDir, {recursive: true, force: true});
});

// ─── getLockDir ───────────────────────────────────────────────────────────────

test("getLockDir: returns ~/.ui5/locks for the default data dir", (t) => {
	t.is(getLockDir(path.join(os.homedir(), ".ui5")), path.join(os.homedir(), ".ui5", "locks"));
});

test("getLockDir: appends locks to any given ui5DataDir", (t) => {
	t.is(getLockDir("/custom/data"), path.join("/custom/data", "locks"));
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
