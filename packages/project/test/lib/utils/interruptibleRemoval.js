import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import path from "node:path";
import fs from "node:fs/promises";
import {rimraf} from "rimraf";
import {
	markForRemoval,
	removePendingDir,
	scanPendingRemovals,
} from "../../../lib/utils/interruptibleRemoval.js";

const TMP = path.resolve("test/tmp/interruptibleRemoval");
const PREFIX = "_test_to_delete_";

test.before(async () => {
	await rimraf(TMP);
	await fs.mkdir(TMP, {recursive: true});
});

test.afterEach.always(() => {
	sinon.restore();
});

// ─── markForRemoval ───────────────────────────────────────────────────────────

test.serial("markForRemoval: renames sourceDir to a prefixed sibling and returns the new path", async (t) => {
	const sourceDir = path.join(TMP, "mark-source");
	await fs.mkdir(sourceDir, {recursive: true});
	await fs.writeFile(path.join(sourceDir, "file.txt"), "data");

	const pendingDir = markForRemoval(sourceDir, PREFIX);

	t.truthy(pendingDir, "returns a pending path");
	t.true(pendingDir.startsWith(path.join(TMP, PREFIX)), "pending path has the correct prefix");
	t.false(await dirExists(sourceDir), "source directory no longer exists");
	t.true(await dirExists(pendingDir), "pending directory exists at returned path");
	t.true(await fileExists(path.join(pendingDir, "file.txt")), "contents moved to pending dir");

	// cleanup
	await fs.rm(pendingDir, {recursive: true, force: true});
});

test.serial("markForRemoval: returns null when sourceDir does not exist (ENOENT)", (t) => {
	const result = markForRemoval(path.join(TMP, "nonexistent-dir"), PREFIX);
	t.is(result, null, "returns null for ENOENT instead of throwing");
});

test.serial("markForRemoval: rethrows non-ENOENT errors", async (t) => {
	const {markForRemoval: mockMark} = await esmock("../../../lib/utils/interruptibleRemoval.js", {
		"node:fs": {
			renameSync: sinon.stub().throws(
				Object.assign(new Error("EPERM: operation not permitted"), {code: "EPERM"})),
		},
	});
	t.throws(() => mockMark("/some/dir", PREFIX), {message: /EPERM/});
});

test.serial("markForRemoval: generates a unique suffix each call", async (t) => {
	const src1 = path.join(TMP, "uniq-src-1");
	const src2 = path.join(TMP, "uniq-src-2");
	await fs.mkdir(src1, {recursive: true});
	await fs.mkdir(src2, {recursive: true});

	const p1 = markForRemoval(src1, PREFIX);
	const p2 = markForRemoval(src2, PREFIX);

	t.not(p1, p2, "two calls produce different pending paths");

	await fs.rm(p1, {recursive: true, force: true});
	await fs.rm(p2, {recursive: true, force: true});
});

// ─── removePendingDir ─────────────────────────────────────────────────────────

test.serial("removePendingDir: removes the directory recursively", async (t) => {
	const pendingDir = path.join(TMP, `${PREFIX}aabb`);
	await fs.mkdir(path.join(pendingDir, "nested"), {recursive: true});
	await fs.writeFile(path.join(pendingDir, "nested", "file.txt"), "data");

	await removePendingDir(pendingDir);

	t.false(await dirExists(pendingDir), "pending directory was removed");
});

test.serial("removePendingDir: does not throw when directory does not exist", async (t) => {
	await t.notThrowsAsync(removePendingDir(path.join(TMP, "already-gone")));
});

// ─── scanPendingRemovals ──────────────────────────────────────────────────────

test.serial("scanPendingRemovals: returns absolute paths of matching subdirectories", async (t) => {
	const scanRoot = path.join(TMP, "scan-root");
	await fs.mkdir(path.join(scanRoot, `${PREFIX}aa11`), {recursive: true});
	await fs.mkdir(path.join(scanRoot, `${PREFIX}bb22`), {recursive: true});
	await fs.mkdir(path.join(scanRoot, "other-dir"), {recursive: true});
	await fs.writeFile(path.join(scanRoot, `${PREFIX}not-a-dir.txt`), "");

	const result = await scanPendingRemovals(scanRoot, PREFIX);

	t.is(result.length, 2, "returns only the two matching directories");
	t.true(result.every((p) => path.isAbsolute(p)), "all paths are absolute");
	t.true(result.every((p) => path.basename(p).startsWith(PREFIX)), "all entries match the prefix");

	await fs.rm(scanRoot, {recursive: true, force: true});
});

test.serial("scanPendingRemovals: returns empty array when scanRoot does not exist", async (t) => {
	const result = await scanPendingRemovals(path.join(TMP, "nonexistent-root"), PREFIX);
	t.deepEqual(result, [], "returns empty array for missing scanRoot");
});

test.serial("scanPendingRemovals: returns empty array when no entries match the prefix", async (t) => {
	const scanRoot = path.join(TMP, "scan-no-match");
	await fs.mkdir(path.join(scanRoot, "unrelated-dir"), {recursive: true});

	const result = await scanPendingRemovals(scanRoot, PREFIX);
	t.deepEqual(result, [], "returns empty array when no entries match");

	await fs.rm(scanRoot, {recursive: true, force: true});
});

// ─── full round-trip ──────────────────────────────────────────────────────────

test.serial("round-trip: markForRemoval → removePendingDir cleans up completely", async (t) => {
	const sourceDir = path.join(TMP, "roundtrip-src");
	await fs.mkdir(sourceDir, {recursive: true});
	await fs.writeFile(path.join(sourceDir, "data.bin"), "payload");

	const pendingDir = markForRemoval(sourceDir, PREFIX);
	t.truthy(pendingDir);
	t.false(await dirExists(sourceDir), "source gone after rename");

	await removePendingDir(pendingDir);
	t.false(await dirExists(pendingDir), "pending dir gone after rm");
});

test.serial("round-trip: scanPendingRemovals finds leftover from interrupted prior run", async (t) => {
	const scanRoot = path.join(TMP, "scan-interrupted");
	const leftover = path.join(scanRoot, `${PREFIX}cc33`);
	await fs.mkdir(leftover, {recursive: true});

	const found = await scanPendingRemovals(scanRoot, PREFIX);
	t.is(found.length, 1);
	t.is(found[0], leftover);

	await fs.rm(scanRoot, {recursive: true, force: true});
});

// ─── helpers ─────────────────────────────────────────────────────────────────

async function dirExists(p) {
	try {
		return (await fs.stat(p)).isDirectory();
	} catch {
		return false;
	}
}

async function fileExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}
