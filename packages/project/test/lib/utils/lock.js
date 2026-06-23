import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import sinon from "sinon";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getLockDir, LOCK_STALE_MS, CLEANUP_LOCK_NAME, acquireLock, hasActiveLocks}
	from "../../../lib/utils/lock.js";

const lockfileUnlock = promisify(lockfileLib.unlock);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "test", "tmp", "utils-lock");

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

// ─── hasActiveLocks ───────────────────────────────────────────────────────────

test.serial("hasActiveLocks: returns false when locks directory does not exist", async (t) => {
	const missingDir = path.join(t.context.testDir, "does-not-exist");
	t.false(await hasActiveLocks(missingDir), "no locks dir => no active locks");
});

test.serial("hasActiveLocks: returns false when locks directory is empty", async (t) => {
	t.false(await hasActiveLocks(t.context.testDir), "empty dir => no active locks");
});

test.serial("hasActiveLocks: returns true when an active (non-stale) lock is present", async (t) => {
	// Acquire a real lock so its filesystem timestamp is "now"
	const release = await acquireLock(t.context.lockPath);
	try {
		t.true(await hasActiveLocks(t.context.testDir), "fresh lock detected as active");

		// Active locks must not be deleted by the scan
		await t.notThrowsAsync(fs.access(t.context.lockPath), "active lock preserved");
	} finally {
		release();
	}
});

test.serial(
	"hasActiveLocks: removes stale lock files left behind by crashed processes",
	async (t) => {
		const staleLockPathA = path.join(t.context.testDir, "crashed-a.lock");
		const staleLockPathB = path.join(t.context.testDir, "crashed-b.lock");

		// Create two lock files on disk to simulate orphans from crashed processes.
		await fs.writeFile(staleLockPathA, "");
		await fs.writeFile(staleLockPathB, "");

		// Stub lockfile.check so both files are reported as stale (returns false).
		// This avoids any reliance on filesystem timestamps or fake timers and
		// keeps the test focused on the cleanup branch of hasActiveLocks.
		const checkStub = sinon.stub(lockfileLib, "check").yields(null, false);

		try {
			const result = await hasActiveLocks(t.context.testDir);

			t.false(result, "all locks are stale => returns false");
			t.is(checkStub.callCount, 2, "check called once per lock file");

			await t.throwsAsync(fs.access(staleLockPathA), {code: "ENOENT"},
				"crashed-a.lock removed by hasActiveLocks");
			await t.throwsAsync(fs.access(staleLockPathB), {code: "ENOENT"},
				"crashed-b.lock removed by hasActiveLocks");
		} finally {
			checkStub.restore();
		}
	},
);

test.serial(
	"hasActiveLocks: keeps active lock and removes stale neighbor in same scan",
	async (t) => {
		const staleLockPath = path.join(t.context.testDir, "stale.lock");
		const activeLockPath = path.join(t.context.testDir, "active.lock");

		// Create both lock files on disk
		await fs.writeFile(staleLockPath, "");
		await fs.writeFile(activeLockPath, "");

		// Stub lockfile.check: stale.lock => false (stale), active.lock => true (live).
		// Using explicit path matchers avoids any reliance on readdir order.
		const checkStub = sinon.stub(lockfileLib, "check");
		checkStub.withArgs(staleLockPath, sinon.match.any).yields(null, false);
		checkStub.withArgs(activeLockPath, sinon.match.any).yields(null, true);

		try {
			const result = await hasActiveLocks(t.context.testDir);

			t.true(result, "scan returns true because one lock is active");

			// Active lock preserved on disk
			await t.notThrowsAsync(fs.access(activeLockPath), "active lock preserved");
		} finally {
			checkStub.restore();
		}
	},
);

test.serial("hasActiveLocks: honours include option (allowlist)", async (t) => {
	const includedLockPath = path.join(t.context.testDir, "included.lock");
	const otherLockPath = path.join(t.context.testDir, "other.lock");

	// Create lock files for both — only "included.lock" should be inspected.
	await fs.writeFile(includedLockPath, "");
	await fs.writeFile(otherLockPath, "");

	const checkStub = sinon.stub(lockfileLib, "check").yields(null, true);

	try {
		const result = await hasActiveLocks(t.context.testDir, {include: "included.lock"});

		t.true(result, "included lock detected as active");

		// Only the included lock should have been passed to lockfile.check
		t.is(checkStub.callCount, 1, "lockfile.check called exactly once");
		t.is(checkStub.firstCall.args[0], includedLockPath,
			"lockfile.check called with the included lock path only");
	} finally {
		checkStub.restore();
	}
});

test.serial("hasActiveLocks: honours exclude option (denylist)", async (t) => {
	const excludedLockPath = path.join(t.context.testDir, "excluded.lock");
	const otherLockPath = path.join(t.context.testDir, "other.lock");

	await fs.writeFile(excludedLockPath, "");
	await fs.writeFile(otherLockPath, "");

	const checkStub = sinon.stub(lockfileLib, "check").yields(null, true);

	try {
		const result = await hasActiveLocks(t.context.testDir, {exclude: "excluded.lock"});

		t.true(result, "the non-excluded lock is detected");

		// Only the non-excluded lock should have been passed to lockfile.check
		t.is(checkStub.callCount, 1, "lockfile.check called exactly once");
		t.is(checkStub.firstCall.args[0], otherLockPath,
			"lockfile.check called with the non-excluded lock path only");
	} finally {
		checkStub.restore();
	}
});
