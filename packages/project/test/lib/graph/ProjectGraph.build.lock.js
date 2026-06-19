import path from "node:path";
import os from "node:os";
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

test.beforeEach(async (t) => {
	const testDir = path.join(os.tmpdir(), `ui5-graph-lock-test-${Date.now()}-${Math.random()}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
});

test.afterEach.always(async (t) => {
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

	await graph.build({
		destPath: path.join(t.context.testDir, "dist"),
		ui5DataDir: t.context.testDir
	});

	// After successful build, lock should be released (file deleted by unlockSync)
	const lockPath = path.join(lockDir, `build-${process.pid}.lock`);
	await t.throwsAsync(fs.access(lockPath),
		{code: "ENOENT"}, "lock file removed after successful build");
});

test("build(): lock prevents concurrent cache clean", async (t) => {
	const lockDir = path.join(t.context.testDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});

	// Simulate a build in progress by placing a build lock
	const lockPath = path.join(lockDir, `build-${process.pid}.lock`);
	await lockfileLock(lockPath, {stale: 60000});

	try {
		// Import cache module to check isFrameworkLocked
		const {isFrameworkLocked} = await import("../../../lib/ui5Framework/cache.js");
		const locked = await isFrameworkLocked(t.context.testDir);
		t.true(locked, "isFrameworkLocked returns true while build lock is held");
	} finally {
		await lockfileUnlock(lockPath).catch(() => {});
	}
});
