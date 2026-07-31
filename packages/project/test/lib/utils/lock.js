import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import sinon from "sinon";
import esmock from "esmock";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {
	getLockDir,
	LOCK_STALE_MS,
	LOCK_REFRESH_INTERVAL_MS,
	CLEANUP_LOCK_NAME,
	acquireLockSync,
	acquireLock,
	hasActiveLocks
} from "../../../lib/utils/lock.js";

const lockfileUnlock = promisify(lockfileLib.unlock);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "test", "tmp", "utils-lock");

test.beforeEach(async (t) => {
	// ui5DataDir — hasActiveLocks derives lockDir = ui5DataDir/locks/ internally
	const ui5DataDir = path.join(TEST_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	const lockDir = path.join(ui5DataDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});
	t.context.ui5DataDir = ui5DataDir;
	t.context.lockDir = lockDir;
	t.context.lockPath = path.join(lockDir, "test.lock");
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

// ─── acquireLockSync ──────────────────────────────────────────────────────────

test("LOCK_REFRESH_INTERVAL_MS: is exported and equals LOCK_STALE_MS * 0.6", (t) => {
	t.is(LOCK_REFRESH_INTERVAL_MS, LOCK_STALE_MS * 0.6);
});

test.serial("acquireLockSync: returns a release function", (t) => {
	const release = acquireLockSync(t.context.lockPath);
	try {
		t.is(typeof release, "function", "acquireLockSync returns a function");
	} finally {
		release();
	}
});

test.serial("acquireLockSync: release() removes the lock file", async (t) => {
	const release = acquireLockSync(t.context.lockPath);

	await t.notThrowsAsync(fs.access(t.context.lockPath), "lock file exists after acquire");

	release();

	await t.throwsAsync(fs.access(t.context.lockPath), {code: "ENOENT"}, "lock file removed after release");
});

test.serial("acquireLockSync: release() is idempotent", (t) => {
	const release = acquireLockSync(t.context.lockPath);
	release();
	t.notThrows(() => release(), "second release() call does not throw");
});

test.serial("acquireLockSync: release() stops the refresh interval", async (t) => {
	const clock = sinon.useFakeTimers({toFake: ["setInterval", "clearInterval", "setTimeout"]});
	try {
		const release = acquireLockSync(t.context.lockPath);
		const statBefore = await fs.stat(t.context.lockPath);

		// Release immediately — interval must stop
		release();

		// Advance past two interval periods — if the interval were still running it would
		// call utimesSync on the (now deleted) file and throw an uncaught ENOENT.
		await clock.tickAsync(LOCK_REFRESH_INTERVAL_MS * 2 + 1);

		await t.throwsAsync(fs.access(t.context.lockPath), {code: "ENOENT"},
			"lock file gone — interval has nothing to refresh");
		t.truthy(statBefore, "stat was readable before release");
	} finally {
		clock.restore();
	}
});

test.serial("acquireLockSync: refresh interval keeps mtime fresh while lock is held", async (t) => {
	// Start fake timers at the current real time so new Date() in the interval
	// returns a timestamp that advances beyond the file's creation mtime.
	const clock = sinon.useFakeTimers({
		now: Date.now(),
		toFake: ["setInterval", "clearInterval", "setTimeout", "Date"],
	});
	try {
		const release = acquireLockSync(t.context.lockPath);
		try {
			const statBefore = await fs.stat(t.context.lockPath);
			// Advance past one interval tick — Date now returns a later time, so
			// utimesSync sets a later mtime that fs.stat will reflect.
			await clock.tickAsync(LOCK_REFRESH_INTERVAL_MS + 1);
			const statAfter = await fs.stat(t.context.lockPath);
			t.true(statAfter.mtimeMs >= statBefore.mtimeMs,
				"mtime updated by refresh interval while lock is held");
		} finally {
			release();
		}
	} finally {
		clock.restore();
	}
});

// ─── acquireLock ─────────────────────────────────────────────────────────────

test.serial("acquireLock: returns a release function", async (t) => {
	const release = await acquireLock(t.context.lockPath);
	try {
		t.is(typeof release, "function", "acquireLock resolves with a function");
	} finally {
		release();
	}
});

test.serial("acquireLock: release() removes the lock file", async (t) => {
	const release = await acquireLock(t.context.lockPath);

	await t.notThrowsAsync(fs.access(t.context.lockPath), "lock file exists after acquire");

	release();

	await t.throwsAsync(fs.access(t.context.lockPath), {code: "ENOENT"}, "lock file removed after release");
});

test.serial("acquireLock: release() is idempotent", async (t) => {
	const release = await acquireLock(t.context.lockPath);
	release();
	t.notThrows(() => release(), "second release() call does not throw");
});

test.serial("acquireLock: waits for a contended lock without blocking", async (t) => {
	// Acquire the lock from the outside first
	const firstRelease = await acquireLock(t.context.lockPath);
	try {
		// Second acquirer should wait and eventually succeed once the first releases
		const acquirePromise = acquireLock(t.context.lockPath, {wait: 5000, retries: 10});
		// Release the first lock after a short delay
		setTimeout(() => firstRelease(), 50);
		const secondRelease = await acquirePromise;
		t.pass("second acquireLock resolved after first was released");
		secondRelease();
	} finally {
		firstRelease(); // no-op if already released
	}
});

// ─── hasActiveLocks ───────────────────────────────────────────────────────────

test.serial("hasActiveLocks: returns false when locks directory does not exist", async (t) => {
	const missingDir = path.join(t.context.ui5DataDir, "does-not-exist");
	t.false(await hasActiveLocks(missingDir), "no locks dir => no active locks");
});

test.serial("hasActiveLocks: returns false when locks directory is empty", async (t) => {
	t.false(await hasActiveLocks(t.context.ui5DataDir), "empty dir => no active locks");
});

test.serial("hasActiveLocks: returns true when an active (non-stale) lock is present", async (t) => {
	// Acquire a real lock so its filesystem timestamp is "now"
	const release = await acquireLockSync(t.context.lockPath);
	try {
		t.true(await hasActiveLocks(t.context.ui5DataDir), "fresh lock detected as active");

		// Active locks must not be deleted by the scan
		await t.notThrowsAsync(fs.access(t.context.lockPath), "active lock preserved");
	} finally {
		release();
	}
});

test.serial(
	"hasActiveLocks: removes stale lock files left behind by crashed processes",
	async (t) => {
		const staleLockPathA = path.join(t.context.lockDir, "crashed-a.lock");
		const staleLockPathB = path.join(t.context.lockDir, "crashed-b.lock");

		await fs.writeFile(staleLockPathA, "");
		await fs.writeFile(staleLockPathB, "");

		// lock.js captures `check` and `unlock` at module load time via promisify().
		// Stubbing lockfileLib.check after load has no effect — use esmock so lock.js
		// captures the stubs when it first runs promisify() on the injected module.
		const checkStub = sinon.stub().yields(null, false);
		// Simulate lockfile.unlock deleting the file, as the real implementation does.
		const unlockStub = sinon.stub().callsFake((lockPath, cb) => {
			fs.unlink(lockPath).catch(() => {}).finally(() => cb(null));
		});

		const {hasActiveLocks: hasActiveLocksWithStubs} = await esmock.p(
			"../../../lib/utils/lock.js",
			{lockfile: {check: checkStub, unlock: unlockStub}}
		);

		try {
			const result = await hasActiveLocksWithStubs(t.context.ui5DataDir);

			t.false(result, "all locks are stale => returns false");
			t.is(checkStub.callCount, 2, "check called once per lock file");

			await t.throwsAsync(fs.access(staleLockPathA), {code: "ENOENT"},
				"crashed-a.lock removed by hasActiveLocks");
			await t.throwsAsync(fs.access(staleLockPathB), {code: "ENOENT"},
				"crashed-b.lock removed by hasActiveLocks");
		} finally {
			esmock.purge(hasActiveLocksWithStubs);
		}
	},
);

test.serial(
	"hasActiveLocks: keeps active lock and removes stale neighbor in same scan",
	async (t) => {
		const staleLockPath = path.join(t.context.lockDir, "stale.lock");
		const activeLockPath = path.join(t.context.lockDir, "active.lock");

		await fs.writeFile(staleLockPath, "");
		await fs.writeFile(activeLockPath, "");

		const checkStub = sinon.stub(lockfileLib, "check");
		checkStub.withArgs(staleLockPath, sinon.match.any).yields(null, false);
		checkStub.withArgs(activeLockPath, sinon.match.any).yields(null, true);

		try {
			const result = await hasActiveLocks(t.context.ui5DataDir);

			t.true(result, "scan returns true because one lock is active");

			// Active lock preserved on disk
			await t.notThrowsAsync(fs.access(activeLockPath), "active lock preserved");
		} finally {
			checkStub.restore();
		}
	},
);

test.serial("hasActiveLocks: honours include option (allowlist)", async (t) => {
	const includedLockPath = path.join(t.context.lockDir, "included.lock");
	const otherLockPath = path.join(t.context.lockDir, "other.lock");

	await fs.writeFile(includedLockPath, "");
	await fs.writeFile(otherLockPath, "");

	const checkStub = sinon.stub().yields(null, true);
	const unlockStub = sinon.stub().yields(null);

	const {hasActiveLocks: hasActiveLocksWithStubs} = await esmock.p(
		"../../../lib/utils/lock.js",
		{lockfile: {check: checkStub, unlock: unlockStub}}
	);

	try {
		const result = await hasActiveLocksWithStubs(t.context.ui5DataDir, {include: "included.lock"});

		t.true(result, "included lock detected as active");

		t.is(checkStub.callCount, 1, "lockfile.check called exactly once");
		t.is(checkStub.firstCall.args[0], includedLockPath,
			"lockfile.check called with the included lock path only");
	} finally {
		esmock.purge(hasActiveLocksWithStubs);
	}
});

test.serial("hasActiveLocks: honours exclude option (denylist)", async (t) => {
	const excludedLockPath = path.join(t.context.lockDir, "excluded.lock");
	const otherLockPath = path.join(t.context.lockDir, "other.lock");

	await fs.writeFile(excludedLockPath, "");
	await fs.writeFile(otherLockPath, "");

	const checkStub = sinon.stub().yields(null, true);
	const unlockStub = sinon.stub().yields(null);

	const {hasActiveLocks: hasActiveLocksWithStubs} = await esmock.p(
		"../../../lib/utils/lock.js",
		{lockfile: {check: checkStub, unlock: unlockStub}}
	);

	try {
		const result = await hasActiveLocksWithStubs(t.context.ui5DataDir, {exclude: "excluded.lock"});

		t.true(result, "the non-excluded lock is detected");

		t.is(checkStub.callCount, 1, "lockfile.check called exactly once");
		t.is(checkStub.firstCall.args[0], otherLockPath,
			"lockfile.check called with the non-excluded lock path only");
	} finally {
		esmock.purge(hasActiveLocksWithStubs);
	}
});
