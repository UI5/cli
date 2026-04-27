import test from "ava";
import path from "node:path";
import sinon from "sinon";
import esmock from "esmock";
import {rimraf} from "rimraf";

const TEST_DIR = path.join(import.meta.dirname, "..", "..", "..", "tmp", "CacheManager");

test.after.always(async () => {
	await rimraf(TEST_DIR);
});

test.afterEach.always(() => {
	sinon.restore();
	delete process.env.UI5_DATA_DIR;
});

function getUniqueTestDir() {
	return path.join(TEST_DIR, `cm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// Metadata delegation (round-trip through CacheManager)

test.serial("Index cache: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	process.env.UI5_DATA_DIR = testDir;
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {indexTimestamp: 1234, root: {name: "", hash: "abc"}};
	await cm.writeIndexCache("project-x", "build-sig", "source", data);
	const result = await cm.readIndexCache("project-x", "build-sig", "source");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Stage cache: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {resourceMetadata: {"/a.js": {integrity: "hash-a"}}};
	await cm.writeStageCache("project-x", "build-sig", "task/minify", "stage-sig", data);
	const result = await cm.readStageCache("project-x", "build-sig", "task/minify", "stage-sig");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Task metadata: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {requestSetGraph: {nodes: []}};
	await cm.writeTaskMetadata("project-x", "build-sig", "minify", "project", data);
	const result = await cm.readTaskMetadata("project-x", "build-sig", "minify", "project");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Result metadata: round-trip via CacheManager", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const data = {stageSignatures: {"task/minify": "sig-abc"}};
	await cm.writeResultMetadata("project-x", "build-sig", "result-sig", data);
	const result = await cm.readResultMetadata("project-x", "build-sig", "result-sig");
	t.deepEqual(result, data);
	cm.close();
});

test.serial("Cache miss returns null for all metadata types", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	t.is(await cm.readIndexCache("no-project", "no-sig", "source"), null);
	t.is(await cm.readStageCache("no-project", "no-sig", "no-stage", "no-sig"), null);
	t.is(await cm.readTaskMetadata("no-project", "no-sig", "no-task", "project"), null);
	t.is(await cm.readResultMetadata("no-project", "no-sig", "no-sig"), null);
	cm.close();
});

// CAS delegation

test.serial("contentPath delegates to CAS", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const integrity = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
	const result = cm.contentPath(integrity);
	t.is(typeof result, "string");
	t.true(result.includes("cas"));
	t.true(result.includes("sha256"));
	cm.close();
});

test.serial("getResourcePathForStage returns null for missing content", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	const result = await cm.getResourcePathForStage("sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
	t.is(result, null);
	cm.close();
});

test.serial("getResourcePathForStage throws without integrity", async (t) => {
	const testDir = getUniqueTestDir();
	const CacheManager = (await import("../../../../lib/build/cache/CacheManager.js")).default;
	const cm = new CacheManager(path.join(testDir, "buildCache"));

	await t.throwsAsync(cm.getResourcePathForStage(null), {
		message: "Integrity hash must be provided to read from cache"
	});
	cm.close();
});

// Singleton via create()

test.serial("create() returns singleton per cache directory", async (t) => {
	const testDir = getUniqueTestDir();
	process.env.UI5_DATA_DIR = testDir;

	const CacheManager = await esmock("../../../../lib/build/cache/CacheManager.js", {
		"../../../../lib/config/Configuration.js": {
			default: {
				fromFile: sinon.stub().resolves({getUi5DataDir: () => null})
			}
		}
	});

	const cm1 = await CacheManager.create(testDir);
	const cm2 = await CacheManager.create(testDir);
	t.is(cm1, cm2, "Same cache directory returns same instance");
});
