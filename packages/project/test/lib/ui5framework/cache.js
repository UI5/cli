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

// ─── Helper ──────────────────────────────────────────────────────────────────

async function mkPackage(testDir, project, library, version) {
	const dir = path.join(testDir, "framework", "packages", project, library, version);
	await fs.mkdir(dir, {recursive: true});
	await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({name: `${project}/${library}`, version}));
}

// ─── getCacheInfo ─────────────────────────────────────────────────────────────

test("getCacheInfo: non-existent framework directory returns null", async (t) => {
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: framework dir exists but no packages/ subdir returns null", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "cacache"), {recursive: true});
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: packages/ exists but is empty returns null", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "packages"), {recursive: true});
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: counts libraries and versions", async (t) => {
	// 2 unique library names across 2 scopes, 3 unique versions
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.148.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 2); // sap.m counted once (deduplicated across scopes)
	t.is(result.versionCount, 3); // 1.120.0, 1.148.0, 1.38.1
});

test("getCacheInfo: deduplicates library names across scopes", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.libraryCount, 1); // sap.m is the same library regardless of scope
	t.is(result.versionCount, 2); // 1.120.0 and 1.38.1
});

test("getCacheInfo: deduplicates versions across libraries", async (t) => {
	// Both libraries have 1.120.0 — version should count once
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.120.0");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 1); // 1.120.0 deduplicated
});

test("getCacheInfo: single library and version", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.libraryCount, 1);
	t.is(result.versionCount, 1);
});

// ─── cleanCache ───────────────────────────────────────────────────────────────

test("cleanCache: returns null for non-existent framework directory", async (t) => {
	const result = await cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: returns null when packages/ has no installed libraries", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "packages"), {recursive: true});
	const result = await cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: removes framework directory and returns stats", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.148.0");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 2); // 1.120.0, 1.148.0

	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: removes directory with multiple scopes", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.libraryCount, 1); // sap.m deduplicated
	t.is(result.versionCount, 2);

	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: throws when active lockfiles exist", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const lockDir = path.join(t.context.testDir, "framework", "locks");
	await fs.mkdir(lockDir, {recursive: true});

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
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const lockDir = path.join(t.context.testDir, "framework", "locks");
	await fs.mkdir(lockDir, {recursive: true});

	// lockfile.check uses ctime — fs.utimes only changes mtime, so backdating mtime won't work.
	const lockPath = path.join(lockDir, "stale-package.lock");
	await lockfileLock(lockPath, {stale: 50}); // stale after 50ms
	await lockfileUnlock(lockPath); // unlock so ctime stops being "now" — file still exists on disk
	await new Promise((resolve) => setTimeout(resolve, 100));

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 1);
	t.is(result.versionCount, 1);

	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: holds cleanup lock during deletion", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const lockDir = path.join(t.context.testDir, "framework", "locks");
	let lockObservedBeforeCompletion = false;

	// Start cleanCache without awaiting — run the lock check in parallel
	const cleanPromise = cleanCache(t.context.testDir);

	// Poll for the cleanup lock to appear, with a short delay between attempts
	for (let i = 0; i < 50; i++) {
		await new Promise((resolve) => setTimeout(resolve, 20));
		try {
			const entries = await fs.readdir(lockDir);
			if (entries.some((name) => name === "cache-cleanup.lock")) {
				lockObservedBeforeCompletion = true;
				break;
			}
		} catch {
			// locks/ not created yet
		}
	}

	const result = await cleanPromise;
	t.truthy(result);
	t.true(lockObservedBeforeCompletion, "cache-cleanup.lock was present during deletion");

	// After completion: framework/ is fully removed
	const frameworkDir = path.join(t.context.testDir, "framework");
	await t.throwsAsync(fs.access(frameworkDir));
});
