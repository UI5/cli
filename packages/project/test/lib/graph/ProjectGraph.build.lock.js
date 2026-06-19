import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import sinon from "sinon";
import lockfileLib from "lockfile";
import test from "ava";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";

const lockfileLock = promisify(lockfileLib.lock);
const lockfileUnlock = promisify(lockfileLib.unlock);

const applicationAPath = path.join(
	import.meta.dirname, "..", "..", "fixtures", "application.a"
);

test.beforeEach(async (t) => {
	const testDir = path.join(os.tmpdir(), `ui5-graph-lock-test-${Date.now()}-${Math.random()}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
});

test.afterEach.always(async (t) => {
	sinon.restore();
	if (t.context.testDir) {
		await fs.rm(t.context.testDir, {recursive: true, force: true});
	}
});

test("build(): creates build-{pid}.lock in the locks directory", async (t) => {
	const graph = await graphFromPackageDependencies({
		cwd: applicationAPath,
		resolveFrameworkDependencies: false
	});

	const lockDir = path.join(t.context.testDir, "locks");
	const expectedLockPath = path.join(lockDir, `build-${process.pid}.lock`);

	// Spy on lockfile.lock to confirm it was called with the expected path
	// while still executing the real lock/unlock (callThrough)
	const lockSpy = sinon.spy(lockfileLib, "lock");

	await graph.build({
		destPath: path.join(t.context.testDir, "dist"),
		ui5DataDir: t.context.testDir
	});

	// Confirm lock was acquired with the correct path during the build
	t.true(lockSpy.calledOnce, "lockfile.lock called exactly once");
	t.is(lockSpy.firstCall.args[0], expectedLockPath,
		`lock file created at build-${process.pid}.lock`);

	// Confirm lock was released — file should be gone after build completes
	await t.throwsAsync(fs.access(expectedLockPath),
		{code: "ENOENT"}, "lock file removed after successful build");
});

test("build(): lock prevents concurrent cache clean", async (t) => {
	const lockDir = path.join(t.context.testDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});

	// Simulate a build in progress by placing a build lock
	const lockPath = path.join(lockDir, `build-${process.pid}.lock`);
	await lockfileLock(lockPath, {stale: 60000});

	try {
		const {hasActiveLocks, getLockDir} = await import("../../../lib/utils/lock.js");
		const locked = await hasActiveLocks(getLockDir(t.context.testDir));
		t.true(locked, "hasActiveLocks returns true while build lock is held");
	} finally {
		await lockfileUnlock(lockPath).catch(() => {});
	}
});
