import test from "ava";
import path from "node:path";
import fs from "node:fs";
import {rimraf} from "rimraf";
import {gunzipSync, gzipSync} from "node:zlib";
import BuildCacheStorage from "../../../../lib/build/cache/BuildCacheStorage.js";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "BuildCacheStorage");

test.after.always(async () => {
	// Best-effort cleanup; on Windows, SQLite WAL files may still be locked briefly after close
	await rimraf(TEST_DIR).catch(() => {});
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

test("putContent + readContentRaw: Returns gzip-compressed data for content above threshold", (t) => {
	const content = Buffer.alloc(256, "x");
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

// ===== Transactions =====

test("transaction: Multiple writes commit atomically", (t) => {
	const {storage} = t.context;
	storage.transaction(() => {
		storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
		storage.writeTaskMetadata("project-a", "sig-1", "minify", "project", {v: 2});
		storage.writeResultMetadata("project-a", "sig-1", "result-sig-1", {v: 3});
	});

	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
	t.deepEqual(storage.readTaskMetadata("project-a", "sig-1", "minify", "project"), {v: 2});
	t.deepEqual(storage.readResultMetadata("project-a", "sig-1", "result-sig-1"), {v: 3});
});

test("transaction: Throwing callback rolls back all writes", (t) => {
	const {storage} = t.context;
	t.throws(() => {
		storage.transaction(() => {
			storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
			storage.writeTaskMetadata("project-a", "sig-1", "minify", "project", {v: 2});
			throw new Error("boom");
		});
	}, {message: "boom"});

	t.is(storage.readIndexCache("project-a", "sig-1", "source"), null);
	t.is(storage.readTaskMetadata("project-a", "sig-1", "minify", "project"), null);
});

test("transaction: Combined metadata and content writes commit atomically", (t) => {
	const {storage} = t.context;
	storage.transaction(() => {
		storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
		storage.putContent("sha256-tx", Buffer.from("tx content"));
	});

	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
	t.deepEqual(storage.readContent("sha256-tx"), Buffer.from("tx content"));
});

test("transaction: Throwing rolls back both metadata and content writes", (t) => {
	const {storage} = t.context;
	t.throws(() => {
		storage.transaction(() => {
			storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
			storage.putContent("sha256-rb", Buffer.from("will be rolled back"));
			throw new Error("nope");
		});
	}, {message: "nope"});

	t.is(storage.readIndexCache("project-a", "sig-1", "source"), null);
	t.false(storage.hasContent("sha256-rb"));
});

test("transaction: Returns the callback's return value", (t) => {
	const {storage} = t.context;
	const result = storage.transaction(() => {
		storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
		return 42;
	});
	t.is(result, 42);
});

test("transaction: Nested calls throw", (t) => {
	const {storage} = t.context;
	t.throws(() => {
		storage.transaction(() => {
			storage.transaction(() => {});
		});
	}, {message: /Nested transactions are not supported/});

	// After the failed nested call the outer transaction was rolled back and
	// the storage is usable again
	storage.transaction(() => {
		storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
	});
	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 1});
});

test("transaction: Async callback throws and rolls back", (t) => {
	const {storage} = t.context;
	t.throws(() => {
		storage.transaction(async () => {
			storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
		});
	}, {message: /Async callbacks are not supported/});

	// Writes performed before the throw are rolled back
	t.is(storage.readIndexCache("project-a", "sig-1", "source"), null);

	// Storage remains usable after the rollback
	storage.transaction(() => {
		storage.writeIndexCache("project-a", "sig-1", "source", {v: 2});
	});
	t.deepEqual(storage.readIndexCache("project-a", "sig-1", "source"), {v: 2});
});

test("transaction: Callback returning a thenable throws and rolls back", (t) => {
	const {storage} = t.context;
	t.throws(() => {
		storage.transaction(() => {
			storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
			return Promise.resolve("nope");
		});
	}, {message: /Async callbacks are not supported/});

	t.is(storage.readIndexCache("project-a", "sig-1", "source"), null);
});

test("close: Rolls back uncommitted transaction", (t) => {
	const {storage} = t.context;
	// Simulate an interrupted transaction by throwing inside the callback
	// without rethrowing — close() should still leave the DB in a clean state.
	t.throws(() => {
		storage.transaction(() => {
			storage.writeIndexCache("project-a", "sig-1", "source", {v: 1});
			throw new Error("interrupted");
		});
	}, {message: "interrupted"});
	storage.close();

	const fresh = new BuildCacheStorage(t.context.dbDir);
	t.is(fresh.readIndexCache("project-a", "sig-1", "source"), null);
	fresh.close();
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
	try {
		fs.unlinkSync(dbPath);
	} catch (err) {
		if (err.code === "EBUSY") {
			// On Windows, open files cannot be deleted; skip this assertion
			t.pass("Skipped on Windows: cannot unlink open database file");
			return;
		}
		throw err;
	}
	t.false(t.context.storage.isValid);
});

// ===== Batch existence checks =====

test("findExistingContentIntegrities: Returns empty Set for empty input", (t) => {
	const result = t.context.storage.findExistingContentIntegrities([]);
	t.deepEqual(result, new Set());
});

test("findExistingContentIntegrities: Returns empty Set when no matches", (t) => {
	const result = t.context.storage.findExistingContentIntegrities(["sha256-a", "sha256-b"]);
	t.deepEqual(result, new Set());
});

test("findExistingContentIntegrities: Returns Set with existing integrities", (t) => {
	t.context.storage.putContent("sha256-exists1", Buffer.from("content1"));
	t.context.storage.putContent("sha256-exists2", Buffer.from("content2"));

	const result = t.context.storage.findExistingContentIntegrities(
		["sha256-exists1", "sha256-missing", "sha256-exists2"]
	);
	t.deepEqual(result, new Set(["sha256-exists1", "sha256-exists2"]));
});

test("findExistingContentIntegrities: Handles large batches", (t) => {
	const integrities = [];
	for (let i = 0; i < 100; i++) {
		const integrity = `sha256-batch${i}`;
		t.context.storage.putContent(integrity, Buffer.from(`content${i}`));
		integrities.push(integrity);
	}
	integrities.push("sha256-nonexistent");

	const result = t.context.storage.findExistingContentIntegrities(integrities);
	t.is(result.size, 100);
	t.false(result.has("sha256-nonexistent"));
});

test("hasRecords: Returns false for empty database", (t) => {
	t.false(t.context.storage.hasRecords());
});

test("hasRecords: Returns true when content table has records", (t) => {
	t.context.storage.putContent("sha256-content", Buffer.from("content"));
	t.true(t.context.storage.hasRecords());
});

test("hasRecords: Returns true when index cache table has records", (t) => {
	t.context.storage.writeIndexCache("project-a", "build-sig", "source", {v: 1});
	t.true(t.context.storage.hasRecords());
});

test("hasRecords: Returns true when stage metadata table has records", (t) => {
	t.context.storage.writeStageCache("project-a", "build-sig", "task/minify", "sig-a", {v: 1});
	t.true(t.context.storage.hasRecords());
});

test("hasRecords: Returns true when task metadata table has records", (t) => {
	t.context.storage.writeTaskMetadata("project-a", "build-sig", "minify", "project", {v: 1});
	t.true(t.context.storage.hasRecords());
});

test("hasRecords: Returns true when result metadata table has records", (t) => {
	t.context.storage.writeResultMetadata("project-a", "build-sig", "sig-a", {v: 1});
	t.true(t.context.storage.hasRecords());
});

// ===== hasProjectRecords / dropProjectRecords =====

function seedProjectRecords(storage, projectId) {
	storage.writeIndexCache(projectId, "build-sig", "source", {v: 1});
	storage.writeStageCache(projectId, "build-sig", "task/minify", "stage-sig", {v: 2});
	storage.writeTaskMetadata(projectId, "build-sig", "minify", "project", {v: 3});
	storage.writeResultMetadata(projectId, "build-sig", "result-sig", {v: 4});
}

test("hasProjectRecords: Returns false for a project without records", (t) => {
	t.context.storage.writeIndexCache("project-a", "build-sig", "source", {v: 1});
	t.false(t.context.storage.hasProjectRecords("project-b"));
});

test("hasProjectRecords: Returns true when any project-keyed table has a row", (t) => {
	t.context.storage.writeResultMetadata("project-a", "build-sig", "sig-a", {v: 1});
	t.true(t.context.storage.hasProjectRecords("project-a"));
});

test("hasProjectRecords: Ignores content table (not project-keyed)", (t) => {
	t.context.storage.putContent("sha256-content", Buffer.from("data"));
	t.false(t.context.storage.hasProjectRecords("project-a"),
		"Shared content does not count as project records");
});

test("dropProjectRecords: Removes all project-keyed rows and returns the count", (t) => {
	seedProjectRecords(t.context.storage, "project-a");

	const deleted = t.context.storage.dropProjectRecords("project-a");

	t.is(deleted, 4, "Reports one deleted row per project-keyed table");
	t.false(t.context.storage.hasProjectRecords("project-a"), "Project has no records left");
});

test("dropProjectRecords: Leaves other projects and shared content intact", (t) => {
	seedProjectRecords(t.context.storage, "project-a");
	seedProjectRecords(t.context.storage, "project-b");
	t.context.storage.putContent("sha256-shared", Buffer.from("data"));

	t.context.storage.dropProjectRecords("project-a");

	t.false(t.context.storage.hasProjectRecords("project-a"), "Target project cleared");
	t.true(t.context.storage.hasProjectRecords("project-b"), "Other project untouched");
	t.true(t.context.storage.hasContent("sha256-shared"), "Shared content untouched");
});

test("dropProjectRecords: No-op returns 0 for an unknown project", (t) => {
	seedProjectRecords(t.context.storage, "project-a");

	const deleted = t.context.storage.dropProjectRecords("project-unknown");

	t.is(deleted, 0, "Nothing deleted for an unknown project");
	t.true(t.context.storage.hasProjectRecords("project-a"), "Existing project untouched");
});

// ===== getProjectCacheEntries =====

// Seeds a realistic index_cache "source" blob plus one row in each other project-keyed table
// for a given project id and build signature.
function seedSignature(storage, projectId, buildSignature, {
	indexTimestamp = 1_700_000_000_000,
	tasks = [["minify", 1], ["replaceVersion", 0]],
	availableDependencies = "dep-set-id",
} = {}) {
	storage.writeIndexCache(projectId, buildSignature, "source", {
		indexTimestamp,
		indexTree: {root: {hash: "root-hash"}},
		tasks,
		availableDependencies,
	});
	storage.writeStageCache(projectId, buildSignature, "task/minify", "stage-sig", {v: 1});
	storage.writeResultMetadata(projectId, buildSignature, "result-sig", {v: 2});
	storage.writeTaskMetadata(projectId, buildSignature, "minify", "project", {v: 3});
}

test("getProjectCacheEntries: Returns empty array for a project without records", (t) => {
	seedSignature(t.context.storage, "project-a", "build-sig");
	t.deepEqual(t.context.storage.getProjectCacheEntries("project-b"), []);
});

test("getProjectCacheEntries: Extracts indexTimestamp, tasks and dependencies from the source blob", (t) => {
	seedSignature(t.context.storage, "project-a", "build-sig", {
		indexTimestamp: 1_712_345_678_000,
		tasks: [["minify", 1], ["generateBundle", 0]],
		availableDependencies: "deps-abc",
	});

	const entries = t.context.storage.getProjectCacheEntries("project-a");
	t.is(entries.length, 1, "One entry for the single build signature");
	const [entry] = entries;
	t.is(entry.buildSignature, "build-sig");
	t.is(entry.indexTimestamp, 1_712_345_678_000);
	t.deepEqual(entry.tasks, ["minify", "generateBundle"], "Task names extracted from [name, flag] pairs");
	t.is(entry.availableDependencies, "deps-abc");
	t.deepEqual(entry.stageEntries, [{stageId: "task/minify", stageSignature: "stage-sig"}]);
	t.deepEqual(entry.resultSignatures, ["result-sig"]);
	t.deepEqual(entry.taskEntries, [{taskName: "minify", type: "project"}]);
});

test("getProjectCacheEntries: Groups rows by build signature", (t) => {
	seedSignature(t.context.storage, "project-a", "sig-1");
	seedSignature(t.context.storage, "project-a", "sig-2");

	const entries = t.context.storage.getProjectCacheEntries("project-a");
	t.is(entries.length, 2, "One entry per build signature");
	const signatures = entries.map((e) => e.buildSignature).sort();
	t.deepEqual(signatures, ["sig-1", "sig-2"]);
});

test("getProjectCacheEntries: Signature without a source-index row reports null timestamp and no tasks", (t) => {
	// Only stage/result rows exist for this signature (partial or legacy)
	t.context.storage.writeStageCache("project-a", "orphan-sig", "task/minify", "stage-sig", {v: 1});
	t.context.storage.writeResultMetadata("project-a", "orphan-sig", "result-sig", {v: 2});

	const entries = t.context.storage.getProjectCacheEntries("project-a");
	t.is(entries.length, 1);
	const [entry] = entries;
	t.is(entry.buildSignature, "orphan-sig");
	t.is(entry.indexTimestamp, null, "No timestamp without a source-index row");
	t.deepEqual(entry.tasks, []);
	t.is(entry.availableDependencies, null);
	t.is(entry.stageEntries.length, 1);
	t.is(entry.resultSignatures.length, 1);
});

test("getProjectCacheEntries: Ignores other projects", (t) => {
	seedSignature(t.context.storage, "project-a", "build-sig");
	seedSignature(t.context.storage, "project-b", "build-sig");

	const entries = t.context.storage.getProjectCacheEntries("project-a");
	t.is(entries.length, 1, "Only the target project's signature is returned");
	t.is(entries[0].taskEntries.length, 1, "Does not mix in other projects' task rows");
});

test("getProjectCacheEntries: Ignores the shared content table", (t) => {
	t.context.storage.putContent("sha256-shared", Buffer.from("data"));
	t.deepEqual(t.context.storage.getProjectCacheEntries("project-a"), [],
		"Shared content does not surface as project entries");
});

test("getProjectCacheEntries: withSizes sums on-disk content size per signature", (t) => {
	// Small content (<=128 bytes) is stored uncompressed, so LENGTH(data) equals the byte length
	t.context.storage.putContent("sha256-a", Buffer.alloc(10));
	t.context.storage.putContent("sha256-b", Buffer.alloc(20));
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", {
		indexTimestamp: 1, indexTree: {root: {}}, tasks: [], availableDependencies: null,
	});
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "stg", {
		resourceMetadata: {
			"/a.js": {integrity: "sha256-a", size: 111, lastModified: 1, inode: 1},
			"/b.js": {integrity: "sha256-b", size: 222, lastModified: 2, inode: 2},
			"/a-dup.js": {integrity: "sha256-a", size: 111, lastModified: 3, inode: 3},
		},
	});

	const [entry] = t.context.storage.getProjectCacheEntries("project-a", {withSizes: true});
	t.is(entry.sizeBytes, 30, "Sums content sizes, deduped by integrity within the signature");
	t.false("integrities" in entry, "Internal integrity set is not leaked");
});

// ===== getStageEntriesBySignature =====

test("getStageEntriesBySignature: Returns resources from a plain-object stage blob", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "stg-1", {
		resourceMetadata: {"/a.js": {integrity: "i1", size: 5, lastModified: 10, inode: 1}},
		projectTagOperations: {},
		buildTagOperations: {},
	});

	const entries = t.context.storage.getStageEntriesBySignature("stg-1");
	t.is(entries.length, 1);
	t.deepEqual(entries[0], {
		projectId: "project-a",
		buildSignature: "sig-1",
		stageId: "task/minify",
		resources: [{path: "/a.js", integrity: "i1", size: 5, lastModified: 10}],
	});
});

test("getStageEntriesBySignature: Resolves array/mapping stage blob (writer collection)", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "result", "stg-2", {
		resourceMapping: {"/a.js": 0, "/b.js": 1},
		resourceMetadata: [
			{"/a.js": {integrity: "i1", size: 5, lastModified: 10, inode: 1}},
			{"/b.js": {integrity: "i2", size: 6, lastModified: 20, inode: 2}},
		],
	});

	const [entry] = t.context.storage.getStageEntriesBySignature("stg-2");
	t.deepEqual(entry.resources, [
		{path: "/a.js", integrity: "i1", size: 5, lastModified: 10},
		{path: "/b.js", integrity: "i2", size: 6, lastModified: 20},
	], "Each path is resolved through its reader index");
});

test("getStageEntriesBySignature: Returns all rows sharing a stage signature across projects", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "shared", {resourceMetadata: {}});
	t.context.storage.writeStageCache("project-b", "sig-9", "task/minify", "shared", {resourceMetadata: {}});

	const entries = t.context.storage.getStageEntriesBySignature("shared");
	t.is(entries.length, 2);
	t.deepEqual(entries.map((e) => e.projectId).sort(), ["project-a", "project-b"]);
});

test("getStageEntriesBySignature: Returns empty array when not found", (t) => {
	t.deepEqual(t.context.storage.getStageEntriesBySignature("missing"), []);
});

test("getStageEntriesBySignature: Resolves a unique signature prefix", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "26b223c2c5f1abcd", {
		resourceMetadata: {"/a.js": {integrity: "i1", size: 5, lastModified: 10}},
	});

	const [entry] = t.context.storage.getStageEntriesBySignature("26b223c2c5f1");
	t.is(entry.stageId, "task/minify", "The short prefix resolves to the full-signature row");
	t.deepEqual(entry.resources, [{path: "/a.js", integrity: "i1", size: 5, lastModified: 10}]);
});

test("getStageEntriesBySignature: A prefix shared by one signature across projects returns all rows", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "shared-sig-0", {resourceMetadata: {}});
	t.context.storage.writeStageCache("project-b", "sig-9", "task/minify", "shared-sig-0", {resourceMetadata: {}});

	const entries = t.context.storage.getStageEntriesBySignature("shared-");
	t.is(entries.length, 2, "Multiple rows of one signature are not ambiguous");
	t.deepEqual(entries.map((e) => e.projectId).sort(), ["project-a", "project-b"]);
});

test("getStageEntriesBySignature: Throws when the prefix matches more than one signature", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "abcd1111", {resourceMetadata: {}});
	t.context.storage.writeStageCache("project-a", "sig-1", "result", "abcd2222", {resourceMetadata: {}});

	const err = t.throws(() => t.context.storage.getStageEntriesBySignature("abcd"));
	t.regex(err.message, /ambiguous/, "Names the ambiguity");
	t.true(err.message.includes("abcd1111") && err.message.includes("abcd2222"),
		"Lists the candidate signatures");
});

test("getStageEntriesBySignature: Treats LIKE wildcards in the input as plain characters", (t) => {
	t.context.storage.writeStageCache("project-a", "sig-1", "task/minify", "a_b", {resourceMetadata: {}});
	t.context.storage.writeStageCache("project-a", "sig-1", "result", "axb", {resourceMetadata: {}});

	const entries = t.context.storage.getStageEntriesBySignature("a_b");
	t.is(entries.length, 1, "'_' is escaped, so it does not match the 'axb' row as a wildcard");
	t.is(entries[0].stageId, "task/minify");
});

// ===== getContentSizes =====

test("getContentSizes: Returns raw length for small content and omits missing integrities", (t) => {
	t.context.storage.putContent("sha256-tiny", Buffer.alloc(12));
	const sizes = t.context.storage.getContentSizes(["sha256-tiny", "sha256-absent"]);
	t.is(sizes.get("sha256-tiny"), 12, "Uncompressed content length");
	t.false(sizes.has("sha256-absent"), "Missing integrity is absent from the map");
});

test("getContentSizes: Returns the compressed length for content above the threshold", (t) => {
	const content = Buffer.alloc(4096, "x");
	t.context.storage.putContent("sha256-big", content);
	const sizes = t.context.storage.getContentSizes(["sha256-big"]);
	t.true(sizes.get("sha256-big") > 0);
	t.true(sizes.get("sha256-big") < content.length, "Highly compressible content stores smaller than raw");
});

test("getContentSizes: Returns empty map for empty input", (t) => {
	t.is(t.context.storage.getContentSizes([]).size, 0);
});

test("getDatabaseSize: Returns positive database size", (t) => {
	const size = t.context.storage.getDatabaseSize();
	t.true(Number.isInteger(size));
	t.true(size > 0);
});

// ===== Pre-compressed content =====

test("putCompressedContent: Stores pre-compressed data retrievable via readContent", (t) => {
	const content = Buffer.from("pre-compressed test");
	const compressed = gzipSync(content, {level: 1});
	t.context.storage.putCompressedContent("sha256-precomp", compressed);
	t.deepEqual(t.context.storage.readContent("sha256-precomp"), content);
});

test("putCompressedContent: Deduplicates via INSERT OR IGNORE", (t) => {
	const content1 = Buffer.from("first");
	const content2 = Buffer.from("second");
	t.context.storage.putCompressedContent("sha256-dedup-pre", gzipSync(content1));
	t.context.storage.putCompressedContent("sha256-dedup-pre", gzipSync(content2));
	t.deepEqual(t.context.storage.readContent("sha256-dedup-pre"), content1);
});

// ===== Content compression threshold =====

test("putContent: Tiny content (<=128 bytes) is stored uncompressed", (t) => {
	const content = Buffer.from("tiny");
	t.context.storage.putContent("sha256-tiny", content);
	const raw = t.context.storage.readContentRaw("sha256-tiny");
	t.false(raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b,
		"Raw data should NOT have gzip magic bytes");
	t.deepEqual(Buffer.from(raw), content);
});

test("putContent: Content above threshold (>128 bytes) is compressed", (t) => {
	const content = Buffer.alloc(256, "x");
	t.context.storage.putContent("sha256-above", content);
	const raw = t.context.storage.readContentRaw("sha256-above");
	t.true(raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b,
		"Raw data should have gzip magic bytes");
});

test("readContent: Handles both compressed and uncompressed content", (t) => {
	const tiny = Buffer.from("small");
	const large = Buffer.alloc(256, "y");
	t.context.storage.putContent("sha256-small", tiny);
	t.context.storage.putContent("sha256-large-fmt", large);
	t.deepEqual(t.context.storage.readContent("sha256-small"), tiny);
	t.deepEqual(t.context.storage.readContent("sha256-large-fmt"), large);
});

test("readContent: Legacy compressed tiny content is still readable", (t) => {
	const content = Buffer.from("legacy tiny");
	const compressed = gzipSync(content, {level: 1});
	t.context.storage.putCompressedContent("sha256-legacy-tiny", compressed);
	t.deepEqual(t.context.storage.readContent("sha256-legacy-tiny"), content);
});

// ===== dropAllRecords / hasFreelistPages / vacuum =====

test("dropAllRecords: drops all live tables and recreates fresh ones", (t) => {
	t.context.storage.writeIndexCache("p", "sig", "source", {value: 1});
	t.context.storage.putContent("sha256-drop-1", Buffer.from("data"));

	const bytesBefore = t.context.storage.dropAllRecords();

	t.true(bytesBefore > 0, "returns pre-drop byte count");
	t.false(t.context.storage.hasRecords(), "fresh tables are empty after drop");
	t.true(t.context.storage.hasVacuumPending(), "vacuum pending marker set after drop");
});

test("dropAllRecords: fresh tables accept new writes immediately", (t) => {
	t.context.storage.writeIndexCache("p", "sig", "source", {old: true});
	t.context.storage.dropAllRecords();

	t.notThrows(() => {
		t.context.storage.writeIndexCache("p", "sig", "source", {new: true});
	}, "can write to fresh tables right after drop");

	t.deepEqual(t.context.storage.readIndexCache("p", "sig", "source"), {new: true});
});

test("dropAllRecords: calling twice succeeds — second drop operates on freshly-created tables", (t) => {
	t.context.storage.putContent("sha256-a", Buffer.from("a"));
	t.context.storage.dropAllRecords();

	t.notThrows(() => t.context.storage.dropAllRecords(),
		"second drop succeeds because #createTables recreated the tables in the first call");
	t.false(t.context.storage.hasRecords());
});

test("hasVacuumPending: returns false on a fresh database", (t) => {
	t.false(t.context.storage.hasVacuumPending());
});

test("hasVacuumPending: returns true after dropAllRecords", (t) => {
	t.context.storage.putContent("sha256-has", Buffer.from("x"));
	t.context.storage.dropAllRecords();
	t.true(t.context.storage.hasVacuumPending());
});

test("hasVacuumPending: returns false after vacuum", (t) => {
	t.context.storage.putContent("sha256-vac", Buffer.from("y"));
	t.context.storage.dropAllRecords();
	t.context.storage.vacuum();
	t.false(t.context.storage.hasVacuumPending());
});

test("vacuum: reclaims space and returns freed bytes", (t) => {
	const largeContent = Buffer.alloc(64 * 1024, "x");
	t.context.storage.putContent("sha256-large-vac", largeContent);
	t.context.storage.dropAllRecords();

	const freed = t.context.storage.vacuum();

	t.true(freed >= 0, "freed bytes is non-negative");
	t.false(t.context.storage.hasVacuumPending(), "vacuum pending cleared after vacuum");
});

test("vacuum: live data written after drop is unaffected", (t) => {
	t.context.storage.putContent("sha256-old", Buffer.from("old"));
	t.context.storage.dropAllRecords();
	t.context.storage.writeIndexCache("p", "sig", "source", {fresh: true});

	t.context.storage.vacuum();

	t.deepEqual(t.context.storage.readIndexCache("p", "sig", "source"), {fresh: true},
		"data written after drop survives vacuum");
});
