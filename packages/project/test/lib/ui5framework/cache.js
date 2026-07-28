import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import sinon from "sinon";
import esmock from "esmock";
import FrameworkCache from "../../../lib/ui5Framework/cache.js";

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

async function mkPackageIn(baseDir, project, library, version) {
	const dir = path.join(baseDir, "packages", project, library, version);
	await fs.mkdir(dir, {recursive: true});
	await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({name: `${project}/${library}`, version}));
}

// ─── getCacheInfo ─────────────────────────────────────────────────────────────

test("getCacheInfo: non-existent framework directory returns null", async (t) => {
	const result = await FrameworkCache.getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: framework dir exists but no packages/ subdir returns null", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "cacache"), {recursive: true});
	const result = await FrameworkCache.getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: packages/ exists but is empty returns null", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "packages"), {recursive: true});
	const result = await FrameworkCache.getCacheInfo(t.context.testDir);
	t.is(result, null);
});

test("getCacheInfo: counts libraries and versions", async (t) => {
	// 2 unique library names across 2 scopes, 3 unique versions
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.ui.core", "1.120.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.ui.core", "1.148.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@sapui5", "sap.m", "1.38.1");

	const result = await FrameworkCache.getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 2); // sap.m counted once (deduplicated across scopes)
	t.is(result.versionCount, 3); // 1.120.0, 1.148.0, 1.38.1
});

test("getCacheInfo: deduplicates versions across libraries", async (t) => {
	// Both libraries have 1.120.0 — version should count once
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.ui.core", "1.120.0");

	const result = await FrameworkCache.getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 1); // 1.120.0 deduplicated
});

test("getCacheInfo: single library and version", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");

	const result = await FrameworkCache.getCacheInfo(t.context.testDir);
	t.truthy(result);
	t.is(result.libraryCount, 1);
	t.is(result.versionCount, 1);
});

test("getCacheInfo: skips unreadable subdirectories without throwing", async (t) => {
	const frameworkDir = path.join(t.context.testDir, "framework");
	await mkPackageIn(frameworkDir, "@openui5", "sap.m", "1.120.0");
	await mkPackageIn(frameworkDir, "@sapui5", "sap.ui.core", "1.110.0");

	const unreadableScopeDir = path.join(frameworkDir, "packages", "@sapui5");
	const readdirStub = sinon.stub().callsFake(async (dirPath, opts) => {
		if (dirPath === unreadableScopeDir) {
			const err = Object.assign(new Error("EACCES: permission denied, scandir"), {code: "EACCES"});
			throw err;
		}
		return fs.readdir(dirPath, opts);
	});

	const FrameworkCacheMocked = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, readdir: readdirStub}}
	);

	try {
		const result = await FrameworkCacheMocked.getCacheInfo(t.context.testDir);
		t.truthy(result);
		t.is(result.path, "framework");
		t.is(result.libraryCount, 1);
		t.is(result.versionCount, 1);
	} finally {
		esmock.purge(FrameworkCacheMocked);
	}
});

// ─── cleanCache ───────────────────────────────────────────────────────────────

test("cleanCache: returns null for non-existent framework directory", async (t) => {
	const result = await FrameworkCache.cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: returns null when packages/ has no installed libraries", async (t) => {
	await fs.mkdir(path.join(t.context.testDir, "framework", "packages"), {recursive: true});
	const result = await FrameworkCache.cleanCache(t.context.testDir);
	t.is(result, null);
});

test("cleanCache: renames then removes framework directory and returns stats", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.ui.core", "1.120.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.ui.core", "1.148.0");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const result = await FrameworkCache.cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.path, "framework");
	t.is(result.libraryCount, 2);
	t.is(result.versionCount, 2); // 1.120.0, 1.148.0

	// framework/ is gone — getCacheInfo returns null
	t.is(await FrameworkCache.getCacheInfo(t.context.testDir), null);

	// No stale removal dirs remain after a successful clean
	const entries = await fs.readdir(t.context.testDir);
	t.false(entries.some((e) => e.startsWith("_framework_to_delete_")),
		"no stale removal dirs remain after successful clean");

	// packages/ is gone
	await t.throwsAsync(fs.access(path.join(frameworkDir, "packages")));
});

test("cleanCache: removes directory with multiple scopes", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@sapui5", "sap.m", "1.38.1");

	const result = await FrameworkCache.cleanCache(t.context.testDir);

	t.truthy(result);
	t.is(result.libraryCount, 1); // sap.m deduplicated
	t.is(result.versionCount, 2);

	t.is(await FrameworkCache.getCacheInfo(t.context.testDir), null);
});

test("cleanCache: does not include stale field in result", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");

	const result = await FrameworkCache.cleanCache(t.context.testDir);

	t.truthy(result);
	t.false(Object.prototype.hasOwnProperty.call(result, "stale"),
		"cleanCache result does not include stale — use cleanAdditional for that");
});

test("cleanCache: does not remove stale removal dirs — that is cleanAdditional's job", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");

	const staleDir = path.join(t.context.testDir, "_framework_to_delete_abcd");
	await mkPackageIn(staleDir, "@openui5", "sap.ui.core", "1.100.0");

	await FrameworkCache.cleanCache(t.context.testDir);

	// Stale removal dir is still present after cleanCache — cleanAdditional handles it
	await t.notThrowsAsync(fs.access(staleDir), "stale removal dir is not touched by cleanCache");
});

// ─── cleanAdditional ──────────────────────────────────────────────────────────

test("cleanAdditional: returns empty array when no stale removal dirs exist", async (t) => {
	const result = await FrameworkCache.cleanAdditional(t.context.testDir);
	t.deepEqual(result, []);
});

test("cleanAdditional: detects and removes stale removal dirs, reports them", async (t) => {
	const staleDir = path.join(t.context.testDir, "_framework_to_delete_abcd");
	await mkPackageIn(staleDir, "@openui5", "sap.ui.core", "1.100.0");
	await mkPackageIn(staleDir, "@openui5", "sap.ui.core", "1.110.0");

	const result = await FrameworkCache.cleanAdditional(t.context.testDir);

	t.is(result.length, 1, "one stale removal dir reported");
	const staleResult = result[0];
	t.true(staleResult.path.startsWith("_framework_to_delete_"), "stale path has pending-removal prefix");
	t.is(staleResult.libraryCount, 1);
	t.is(staleResult.versionCount, 2);

	await t.throwsAsync(fs.access(staleDir), {code: "ENOENT"}, "stale removal dir removed");
});

test("cleanAdditional: removes multiple stale removal dirs and reports each", async (t) => {
	const stale1 = path.join(t.context.testDir, "_framework_to_delete_1111");
	const stale2 = path.join(t.context.testDir, "_framework_to_delete_2222");

	await mkPackageIn(stale1, "@openui5", "sap.m", "1.90.0");
	await mkPackageIn(stale2, "@openui5", "sap.ui.core", "1.91.0");
	await mkPackageIn(stale2, "@openui5", "sap.ui.core", "1.92.0");

	const result = await FrameworkCache.cleanAdditional(t.context.testDir);

	t.is(result.length, 2, "two stale removal dirs reported");

	const sorted = [...result].sort((a, b) => a.path.localeCompare(b.path));
	t.is(sorted[0].libraryCount, 1);
	t.is(sorted[0].versionCount, 1);
	t.is(sorted[1].libraryCount, 1);
	t.is(sorted[1].versionCount, 2);

	await t.throwsAsync(fs.access(stale1), {code: "ENOENT"});
	await t.throwsAsync(fs.access(stale2), {code: "ENOENT"});
});

test("cleanAdditional: stale removal dir deletion failure is non-fatal", async (t) => {
	const staleDir = path.join(t.context.testDir, "_framework_to_delete_fail");
	await mkPackageIn(staleDir, "@openui5", "sap.m", "1.80.0");

	const rmStub = sinon.stub().callsFake(async (p, opts) => {
		if (p === staleDir) {
			throw new Error("simulated deletion failure");
		}
		return fs.rm(p, opts);
	});

	const FrameworkCacheMocked = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rm: rmStub}}
	);

	try {
		const result = await FrameworkCacheMocked.cleanAdditional(t.context.testDir);
		t.deepEqual(result, [], "failed deletion is excluded from the returned list");
		await t.notThrowsAsync(fs.access(staleDir), "failed stale removal dir deletion keeps directory on disk");
	} finally {
		esmock.purge(FrameworkCacheMocked);
		await fs.rm(staleDir, {recursive: true, force: true}).catch(() => {});
	}
});

test("cleanAdditional: returns only successfully removed stale removal dirs", async (t) => {
	const staleOk = path.join(t.context.testDir, "_framework_to_delete_ok");
	const staleFail = path.join(t.context.testDir, "_framework_to_delete_fail");
	await mkPackageIn(staleOk, "@openui5", "sap.m", "1.80.0");
	await mkPackageIn(staleFail, "@openui5", "sap.ui.core", "1.81.0");

	const rmStub = sinon.stub().callsFake(async (p, opts) => {
		if (p === staleFail) {
			throw new Error("simulated deletion failure");
		}
		return fs.rm(p, opts);
	});

	const FrameworkCacheMocked = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rm: rmStub}}
	);

	try {
		const result = await FrameworkCacheMocked.cleanAdditional(t.context.testDir);
		t.is(result.length, 1);
		t.is(result[0].path, "_framework_to_delete_ok");

		await t.throwsAsync(fs.access(staleOk), {code: "ENOENT"});
		await t.notThrowsAsync(fs.access(staleFail));
	} finally {
		esmock.purge(FrameworkCacheMocked);
		await fs.rm(staleFail, {recursive: true, force: true}).catch(() => {});
	}
});

test("cleanCache: returns null if framework dir removed between check and rename (ENOENT race)", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const renameStub = sinon.stub().callsFake(async (oldPath, newPath) => {
		if (oldPath === frameworkDir) {
			const err = Object.assign(new Error("ENOENT: no such file or directory, rename"), {code: "ENOENT"});
			throw err;
		}
		return fs.rename(oldPath, newPath);
	});

	const FrameworkCacheMocked = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rename: renameStub}}
	);

	try {
		const result = await FrameworkCacheMocked.cleanCache(t.context.testDir);
		t.is(result, null, "returns null when directory is concurrently removed");
	} finally {
		esmock.purge(FrameworkCacheMocked);
		await fs.rm(frameworkDir, {recursive: true, force: true}).catch(() => {});
	}
});

test("cleanCache: re-throws non-ENOENT errors from fs.rename", async (t) => {
	await mkPackageIn(path.join(t.context.testDir, "framework"), "@openui5", "sap.m", "1.120.0");

	const frameworkDir = path.join(t.context.testDir, "framework");
	const renameStub = sinon.stub().callsFake(async (oldPath, newPath) => {
		if (oldPath === frameworkDir) {
			const err = Object.assign(new Error("EACCES: permission denied, rename"), {code: "EACCES"});
			throw err;
		}
		return fs.rename(oldPath, newPath);
	});

	const FrameworkCacheMocked = await esmock.p(
		"../../../lib/ui5Framework/cache.js",
		{"node:fs/promises": {...fs, rename: renameStub}}
	);

	try {
		const error = await t.throwsAsync(FrameworkCacheMocked.cleanCache(t.context.testDir));
		t.is(/** @type {NodeJS.ErrnoException} */ (error).code, "EACCES");
	} finally {
		esmock.purge(FrameworkCacheMocked);
		await fs.rm(frameworkDir, {recursive: true, force: true}).catch(() => {});
	}
});

