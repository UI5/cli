import test from "ava";
import path from "node:path";
import fs from "node:fs";
import {rimraf} from "rimraf";
import MetadataStorage from "../../../../lib/build/cache/MetadataStorage.js";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "MetadataStorage");

test.after.always(async () => {
	await rimraf(TEST_DIR);
});

test.beforeEach((t) => {
	t.context.dbDir = path.join(TEST_DIR, `db-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	t.context.storage = new MetadataStorage(t.context.dbDir);
});

test.afterEach.always((t) => {
	try {
		t.context.storage.close();
	} catch {
		// Already closed (e.g., in error-handling tests)
	}
});

// Database file creation

test("Creates metadata.db in the specified directory", (t) => {
	const dbPath = path.join(t.context.dbDir, "metadata.db");
	t.true(fs.existsSync(dbPath));
});

// Index cache

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

// Stage metadata

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

// Task metadata

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

// Result metadata

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

// Cross-project isolation

test("Different projects are fully isolated", (t) => {
	const dataA = {project: "a"};
	const dataB = {project: "b"};
	t.context.storage.writeIndexCache("project-a", "sig-1", "source", dataA);
	t.context.storage.writeIndexCache("project-b", "sig-1", "source", dataB);

	t.deepEqual(t.context.storage.readIndexCache("project-a", "sig-1", "source"), dataA);
	t.deepEqual(t.context.storage.readIndexCache("project-b", "sig-1", "source"), dataB);
});

// Error handling

test("Read throws wrapped error after close", (t) => {
	t.context.storage.close();
	const err = t.throws(() => {
		t.context.storage.readIndexCache("project-a", "sig-1", "source");
	});
	t.true(err.message.includes("Failed to read resource index cache"));
	t.truthy(err.cause);
});
