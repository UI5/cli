import test from "ava";
import path from "node:path";
import fs from "node:fs/promises";
import {rimraf} from "rimraf";
import {cleanCache} from "../../../../lib/build/cache/CacheCleanup.js";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "CacheCleanup");

test.after.always(async () => {
	await rimraf(TEST_DIR).catch(() => {});
});

/**
 * Create a unique test directory for each test.
 *
 * @param {object} t AVA test context
 * @returns {string} Path to the ui5DataDir fixture
 */
function createTestDir(t) {
	const dir = path.join(TEST_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	t.context.ui5DataDir = dir;
	return dir;
}

/**
 * Create a framework package fixture.
 *
 * @param {string} ui5DataDir Base data directory
 * @param {string} scope Package scope (e.g., "@openui5")
 * @param {string} name Package name (e.g., "sap.ui.core")
 * @param {string} version Version string
 * @param {object} [options]
 * @param {Date} [options.mtime] Custom mtime for the package file
 * @returns {Promise<void>}
 */
async function createPackage(ui5DataDir, scope, name, version, {mtime} = {}) {
	const pkgDir = path.join(ui5DataDir, "framework", "packages", scope, name, version);
	await fs.mkdir(pkgDir, {recursive: true});
	const filePath = path.join(pkgDir, "package.json");
	await fs.writeFile(filePath, JSON.stringify({name: `${scope}/${name}`, version}));
	if (mtime) {
		await fs.utimes(filePath, mtime, mtime);
	}
}

// ===== cleanCache: empty/nonexistent dir =====

test("cleanCache: returns empty result for nonexistent directory", async (t) => {
	const result = await cleanCache({ui5DataDir: "/tmp/nonexistent-ui5-dir-test"});
	t.is(result.totalCount, 0);
	t.is(result.totalSize, 0);
	t.deepEqual(result.entries, []);
});

// ===== cleanCache: clean all =====

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

// ===== cleanCache: build cache (full clean) =====

test("cleanCache: clean all clears buildCache database", async (t) => {
	const ui5DataDir = createTestDir(t);
	const buildCacheDir = path.join(ui5DataDir, "buildCache", "v0_7");
	await fs.mkdir(buildCacheDir, {recursive: true});

	// Create a real SQLite database with tables and some data
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

	// Verify directory and DB file still exist
	await fs.access(buildCacheDir);
	await fs.access(dbPath);

	// Verify tables are empty
	const dbAfter = new DatabaseSync(dbPath);
	const contentCount = dbAfter.prepare("SELECT COUNT(*) as count FROM content").get().count;
	const indexCount = dbAfter.prepare("SELECT COUNT(*) as count FROM index_cache").get().count;
	t.is(contentCount, 0);
	t.is(indexCount, 0);
	dbAfter.close();
});
