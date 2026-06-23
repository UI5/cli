import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import {promisify} from "node:util";
import lockfileLib from "lockfile";
import {getCacheInfo, cleanCache} from "../../../lib/ui5Framework/cache.js";

const lockfileLock = promisify(lockfileLib.lock);
const lockfileUnlock = promisify(lockfileLib.unlock);

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "tmp", "ui5framework-cache");

test.beforeEach(async (t) => {
	const testDir = path.join(TEST_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
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

	// packages/ is removed so a subsequent getCacheInfo returns null
	const packagesDir = path.join(frameworkDir, "packages");
	await t.throwsAsync(fs.access(packagesDir));
});

test("cleanCache: removes directory with multiple scopes", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");
	await mkPackage(t.context.testDir, "@sapui5", "sap.m", "1.38.1");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.libraryCount, 1); // sap.m deduplicated
	t.is(result.versionCount, 2);

	// packages/ is removed so a subsequent getCacheInfo returns null
	const packagesDir = path.join(frameworkDir, "packages");
	await t.throwsAsync(fs.access(packagesDir));
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

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 1);
	t.is(result.versionCount, 1);

	// packages/ is removed so a subsequent getCacheInfo returns null
	const packagesDir = path.join(frameworkDir, "packages");
	await t.throwsAsync(fs.access(packagesDir));
});
