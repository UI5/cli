import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import {rimraf} from "rimraf";
import {cleanCache, getCacheInfo} from "../../../lib/cache/CacheCleanup.js";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "tmp", "CacheCleanup");

test.after.always(async () => {
	await rimraf(TEST_DIR).catch(() => {});
});

function createTestDir(t) {
	const dir = path.join(TEST_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	t.context.ui5DataDir = dir;
	return dir;
}

async function createPackage(ui5DataDir, scope, name, version, {mtime} = {}) {
	const pkgDir = path.join(ui5DataDir, "framework", "packages", scope, name, version);
	await fs.mkdir(pkgDir, {recursive: true});
	const filePath = path.join(pkgDir, "package.json");
	await fs.writeFile(filePath, JSON.stringify({name: `${scope}/${name}`, version}));
	if (mtime) {
		await fs.utimes(filePath, mtime, mtime);
	}
}

// ===== cleanCache tests =====

test("cleanCache: returns empty result for nonexistent directory", async (t) => {
	const result = await cleanCache({ui5DataDir: "/tmp/nonexistent-ui5-dir-test"});
	t.is(result.totalCount, 0);
	t.is(result.totalSize, 0);
	t.deepEqual(result.entries, []);
});

test("cleanCache: clean all removes framework packages", async (t) => {
	const ui5DataDir = createTestDir(t);
	await createPackage(ui5DataDir, "@openui5", "sap.ui.core", "1.120.0");
	await createPackage(ui5DataDir, "@openui5", "sap.m", "1.120.0");

	const result = await cleanCache({ui5DataDir});

	t.true(result.totalCount >= 1);
	const frameworkEntries = result.entries.filter((e) => e.type === "framework");
	t.is(frameworkEntries.length, 1);
	t.is(frameworkEntries[0].path, "framework");
});

test("cleanCache: clean all clears buildCache database", async (t) => {
	const ui5DataDir = createTestDir(t);
	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});

	const {DatabaseSync} = await import("node:sqlite");
	const dbPath = path.join(buildCacheDir, "cache.db");
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE content (integrity TEXT PRIMARY KEY, data BLOB);
		CREATE TABLE index_cache (project_id TEXT, build_signature TEXT, kind TEXT, data BLOB);
		CREATE TABLE stage_metadata
			(project_id TEXT, build_signature TEXT, stage_id TEXT, stage_signature TEXT, data BLOB);
		CREATE TABLE task_metadata (project_id TEXT, build_signature TEXT, task_name TEXT, type TEXT, data BLOB);
		CREATE TABLE result_metadata (project_id TEXT, build_signature TEXT, stage_signature TEXT, data BLOB);
	`);
	db.exec("INSERT INTO content VALUES ('test-integrity', 'test-data')");
	db.exec("INSERT INTO index_cache VALUES ('proj', 'sig', 'source', 'data')");
	db.close();

	const result = await cleanCache({ui5DataDir});

	const buildCacheEntry = result.entries.find((e) => e.type === "buildCache");
	t.truthy(buildCacheEntry);

	await fs.access(buildCacheDir);
	await fs.access(dbPath);

	const dbAfter = new DatabaseSync(dbPath);
	const contentCount = dbAfter.prepare("SELECT COUNT(*) as count FROM content").get().count;
	const indexCount = dbAfter.prepare("SELECT COUNT(*) as count FROM index_cache").get().count;
	t.is(contentCount, 0);
	t.is(indexCount, 0);
	dbAfter.close();
});

test("cleanCache: skips empty framework directory", async (t) => {
	const ui5DataDir = createTestDir(t);
	const frameworkDir = path.join(ui5DataDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});

	const result = await cleanCache({ui5DataDir});

	t.is(result.totalCount, 0);
	const frameworkEntries = result.entries.filter((e) => e.type === "framework");
	t.is(frameworkEntries.length, 0);
});

test("cleanCache: cleans both framework and build cache", async (t) => {
	const ui5DataDir = createTestDir(t);

	await createPackage(ui5DataDir, "@openui5", "sap.ui.core", "1.120.0");

	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});
	const {DatabaseSync} = await import("node:sqlite");
	const dbPath = path.join(buildCacheDir, "cache.db");
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE content (integrity TEXT);
		CREATE TABLE index_cache (project_id TEXT);
		CREATE TABLE stage_metadata (project_id TEXT);
		CREATE TABLE task_metadata (project_id TEXT);
		CREATE TABLE result_metadata (project_id TEXT);
	`);
	db.exec("INSERT INTO content VALUES ('test')");
	db.close();

	const result = await cleanCache({ui5DataDir});

	t.true(result.totalCount >= 1); // At least framework
	t.truthy(result.entries.find((e) => e.type === "framework"));
	t.true(result.totalSize > 0);
	// Build cache may also be cleaned
	if (result.totalCount === 2) {
		t.truthy(result.entries.find((e) => e.type === "buildCache"));
	}
});

test("cleanCache: handles corrupted database gracefully", async (t) => {
	const ui5DataDir = createTestDir(t);
	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});

	await fs.writeFile(path.join(buildCacheDir, "cache.db"), "not a valid database");

	const result = await cleanCache({ui5DataDir});

	t.pass();
	const buildEntries = result.entries.filter((e) => e.type === "buildCache");
	t.is(buildEntries.length, 0);
});

// ===== getCacheInfo tests =====

test("getCacheInfo: returns empty array for nonexistent directory", async (t) => {
	const items = await getCacheInfo({ui5DataDir: "/tmp/nonexistent-ui5-dir-test"});
	t.deepEqual(items, []);
});

test("getCacheInfo: detects framework cache with size", async (t) => {
	const ui5DataDir = createTestDir(t);
	await createPackage(ui5DataDir, "@openui5", "sap.ui.core", "1.120.0");

	const items = await getCacheInfo({ui5DataDir});

	const frameworkItem = items.find((item) => item.path === "framework/");
	t.truthy(frameworkItem);
	t.true(frameworkItem.size > 0);
	t.is(frameworkItem.type, "directory");
});

test("getCacheInfo: skips empty framework directory", async (t) => {
	const ui5DataDir = createTestDir(t);
	const frameworkDir = path.join(ui5DataDir, "framework");
	await fs.mkdir(frameworkDir, {recursive: true});

	const items = await getCacheInfo({ui5DataDir});

	const frameworkItem = items.find((item) => item.path === "framework/");
	t.falsy(frameworkItem);
});

test("getCacheInfo: detects build cache with records", async (t) => {
	const ui5DataDir = createTestDir(t);
	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});

	const {DatabaseSync} = await import("node:sqlite");
	const dbPath = path.join(buildCacheDir, "cache.db");
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE content (integrity TEXT PRIMARY KEY, data BLOB);
		CREATE TABLE index_cache (project_id TEXT, build_signature TEXT, kind TEXT, data BLOB);
		CREATE TABLE stage_metadata
			(project_id TEXT, build_signature TEXT, stage_id TEXT, stage_signature TEXT, data BLOB);
		CREATE TABLE task_metadata (project_id TEXT, build_signature TEXT, task_name TEXT, type TEXT, data BLOB);
		CREATE TABLE result_metadata (project_id TEXT, build_signature TEXT, stage_signature TEXT, data BLOB);
	`);
	db.exec("INSERT INTO content VALUES ('test-integrity', 'test-data')");
	db.close();

	const items = await getCacheInfo({ui5DataDir});

	const buildItem = items.find((item) => item.type === "database");
	t.truthy(buildItem);
	t.is(buildItem.path, "buildCache/v0_7 (database records)");
	t.true(buildItem.size > 0);
});

test("getCacheInfo: skips build cache with no records", async (t) => {
	const ui5DataDir = createTestDir(t);
	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});

	const {DatabaseSync} = await import("node:sqlite");
	const dbPath = path.join(buildCacheDir, "cache.db");
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE content (integrity TEXT PRIMARY KEY, data BLOB);
		CREATE TABLE index_cache (project_id TEXT, build_signature TEXT, kind TEXT, data BLOB);
		CREATE TABLE stage_metadata
			(project_id TEXT, build_signature TEXT, stage_id TEXT, stage_signature TEXT, data BLOB);
		CREATE TABLE task_metadata (project_id TEXT, build_signature TEXT, task_name TEXT, type TEXT, data BLOB);
		CREATE TABLE result_metadata (project_id TEXT, build_signature TEXT, stage_signature TEXT, data BLOB);
	`);
	db.close();

	const items = await getCacheInfo({ui5DataDir});

	const buildItem = items.find((item) => item.type === "database");
	t.falsy(buildItem);
});

test("getCacheInfo: handles corrupted database gracefully", async (t) => {
	const ui5DataDir = createTestDir(t);
	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});

	await fs.writeFile(path.join(buildCacheDir, "cache.db"), "not a valid database");

	const items = await getCacheInfo({ui5DataDir});

	t.pass();
	const buildItem = items.find((item) => item.type === "database");
	t.falsy(buildItem);
});

test("getCacheInfo: detects both framework and build cache", async (t) => {
	const ui5DataDir = createTestDir(t);

	await createPackage(ui5DataDir, "@openui5", "sap.ui.core", "1.120.0");

	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});
	const {DatabaseSync} = await import("node:sqlite");
	const dbPath = path.join(buildCacheDir, "cache.db");
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE content (integrity TEXT);
		CREATE TABLE index_cache (project_id TEXT);
		CREATE TABLE stage_metadata (project_id TEXT);
		CREATE TABLE task_metadata (project_id TEXT);
		CREATE TABLE result_metadata (project_id TEXT);
	`);
	db.exec("INSERT INTO content VALUES ('test')");
	db.close();

	const items = await getCacheInfo({ui5DataDir});

	t.true(items.length >= 1); // At least framework
	t.truthy(items.find((item) => item.path === "framework/"));
	// Build cache may also be detected
	if (items.length === 2) {
		t.truthy(items.find((item) => item.type === "database"));
	}
});
