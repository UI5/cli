import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {getCacheInfo, cleanCache} from "../../../lib/ui5Framework/cache.js";

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
	t.is(result.type, "directory");
	t.true(result.size > 0);
});

test("getCacheInfo: returns null for empty framework directory", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});

	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: calculates size recursively", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	const subDir = path.join(frameworkDir, "packages");
	await fs.mkdir(subDir, {recursive: true});
	await fs.writeFile(path.join(frameworkDir, "file1.txt"), "test1");
	await fs.writeFile(path.join(subDir, "file2.txt"), "test2");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.true(result.size >= 10); // At least 5 + 5 bytes
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
	t.is(result.type, "framework");
	t.true(result.size > 0);

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

	// Verify directory and subdirectories were removed
	await t.throwsAsync(fs.access(frameworkDir));
});
