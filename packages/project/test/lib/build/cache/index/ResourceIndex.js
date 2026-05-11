import test from "ava";
import sinon from "sinon";
import ResourceIndex from "../../../../../lib/build/cache/index/ResourceIndex.js";
import TreeRegistry from "../../../../../lib/build/cache/index/TreeRegistry.js";

function createMockResource(path, integrity, lastModified, size, inode) {
	return {
		getOriginalPath: () => path,
		getIntegrity: async () => integrity,
		getLastModified: () => lastModified,
		getSize: async () => size,
		getInode: () => inode,
		getTags: () => null
	};
}

test.afterEach.always(() => {
	sinon.restore();
});

// === create ===

test("create: creates ResourceIndex from resources", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	];
	const index = await ResourceIndex.create(resources, Date.now());
	t.truthy(index.getSignature());
	t.deepEqual(index.getResourcePaths().sort(), ["/a.js", "/b.js"]);
});

// === createShared ===

test("createShared: creates shared ResourceIndex", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const index = await ResourceIndex.createShared(resources, Date.now(), registry);
	t.truthy(index.getSignature());
	t.deepEqual(index.getResourcePaths(), ["/a.js"]);
});

// === fromCache ===

test("fromCache: restores index from cache object", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	];
	const original = await ResourceIndex.create(resources, Date.now());
	const cacheObj = original.toCacheObject();

	const restored = ResourceIndex.fromCache(cacheObj);
	t.is(restored.getSignature(), original.getSignature());
	t.deepEqual(restored.getResourcePaths().sort(), ["/a.js", "/b.js"]);
});

// === fromCacheShared ===

test("fromCacheShared: restores shared index from cache object", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const original = await ResourceIndex.create(resources, 5000);
	const cacheObj = original.toCacheObject();

	const registry = new TreeRegistry();
	const restored = ResourceIndex.fromCacheShared(cacheObj, registry);
	t.is(restored.getSignature(), original.getSignature());
	t.deepEqual(restored.getResourcePaths(), ["/a.js"]);
});

// === fromCacheWithDelta ===

test("fromCacheWithDelta: detects added resources", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const original = await ResourceIndex.create(resources, 5000);
	const cacheObj = original.toCacheObject();

	const newResources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	];
	const {changedPaths, resourceIndex} = await ResourceIndex.fromCacheWithDelta(cacheObj, newResources, 6000);
	t.true(changedPaths.includes("/b.js"));
	t.deepEqual(resourceIndex.getResourcePaths().sort(), ["/a.js", "/b.js"]);
});

test("fromCacheWithDelta: detects removed resources", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	];
	const original = await ResourceIndex.create(resources, 5000);
	const cacheObj = original.toCacheObject();

	const newResources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const {changedPaths, resourceIndex} = await ResourceIndex.fromCacheWithDelta(cacheObj, newResources, 6000);
	t.true(changedPaths.includes("/b.js"));
	t.deepEqual(resourceIndex.getResourcePaths(), ["/a.js"]);
});

test("fromCacheWithDelta: detects updated resources", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const original = await ResourceIndex.create(resources, 5000);
	const cacheObj = original.toCacheObject();

	const newResources = [
		createMockResource("/a.js", "hash-a-new", 6000, 150, 1),
	];
	const {changedPaths} = await ResourceIndex.fromCacheWithDelta(cacheObj, newResources, 6000);
	t.true(changedPaths.includes("/a.js"));
});

// === fromCacheWithDeltaShared ===

test("fromCacheWithDeltaShared: detects changes via registry flush", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	];
	const registry1 = new TreeRegistry();
	const original = await ResourceIndex.createShared(resources, 5000, registry1);
	await registry1.flush();
	const cacheObj = original.toCacheObject();

	const registry2 = new TreeRegistry();
	const newResources = [
		createMockResource("/a.js", "hash-a-new", 6000, 150, 1),
		createMockResource("/c.js", "hash-c", 3000, 300, 3),
	];
	const {changedPaths, resourceIndex} =
		await ResourceIndex.fromCacheWithDeltaShared(cacheObj, newResources, 6000, registry2);
	t.true(changedPaths.includes("/b.js"), "Removed /b.js detected");
	t.true(changedPaths.includes("/c.js"), "Added /c.js detected");
	t.true(changedPaths.includes("/a.js"), "Updated /a.js detected");
	t.truthy(resourceIndex.getSignature());
});

// === clone ===

test("clone: creates independent copy", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const original = await ResourceIndex.create(resources, Date.now());
	const cloned = original.clone();

	t.is(cloned.getSignature(), original.getSignature());
	t.deepEqual(cloned.getResourcePaths(), original.getResourcePaths());

	// Modify clone
	await cloned.upsertResources([createMockResource("/b.js", "hash-b", 2000, 200, 2)], Date.now());
	t.not(cloned.getSignature(), original.getSignature());
});

// === deriveTree / deriveTreeWithIndex ===

test("deriveTree: creates derived index with additional resources (shared)", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const original = await ResourceIndex.createShared(resources, Date.now(), registry);
	await registry.flush();
	const derived = await original.deriveTree([
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	]);
	t.not(derived.getSignature(), original.getSignature());
	t.deepEqual(derived.getResourcePaths().sort(), ["/a.js", "/b.js"]);
});

test("deriveTreeWithIndex: creates derived index from pre-built resource index (shared)", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const original = await ResourceIndex.createShared(resources, Date.now(), registry);
	await registry.flush();
	const resourceIndexData = [{path: "/c.js", integrity: "hash-c", lastModified: 3000, size: 300}];
	const derived = original.deriveTreeWithIndex(resourceIndexData);
	t.truthy(derived.getSignature());
});

// === getAddedResourceIndex ===

test("getAddedResourceIndex: returns resources added compared to base (shared)", async (t) => {
	const registry = new TreeRegistry();
	const base = await ResourceIndex.createShared([
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	], Date.now(), registry);
	await registry.flush();
	const extended = await base.deriveTree([
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	]);
	const added = extended.getAddedResourceIndex(base);
	t.is(added.length, 1);
	t.is(added[0].path, "/b.js");
});

// === toCacheObject ===

test("toCacheObject: returns serializable object", async (t) => {
	const resources = [
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	];
	const index = await ResourceIndex.create(resources, 5000);
	const obj = index.toCacheObject();
	t.is(obj.indexTimestamp, 5000);
	t.truthy(obj.indexTree);
});

// === upsertResources / removeResources ===

test("upsertResources: adds new resources", async (t) => {
	const index = await ResourceIndex.create([
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	], 5000);
	const {added, updated} = await index.upsertResources([
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	], 6000);
	t.deepEqual(added, ["/b.js"]);
	t.deepEqual(updated, []);
});

test("removeResources: removes resources from index", async (t) => {
	const index = await ResourceIndex.create([
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
		createMockResource("/b.js", "hash-b", 2000, 200, 2),
	], 5000);
	await index.removeResources(["/b.js"]);
	t.deepEqual(index.getResourcePaths(), ["/a.js"]);
});

// === getTree ===

test("getTree: returns underlying tree", async (t) => {
	const index = await ResourceIndex.create([
		createMockResource("/a.js", "hash-a", 1000, 100, 1),
	], Date.now());
	const tree = index.getTree();
	t.truthy(tree);
	t.truthy(tree.getRootHash());
});
