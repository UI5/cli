import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import sinon from "sinon";
import esmock from "esmock";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getCacheInfo, cleanCache} from "../../../lib/ui5Framework/cache.js";
import {getLockDir, CLEANUP_LOCK_NAME} from "../../../lib/utils/lock.js";

const lockfileLock = promisify(lockfileLib.lock);
const lockfileUnlock = promisify(lockfileLib.unlock);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "tmp", "ui5framework-cache");

test.beforeEach(async (t) => {
	const testDir = path.join(TEST_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
});


// ─── Helpers ─────────────────────────────────────────────────────────────────

async function mkPackage(testDir, project, library, version) {
	const dir = path.join(testDir, "framework", "packages", project, library, version);
	await fs.mkdir(dir, {recursive: true});
	await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({name: `${project}/${library}`, version}));
}

async function mkPackageIn(baseDir, project, library, version) {
	const dir = path.join(baseDir, "packages", project, library, version);
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

test("cleanCache: renames then removes framework directory and returns stats", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.148.0");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 2); // 1.120.0, 1.148.0

	// framework/ is gone — getCacheInfo returns null
	t.is(await getCacheInfo(t.context.testDir), null);

	// No staging dirs remain after a successful clean
	const entries = await fs.readdir(t.context.testDir);
	t.false(entries.some((e) => e.startsWith(".framework_to_delete_")),
		"no staging dirs remain after successful clean");

	// packages/ is gone
	await t.throwsAsync(fs.access(path.join(frameworkDir, "packages")));
});

test("cleanCache: removes directory with multiple scopes", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.libraryCount, 1); // sap.m deduplicated
	t.is(result.versionCount, 2);

	t.is(await getCacheInfo(t.context.testDir), null);
});

test("cleanCache: returns empty orphaned array when no orphans exist", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.deepEqual(result.orphaned, [], "orphaned array is empty when no staging dirs exist");
});

test("cleanCache: throws when active lockfiles exist", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const lockDir = path.join(t.context.testDir, "locks");
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

	const lockDir = path.join(t.context.testDir, "locks");
	await fs.mkdir(lockDir, {recursive: true});

	// lockfile.check uses ctime — fs.utimes only changes mtime, so backdating mtime won't work.
	const lockPath = path.join(lockDir, "stale-package.lock");
	await lockfileLock(lockPath, {stale: 50}); // stale after 50ms
	await lockfileUnlock(lockPath); // unlock so ctime stops being "now" — file still exists on disk
	await new Promise((resolve) => setTimeout(resolve, 100));

	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 1);
	t.is(result.versionCount, 1);
	t.is(await getCacheInfo(t.context.testDir), null);
});

test("cleanCache: lock is released immediately after rename, before deletion completes", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const lockDir = getLockDir(t.context.testDir);
	const cleanupLockPath = path.join(lockDir, CLEANUP_LOCK_NAME);
	let lockReleasedBeforeDeletion = false;

	// Load a version of cleanCache with a stubbed fs.rm that checks the lock state
	// at the moment the staging dir deletion begins. Uses esmock so the stub is
	// injected into the module's own import — not a monkey-patch on the shared fs instance.
	const rmStub = sinon.stub().callsFake(async (p, opts) => {
		try {
			await fs.access(cleanupLockPath);
			// Lock file still exists — not yet released
		} catch {
			// Lock file is gone — released before deletion
			lockReleasedBeforeDeletion = true;
		}
		return fs.rm(p, opts);
	});

	const {cleanCache: cleanCacheMocked} = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rm: rmStub}}
	);

	try {
		await cleanCacheMocked(t.context.testDir);
	} finally {
		esmock.purge(cleanCacheMocked);
	}

	t.true(lockReleasedBeforeDeletion,
		"cleanup lock is released before the staging directory deletion begins");
});

// ─── cleanCache: orphaned staging dir handling ────────────────────────────────

test("cleanCache: detects and removes orphaned staging dirs, reports them in result", async (t) => {
	// The primary framework to clean
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	// Simulate a staging dir left by an interrupted previous clean
	const orphanDir = path.join(t.context.testDir, ".framework_to_delete_abcd");
	await mkPackageIn(orphanDir, "@openui5", "sap.ui.core", "1.100.0");
	await mkPackageIn(orphanDir, "@openui5", "sap.ui.core", "1.110.0");

	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");

	// Orphaned dir is reported in the result
	t.is(result.orphaned.length, 1, "one orphaned dir reported");
	const orphanResult = result.orphaned[0];
	t.true(orphanResult.path.startsWith(".framework_to_delete_"), "orphan path has staging prefix");
	t.is(orphanResult.libraryCount, 1);
	t.is(orphanResult.versionCount, 2);

	// Both directories are physically gone
	await t.throwsAsync(fs.access(orphanDir), {code: "ENOENT"}, "orphaned staging dir removed");
	await t.throwsAsync(fs.access(path.join(t.context.testDir, "framework")), {code: "ENOENT"},
		"primary framework dir removed");
});

test("cleanCache: removes multiple orphaned staging dirs and reports each", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const orphan1 = path.join(t.context.testDir, ".framework_to_delete_1111");
	const orphan2 = path.join(t.context.testDir, ".framework_to_delete_2222");

	await mkPackageIn(orphan1, "@openui5", "sap.m", "1.90.0");
	await mkPackageIn(orphan2, "@openui5", "sap.ui.core", "1.91.0");
	await mkPackageIn(orphan2, "@openui5", "sap.ui.core", "1.92.0");

	const result = await cleanCache(t.context.testDir);

	t.is(result.orphaned.length, 2, "two orphaned dirs reported");

	// Sort by path for deterministic assertions
	const sorted = [...result.orphaned].sort((a, b) => a.path.localeCompare(b.path));
	t.is(sorted[0].libraryCount, 1);
	t.is(sorted[0].versionCount, 1);
	t.is(sorted[1].libraryCount, 1);
	t.is(sorted[1].versionCount, 2);

	await t.throwsAsync(fs.access(orphan1), {code: "ENOENT"});
	await t.throwsAsync(fs.access(orphan2), {code: "ENOENT"});
});

test("cleanCache: orphaned dir deletion failure is non-fatal", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	// Create an orphan
	const orphanDir = path.join(t.context.testDir, ".framework_to_delete_fail");
	await mkPackageIn(orphanDir, "@openui5", "sap.m", "1.80.0");

	// Use esmock to inject an fs.rm stub that fails only for the orphan dir,
	// ensuring the stub intercepts calls inside cache.js (not the test's own fs binding).
	const rmStub = sinon.stub().callsFake(async (p, opts) => {
		if (p === orphanDir) {
			throw new Error("simulated deletion failure");
		}
		return fs.rm(p, opts);
	});

	const {cleanCache: cleanCacheMocked} = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rm: rmStub}}
	);

	try {
		// Should not throw — orphan deletion failure is swallowed
		const result = await t.notThrowsAsync(cleanCacheMocked(t.context.testDir));
		t.truthy(result, "cleanCache completes despite orphan deletion failure");
	} finally {
		esmock.purge(cleanCacheMocked);
		// Cleanup the orphan manually since the stub prevented deletion
		await fs.rm(orphanDir, {recursive: true, force: true}).catch(() => {});
	}
});
