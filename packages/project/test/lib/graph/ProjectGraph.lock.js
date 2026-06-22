import path from "node:path";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import test from "ava";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";

const lockfileLock = promisify(lockfileLib.lock);
const lockfileUnlock = promisify(lockfileLib.unlock);

const applicationAPath = path.join(
	import.meta.dirname, "..", "..", "fixtures", "application.a"
);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "tmp", "graph-lock");

test.beforeEach(async (t) => {
	const testDir = path.join(TEST_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
});

// ─── build() lock ─────────────────────────────────────────────────────────────

test.serial("build(): lock file exists during build and is removed after", async (t) => {
	const graph = await graphFromPackageDependencies({
		cwd: applicationAPath,
		resolveFrameworkDependencies: false
	});

	const expectedLockPath = path.join(
		t.context.testDir, "locks", `build-${process.pid}.lock`);

	let lockExistedDuringBuild = false;
	// Wrap lockfile.lock to check the file exists while the callback executes
	const origLock = lockfileLib.lock;
	lockfileLib.lock = function(lockPath, opts, cb) {
		if (lockPath === expectedLockPath) {
			return origLock.call(this, lockPath, opts, async (err) => {
				if (!err) {
					lockExistedDuringBuild =
						await fs.access(expectedLockPath).then(() => true, () => false);
				}
				cb(err);
			});
		}
		return origLock.call(this, lockPath, opts, cb);
	};

	try {
		await graph.build({
			destPath: path.join(t.context.testDir, "dist"),
			ui5DataDir: t.context.testDir
		});
	} finally {
		lockfileLib.lock = origLock;
	}

	t.true(lockExistedDuringBuild, "lock file existed while build ran");
	await t.throwsAsync(fs.access(expectedLockPath),
		{code: "ENOENT"}, "lock file removed after successful build");
});

test.serial("build(): lock prevents concurrent cache clean", async (t) => {
	const lockDir = path.join(t.context.testDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});

	const lockPath = path.join(lockDir, `build-${process.pid}.lock`);
	await lockfileLock(lockPath, {stale: 60000});

	try {
		const {hasActiveLocks, getLockDir} = await import("../../../lib/utils/lock.js");
		t.true(await hasActiveLocks(getLockDir(t.context.testDir)),
			"hasActiveLocks returns true while build lock is held");
	} finally {
		await lockfileUnlock(lockPath).catch(() => {});
	}
});

// ─── serve() lock ─────────────────────────────────────────────────────────────

test.serial("serve(): lock file exists while server runs and is removed on destroy", async (t) => {
	const graph = await graphFromPackageDependencies({
		cwd: applicationAPath,
		resolveFrameworkDependencies: false
	});

	const buildServer = await graph.serve({ui5DataDir: t.context.testDir});

	// A server-{pid}-{hex}.lock file must exist in the locks directory
	const lockDir = path.join(t.context.testDir, "locks");
	const lockFiles = await fs.readdir(lockDir);
	const serverLocks = lockFiles.filter((f) => f.startsWith(`server-${process.pid}-`) && f.endsWith(".lock"));
	t.is(serverLocks.length, 1, "exactly one server lock file exists while server is running");

	await buildServer.destroy();

	// Lock file removed after destroy
	const lockFilesAfter = await fs.readdir(lockDir).catch(() => []);
	const serverLocksAfter = lockFilesAfter.filter(
		(f) => f.startsWith(`server-${process.pid}-`) && f.endsWith(".lock"));
	t.is(serverLocksAfter.length, 0, "lock file removed after buildServer.destroy()");
});

test.serial("serve(): lock prevents concurrent cache clean while running", async (t) => {
	const lockDir = path.join(t.context.testDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});

	// Simulate a running server with a server-{pid}-{hex}.lock file
	const lockPath = path.join(lockDir, `server-${process.pid}-abcd1234.lock`);
	await lockfileLock(lockPath, {stale: 60000});

	try {
		const {hasActiveLocks, getLockDir} = await import("../../../lib/utils/lock.js");
		t.true(await hasActiveLocks(getLockDir(t.context.testDir)),
			"hasActiveLocks returns true while server lock is held");
	} finally {
		await lockfileUnlock(lockPath).catch(() => {});
	}
});
