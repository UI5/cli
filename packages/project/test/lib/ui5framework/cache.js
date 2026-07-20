import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import sinon from "sinon";
import esmock from "esmock";
import {getCacheInfo, cleanCache, cleanAdditional} from "../../../lib/ui5Framework/cache.js";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "tmp", "ui5framework-cache");

test.beforeEach(async (t) => {
	const testDir = path.join(TEST_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(testDir, {recursive: true});
	t.context.testDir = testDir;
});

test.afterEach.always(async (t) => {
	await fs.rm(t.context.testDir, {recursive: true, force: true});
	sinon.restore();
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

test("cleanCache: does not include orphaned field in result", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const result = await cleanCache(t.context.testDir);

	t.truthy(result);
	t.false(Object.prototype.hasOwnProperty.call(result, "orphaned"),
		"cleanCache result does not include orphaned — use cleanAdditional for that");
});

test("cleanCache: does not remove orphaned staging dirs — that is cleanAdditional's job", async (t) => {
	await mkPackage(t.context.testDir, "@openui5", "sap.m", "1.120.0");

	const orphanDir = path.join(t.context.testDir, ".framework_to_delete_abcd");
	await mkPackageIn(orphanDir, "@openui5", "sap.ui.core", "1.100.0");

	await cleanCache(t.context.testDir);

	// Orphan is still present after cleanCache — cleanAdditional handles it
	await t.notThrowsAsync(fs.access(orphanDir), "orphaned dir is not touched by cleanCache");
});

// ─── cleanAdditional ──────────────────────────────────────────────────────────

test("cleanAdditional: returns empty array when no orphaned staging dirs exist", async (t) => {
	const result = await cleanAdditional(t.context.testDir);
	t.deepEqual(result, []);
});

test("cleanAdditional: detects and removes orphaned staging dirs, reports them", async (t) => {
	const orphanDir = path.join(t.context.testDir, ".framework_to_delete_abcd");
	await mkPackageIn(orphanDir, "@openui5", "sap.ui.core", "1.100.0");
	await mkPackageIn(orphanDir, "@openui5", "sap.ui.core", "1.110.0");

	const result = await cleanAdditional(t.context.testDir);

	t.is(result.length, 1, "one orphaned dir reported");
	const orphanResult = result[0];
	t.true(orphanResult.path.startsWith(".framework_to_delete_"), "orphan path has staging prefix");
	t.is(orphanResult.libraryCount, 1);
	t.is(orphanResult.versionCount, 2);

	await t.throwsAsync(fs.access(orphanDir), {code: "ENOENT"}, "orphaned staging dir removed");
});

test("cleanAdditional: removes multiple orphaned staging dirs and reports each", async (t) => {
	const orphan1 = path.join(t.context.testDir, ".framework_to_delete_1111");
	const orphan2 = path.join(t.context.testDir, ".framework_to_delete_2222");

	await mkPackageIn(orphan1, "@openui5", "sap.m", "1.90.0");
	await mkPackageIn(orphan2, "@openui5", "sap.ui.core", "1.91.0");
	await mkPackageIn(orphan2, "@openui5", "sap.ui.core", "1.92.0");

	const result = await cleanAdditional(t.context.testDir);

	t.is(result.length, 2, "two orphaned dirs reported");

	const sorted = [...result].sort((a, b) => a.path.localeCompare(b.path));
	t.is(sorted[0].libraryCount, 1);
	t.is(sorted[0].versionCount, 1);
	t.is(sorted[1].libraryCount, 1);
	t.is(sorted[1].versionCount, 2);

	await t.throwsAsync(fs.access(orphan1), {code: "ENOENT"});
	await t.throwsAsync(fs.access(orphan2), {code: "ENOENT"});
});

test("cleanAdditional: orphaned dir deletion failure is non-fatal", async (t) => {
	const orphanDir = path.join(t.context.testDir, ".framework_to_delete_fail");
	await mkPackageIn(orphanDir, "@openui5", "sap.m", "1.80.0");

	const rmStub = sinon.stub().callsFake(async (p, opts) => {
		if (p === orphanDir) {
			throw new Error("simulated deletion failure");
		}
		return fs.rm(p, opts);
	});

	const {cleanAdditional: cleanAdditionalMocked} = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rm: rmStub}}
	);

	try {
		const result = await t.notThrowsAsync(cleanAdditionalMocked(t.context.testDir));
		t.truthy(result, "cleanAdditional completes despite orphan deletion failure");
	} finally {
		esmock.purge(cleanAdditionalMocked);
		await fs.rm(orphanDir, {recursive: true, force: true}).catch(() => {});
	}
});

