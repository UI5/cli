import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getCacheInfo, cleanCache} from "../../../lib/ui5Framework/cache.js";

const lockfileLock = promisify(lockfileLib.lock);
const lockfileUnlock = promisify(lockfileLib.unlock);

test.beforeEach(async (t) => {
	const testDir = path.join(os.tmpdir(), `ui5-framework-cache-test-${Date.now()}-${Math.random()}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
});

test.afterEach.always(async (t) => {
	if (t.context.testDir) {
		await fs.rm(t.context.testDir, {recursive: true, force: true});
	}
});

test("getCacheInfo: empty directory returns null", async (t) => {
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: non-existent directory returns null", async (t) => {
	const nonExistent = path.join(t.context.testDir, "does-not-exist");
	const result = await getCacheInfo(nonExistent);
	t.is(result, null);
});

test("getCacheInfo: detects framework directory with files", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});
	await fs.writeFile(path.join(frameworkDir, "test.txt"), "content");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.path, "framework/");
	t.is(result.count, 1);
});

test("getCacheInfo: returns null for empty framework directory", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});

	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: counts files recursively", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	const subDir = path.join(frameworkDir, "packages");
	await fs.mkdir(subDir, {recursive: true});
	await fs.writeFile(path.join(frameworkDir, "file1.txt"), "test1");
	await fs.writeFile(path.join(subDir, "file2.txt"), "test2");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.count, 2);
});

test("cleanCache: returns null for non-existent directory", async (t) => {
	const result = await cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: returns null for empty directory", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});

	const result = await cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: removes framework directory", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});
	await fs.writeFile(path.join(frameworkDir, "test.txt"), "content");

	const result = await cleanCache(t.context.testDir);
	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.count, 1);

	// Verify directory was removed
	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: removes nested directories", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	const subDir = path.join(frameworkDir, "packages");
	await fs.mkdir(subDir, {recursive: true});
	await fs.writeFile(path.join(subDir, "test.txt"), "content");

	const result = await cleanCache(t.context.testDir);
	t.truthy(result);
	t.is(result.count, 1);

	// Verify directory and subdirectories were removed
	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: throws when active lockfiles exist", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	const lockDir = path.join(frameworkDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});
	await fs.writeFile(path.join(frameworkDir, "test.txt"), "content");

	const lockPath = path.join(lockDir, "test-package.lock");
	await lockfileLock(lockPath, {stale: 60000});
	try {
		const err = await t.throwsAsync(cleanCache(t.context.testDir));
		t.true(err.message.includes("currently locked by an active operation"));
	} finally {
		await lockfileUnlock(lockPath);
	}
});

test("cleanCache: removes directory when lockfiles are stale", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	const lockDir = path.join(frameworkDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});
	await fs.writeFile(path.join(frameworkDir, "test.txt"), "content");

	// Create a real lock with a very short stale threshold, then wait for it to expire.
	// lockfile.check uses ctime — fs.utimes only changes mtime, so backdating mtime won't work.
	const lockPath = path.join(lockDir, "stale-package.lock");
	await lockfileLock(lockPath, {stale: 50}); // stale after 50ms
	await lockfileUnlock(lockPath); // unlock so ctime stops being "now" — file still exists on disk
	// Wait long enough for the 50ms threshold to pass
	await new Promise((resolve) => setTimeout(resolve, 100));

	const result = await cleanCache(t.context.testDir);
	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.count, 1); // only test.txt remains — stale lock file is deleted by lockfileUnlock

	await t.throwsAsync(fs.access(frameworkDir));
});
