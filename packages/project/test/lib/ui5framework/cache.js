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
	// A real package directory has at least a package.json
	await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({name: `${project}/${library}`, version}));
}

// ─── getCacheInfo ─────────────────────────────────────────────────────────────

test("getCacheInfo: non-existent framework directory returns null", async (t) => {
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: framework dir exists but no packages/ subdir returns null", async (t) => {
	// cacache/ or staging/ without packages/ — nothing meaningful to show
	await fs.mkdir(path.join(t.context.testDir, "framework", "cacache"), {recursive: true});
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: packages/ exists but is empty returns null", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "packages"), {recursive: true});
	const result = await getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: counts projects, libraries and versions", async (t) => {
	// 2 projects, 2 unique library names, 3 unique versions
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.148.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.projectCount, 2);
	t.is(result.libraryCount, 2); // sap.m counted once (deduplicated across projects)
	t.is(result.versionCount, 3); // 1.120.0, 1.148.0, 1.38.1
});

test("getCacheInfo: deduplicates library names across projects", async (t) => {
	// sap.m appears under both projects — should count as 1 library
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.projectCount, 2);
	t.is(result.libraryCount, 1); // sap.m is the same library regardless of project
	t.is(result.versionCount, 2); // 1.120.0 and 1.38.1
});

test("getCacheInfo: deduplicates versions across libraries", async (t) => {
	// Both libraries have 1.120.0 — version should count once
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@openui5", "sap.ui.core", "1.120.0");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.projectCount, 1);
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 1); // 1.120.0 deduplicated
});

test("getCacheInfo: single project, library and version", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const result = await getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.projectCount, 1);
	t.is(result.libraryCount, 1);
	t.is(result.versionCount, 1);
});

// ─── cleanCache ───────────────────────────────────────────────────────────────

test("cleanCache: returns null for non-existent framework directory", async (t) => {
	const result = await cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: returns null when packages/ has no installed libraries", async (t) => {
	// Empty packages/ — nothing to report or delete
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
	t.is(result.projectCount, 1);
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 2); // 1.120.0, 1.148.0

	// Directory was removed
	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: removes directory with multiple projects", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.projectCount, 2);
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

	// Create a real lock with a very short stale threshold, then wait for it to expire.
	// lockfile.check uses ctime — fs.utimes only changes mtime, so backdating mtime won't work.
	const lockPath = path.join(lockDir, "stale-package.lock");
	await lockfileLock(lockPath, {stale: 50}); // stale after 50ms
	await lockfileUnlock(lockPath); // unlock so ctime stops being "now" — file still exists on disk
	// Wait long enough for the 50ms threshold to pass
	await new Promise((resolve) => setTimeout(resolve, 100));

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.projectCount, 1);
	t.is(result.libraryCount, 1);
	await t.throwsAsync(fs.access(frameworkDir));
});

test("cleanCache: holds cleanup lock during deletion so concurrent installers see it", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const lockDir = path.join(t.context.testDir, "framework", "locks");
	let lockObservedDuringDeletion = false;

	// Pass an onProgress callback that fires mid-deletion and checks for the cleanup lock
	const onProgress = async () => {
		if (lockObservedDuringDeletion) return; // check once is enough
		try {
			const entries = await fs.readdir(lockDir);
			if (entries.some((name) => name === "cache-cleanup.lock")) {
				lockObservedDuringDeletion = true;
			}
		} catch {
			// lockDir may not exist yet on the very first callback
		}
	};

	const result = await cleanCache(t.context.testDir, onProgress);
	t.truthy(result);
	t.true(lockObservedDuringDeletion, "cache-cleanup.lock was present during deletion");

	// After completion: framework/ is fully removed including the locks/ subdir
	const frameworkDir = path.join(t.context.testDir, "framework");
	await t.throwsAsync(fs.access(frameworkDir), undefined, "framework/ removed after unlock");
});
