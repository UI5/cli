import test from "ava";
import path from "node:path";
import fs from "node:fs";
import {rimraf} from "rimraf";
import {gunzipSync} from "node:zlib";
import BuildCacheStorage from "../../../../lib/build/cache/BuildCacheStorage.js";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "BuildCacheStorage");

test.after.always(async () => {
	await rimraf(TEST_DIR);
});

test.beforeEach((t) => {
	t.context.dbDir = path.join(TEST_DIR, `db-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	t.context.storage = new BuildCacheStorage(t.context.dbDir);
});

test.afterEach.always((t) => {
	try {
		t.context.storage.close();
	} catch {
		// Already closed
	}
});

// Database file creation

test("Creates cache.db in the specified directory", (t) => {
	const dbPath = path.join(t.context.dbDir, "cache.db");
	t.true(fs.existsSync(dbPath));
});

// ===== Content (CAS) operations =====

test("hasContent: Returns false for missing content", (t) => {
	t.false(t.context.storage.hasContent("sha256-missing"));
});

test("hasContent: Returns true after content is stored", (t) => {
	const content = Buffer.from("test content");
	t.context.storage.putContent("sha256-test", content);
	t.true(t.context.storage.hasContent("sha256-test"));
});

test("putContent + readContent: Round-trip", (t) => {
	const content = Buffer.from("hello world");
	t.context.storage.putContent("sha256-hello", content);
	const result = t.context.storage.readContent("sha256-hello");
	t.deepEqual(result, content);
});

test("putContent + readContentRaw: Returns gzip-compressed data", (t) => {
	const content = Buffer.from("compressed test");
	t.context.storage.putContent("sha256-compressed", content);
	const raw = t.context.storage.readContentRaw("sha256-compressed");
	t.notDeepEqual(raw, content);
	t.deepEqual(gunzipSync(raw), content);
});

test("putContent: Deduplicates via INSERT OR IGNORE", (t) => {
	const content1 = Buffer.from("original");
	t.context.storage.putContent("sha256-dedup", content1);
	// Second put with same integrity but different buffer is ignored
	const content2 = Buffer.from("different");
	t.context.storage.putContent("sha256-dedup", content2);
	const result = t.context.storage.readContent("sha256-dedup");
	t.deepEqual(result, content1);
});

test("readContent: Throws for missing integrity", (t) => {
	t.throws(() => t.context.storage.readContent("sha256-nonexistent"), {
		message: /Content not found in CAS for integrity/
	});
});

test("readContentRaw: Throws for missing integrity", (t) => {
	t.throws(() => t.context.storage.readContentRaw("sha256-nonexistent"), {
		message: /Content not found in CAS for integrity/
	});
});

test("putContent + readContent: Large content round-trip", (t) => {
	const content = Buffer.alloc(1024 * 1024);
	for (let i = 0; i < content.length; i++) {
		content[i] = i % 256;
	}
	t.context.storage.putContent("sha256-large", content);
	const result = t.context.storage.readContent("sha256-large");
	t.deepEqual(result, content);
});

// ===== Index cache =====

test("readIndexCache: Returns null on cache miss", (t) => {
	const result = t.context.storage.readIndexCache("project-a", "sig-1", "source");
	t.is(result, null);
});

test("Index cache: Round-trip write and read", (t) => {
	const data = {indexTimestamp: 1000, root: {name: "", type: "directory", hash: "abc"}};
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", data);
	const result = t.context.storage.readIndexCache("project-a", "sig-1", "source");
	t.deepEqual(result, data);
});

test("Index cache: Different kind values are independent", (t) => {
	const sourceData = {kind: "source", value: 1};
	const resultData = {kind: "result", value: 2};
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", sourceData);
	t.context.storage.writeIndexCache("project-a", "sig-1", "result", resultData);

	t.deepEqual(t.context.storage.readIndexCache("project-a", "sig-1", "source"), sourceData);
	t.deepEqual(t.context.storage.readIndexCache("project-a", "sig-1", "result"), resultData);
});

test("Index cache: Overwrite replaces data", (t) => {
	const original = {version: 1};
	const updated = {version: 2};
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", original);
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", updated);
	t.deepEqual(t.context.storage.readIndexCache("project-a", "sig-1", "source"), updated);
});

// ===== Stage metadata =====

test("readStageCache: Returns null on cache miss", (t) => {
	const result = t.context.storage.readStageCache("project-a", "sig-1", "task/minify", "stage-sig-1");
	t.is(result, null);
});

test("Stage metadata: Round-trip write and read", (t) => {
	const data = {resourceMetadata: {"/a.js": {integrity: "hash-a"}}};
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "stage-sig-1", data);
	const result = t.context.storage.readStageCache("project-a", "sig-1", "task/minify", "stage-sig-1");
	t.deepEqual(result, data);
});

test("Stage metadata: Different stage signatures are independent", (t) => {
	const data1 = {value: "first"};
	const data2 = {value: "second"};
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "stage-sig-1", data1);
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "stage-sig-2", data2);

	t.deepEqual(
		t.context.storage.readStageCache("project-a", "sig-1", "task/minify", "stage-sig-1"), data1
	);
	t.deepEqual(
		t.context.storage.readStageCache("project-a", "sig-1", "task/minify", "stage-sig-2"), data2
	);
});

test("Stage metadata: Stage IDs with slashes are stored correctly", (t) => {
	const data = {value: "slash-test"};
	t.context.storage.writeStageCache("project-a", "sig-1", "task/myTask", "stage-sig-1", data);
	t.deepEqual(
		t.context.storage.readStageCache("project-a", "sig-1", "task/myTask", "stage-sig-1"), data
	);
});

// ===== Task metadata =====

test("readTaskMetadata: Returns null on cache miss", (t) => {
	const result = t.context.storage.readTaskMetadata("project-a", "sig-1", "minify", "project");
	t.is(result, null);
});

test("Task metadata: Round-trip write and read", (t) => {
	const data = {requestSetGraph: {nodes: [], nextId: 1}};
	t.context.storage.writeTaskMetadata("project-a", "sig-1", "minify", "project", data);
	const result = t.context.storage.readTaskMetadata("project-a", "sig-1", "minify", "project");
	t.deepEqual(result, data);
});

test("Task metadata: Different types are independent", (t) => {
	const projectData = {scope: "project"};
	const depData = {scope: "dependency"};
	t.context.storage.writeTaskMetadata("project-a", "sig-1", "minify", "project", projectData);
	t.context.storage.writeTaskMetadata("project-a", "sig-1", "minify", "dependencies", depData);

	t.deepEqual(
		t.context.storage.readTaskMetadata("project-a", "sig-1", "minify", "project"), projectData
	);
	t.deepEqual(
		t.context.storage.readTaskMetadata("project-a", "sig-1", "minify", "dependencies"), depData
	);
});

// ===== Result metadata =====

test("readResultMetadata: Returns null on cache miss", (t) => {
	const result = t.context.storage.readResultMetadata("project-a", "sig-1", "result-sig-1");
	t.is(result, null);
});

test("Result metadata: Round-trip write and read", (t) => {
	const data = {stageSignatures: {"task/minify": "sig-abc"}};
	t.context.storage.writeResultMetadata("project-a", "sig-1", "result-sig-1", data);
	const result = t.context.storage.readResultMetadata("project-a", "sig-1", "result-sig-1");
	t.deepEqual(result, data);
});

test("Result metadata: Overwrite replaces data", (t) => {
	const original = {version: 1};
	const updated = {version: 2};
	t.context.storage.writeResultMetadata("project-a", "sig-1", "result-sig-1", original);
	t.context.storage.writeResultMetadata("project-a", "sig-1", "result-sig-1", updated);
	t.deepEqual(t.context.storage.readResultMetadata("project-a", "sig-1", "result-sig-1"), updated);
});

// ===== Cross-project isolation =====

test("Different projects are fully isolated", (t) => {
	const dataA = {project: "a"};
	const dataB = {project: "b"};
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", dataA);
	t.context.storage.writeIndexCache("project-b", "sig-1", "source", dataB);

	t.deepEqual(t.context.storage.readIndexCache("project-a", "sig-1", "source"), dataA);
	t.deepEqual(t.context.storage.readIndexCache("project-b", "sig-1", "source"), dataB);
});

// ===== Error handling =====

test("Read throws wrapped error after close", (t) => {
	t.context.storage.close();
	const err = t.throws(() => {
		t.context.storage.readIndexCache("project-a", "sig-1", "source");
	});
	t.true(err.message.includes("Failed to read resource index cache"));
	t.truthy(err.cause);
});

// ===== Metadata batch transactions =====

test("beginMetadataBatch/endMetadataBatch: Multiple writes commit atomically", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
	storage.writeTaskMetadata("project-a", "sig-1", "minify", "project", {v: 2});
	storage.writeResultMetadata("project-a", "sig-1", "result-sig-1", {v: 3});
	storage.endMetadataBatch();

	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
	t.deepEqual(storage.readTaskMetadata("project-a", "sig-1", "minify", "project"), {v: 2});
	t.deepEqual(storage.readResultMetadata("project-a", "sig-1", "result-sig-1"), {v: 3});
});

test("rollbackMetadataBatch: Discards uncommitted writes", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
	storage.writeTaskMetadata("project-a", "sig-1", "minify", "project", {v: 2});
	storage.rollbackMetadataBatch();

	t.is(storage.readIndexCache("project-a", "sig-1", "source"), null);
	t.is(storage.readTaskMetadata("project-a", "sig-1", "minify", "project"), null);
});

test("close: Rolls back uncommitted metadata batch", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
	storage.close();

	const fresh = new BuildCacheStorage(t.context.dbDir);
	t.is(fresh.readIndexCache("project-a", "sig-1", "source"), null);
	fresh.close();
});

test("beginMetadataBatch: Nested calls are idempotent", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
	storage.endMetadataBatch();

	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
});

// ===== Standalone content batch transactions =====

test("Standalone content batch: Commit persists content", (t) => {
	const {storage} = t.context;
	storage.beginContentBatch();
	storage.putContent("sha256-batch1", Buffer.from("batch item 1"));
	storage.putContent("sha256-batch2", Buffer.from("batch item 2"));
	storage.endContentBatch();

	t.deepEqual(storage.readContent("sha256-batch1"), Buffer.from("batch item 1"));
	t.deepEqual(storage.readContent("sha256-batch2"), Buffer.from("batch item 2"));
});

test("Standalone content batch: Rollback discards content", (t) => {
	const {storage} = t.context;
	storage.beginContentBatch();
	storage.putContent("sha256-rollback", Buffer.from("should be discarded"));
	storage.rollbackContentBatch();

	t.false(storage.hasContent("sha256-rollback"));
});

test("beginContentBatch: Nested calls are idempotent", (t) => {
	const {storage} = t.context;
	storage.beginContentBatch();
	storage.beginContentBatch();
	storage.putContent("sha256-idempotent", Buffer.from("idempotent"));
	storage.endContentBatch();

	t.deepEqual(storage.readContent("sha256-idempotent"), Buffer.from("idempotent"));
});

// ===== Nested content batch inside metadata batch (SAVEPOINT) =====

test("Nested content batch: Content persists when both batches commit", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});

	storage.beginContentBatch();
	storage.putContent("sha256-nested", Buffer.from("nested content"));
	storage.endContentBatch();

	storage.endMetadataBatch();

	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
	t.deepEqual(storage.readContent("sha256-nested"), Buffer.from("nested content"));
});

test("Nested content batch rollback: Metadata survives, content is discarded", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});

	storage.beginContentBatch();
	storage.putContent("sha256-rolled-back", Buffer.from("will be rolled back"));
	storage.rollbackContentBatch();

	storage.endMetadataBatch();

	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
	t.false(storage.hasContent("sha256-rolled-back"));
});

test("Metadata rollback: Both metadata and nested content are discarded", (t) => {
	const {storage} = t.context;
	storage.beginMetadataBatch();
	storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});

	storage.beginContentBatch();
	storage.putContent("sha256-outer-rb", Buffer.from("will be discarded"));
	storage.endContentBatch();

	storage.rollbackMetadataBatch();

	t.is(storage.readIndexCache("project-a", "sig-1", "source"), null);
	t.false(storage.hasContent("sha256-outer-rb"));
});

// ===== Validity =====

test("isValid: Returns true for open database", (t) => {
	t.true(t.context.storage.isValid);
});

test("isValid: Returns false after close", (t) => {
	t.context.storage.close();
	t.false(t.context.storage.isValid);
});

test("isValid: Returns false after database file is deleted", (t) => {
	const dbPath = path.join(t.context.dbDir, "cache.db");
	fs.unlinkSync(dbPath);
	t.false(t.context.storage.isValid);
});
