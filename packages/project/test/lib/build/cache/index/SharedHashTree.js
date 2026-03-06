import test from "ava";
import sinon from "sinon";
import SharedHashTree from "../../../../../lib/build/cache/index/SharedHashTree.js";
import TreeRegistry from "../../../../../lib/build/cache/index/TreeRegistry.js";

// Helper to create mock Resource instances
function createMockResource(path, integrity, lastModified, size, inode) {
	return {
		getOriginalPath: () => path,
		getIntegrity: async () => integrity,
		getLastModified: () => lastModified,
		getSize: async () => size,
		getInode: () => inode
	};
}

test.afterEach.always((t) => {
	sinon.restore();
});

// ============================================================================
// SharedHashTree Construction Tests
// ============================================================================

test("SharedHashTree - requires registry option", (t) => {
	t.throws(() => {
		new SharedHashTree([{path: "a.js", integrity: "hash1"}]);
	}, {
		message: "SharedHashTree requires a registry option"
	}, "Should throw error when registry is missing");
});

test("SharedHashTree - auto-registers with registry", (t) => {
	const registry = new TreeRegistry();
	new SharedHashTree([{path: "a.js", integrity: "hash1"}], registry);

	t.is(registry.getTreeCount(), 1, "Should auto-register with registry");
});

test("SharedHashTree - creates tree with resources", (t) => {
	const registry = new TreeRegistry();
	const resources = [
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	];
	const tree = new SharedHashTree(resources, registry);

	t.truthy(tree.getRootHash(), "Should have root hash");
	t.true(tree.hasPath("a.js"), "Should have a.js");
	t.true(tree.hasPath("b.js"), "Should have b.js");
});

// ============================================================================
// SharedHashTree fromCache Tests
// ============================================================================

test("SharedHashTree.fromCache - restores tree from cache data", (t) => {
	const registry = new TreeRegistry();

	// Create original tree
	const tree1 = new SharedHashTree([
		{path: "a.js", integrity: "hash-a", size: 100, lastModified: 1000, inode: 1},
		{path: "b.js", integrity: "hash-b", size: 200, lastModified: 2000, inode: 2}
	], registry);

	// Serialize tree
	const cacheData = tree1.toCacheObject();

	// Restore from cache
	const registry2 = new TreeRegistry();
	const tree2 = SharedHashTree.fromCache(cacheData, registry2);

	t.truthy(tree2, "Should create tree from cache");
	t.is(tree2.getRootHash(), tree1.getRootHash(), "Root hash should match");
	t.true(tree2.hasPath("a.js"), "Should have a.js");
	t.true(tree2.hasPath("b.js"), "Should have b.js");
});

test("SharedHashTree.fromCache - registers with provided registry", (t) => {
	const registry1 = new TreeRegistry();
	const tree1 = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"}
	], registry1);

	const cacheData = tree1.toCacheObject();

	const registry2 = new TreeRegistry();
	t.is(registry2.getTreeCount(), 0, "Registry should be empty initially");

	SharedHashTree.fromCache(cacheData, registry2);

	t.is(registry2.getTreeCount(), 1, "Tree should be registered with new registry");
});

test("SharedHashTree.fromCache - throws on unsupported version", (t) => {
	const registry = new TreeRegistry();

	const invalidCacheData = {
		version: 999,
		root: {
			type: "directory",
			hash: "some-hash",
			children: {}
		}
	};

	const error = t.throws(() => {
		SharedHashTree.fromCache(invalidCacheData, registry);
	}, {
		instanceOf: Error
	});

	t.is(error.message, "Unsupported version: 999", "Should throw error for unsupported version");
});

test("SharedHashTree.fromCache - preserves tree structure", (t) => {
	const registry = new TreeRegistry();

	// Create tree with nested structure
	const tree1 = new SharedHashTree([
		{path: "src/components/Button.js", integrity: "hash-button", size: 300, lastModified: 3000, inode: 3},
		{path: "src/utils/helper.js", integrity: "hash-helper", size: 400, lastModified: 4000, inode: 4},
		{path: "test/button.test.js", integrity: "hash-test", size: 500, lastModified: 5000, inode: 5}
	], registry);

	const cacheData = tree1.toCacheObject();

	const registry2 = new TreeRegistry();
	const tree2 = SharedHashTree.fromCache(cacheData, registry2);

	// Verify all paths exist
	t.true(tree2.hasPath("src/components/Button.js"), "Should have Button.js");
	t.true(tree2.hasPath("src/utils/helper.js"), "Should have helper.js");
	t.true(tree2.hasPath("test/button.test.js"), "Should have test file");

	// Verify structure matches
	const paths1 = tree1.getResourcePaths().sort();
	const paths2 = tree2.getResourcePaths().sort();
	t.deepEqual(paths2, paths1, "Resource paths should match");
});

test("SharedHashTree.fromCache - preserves resource metadata", (t) => {
	const registry = new TreeRegistry();

	const tree1 = new SharedHashTree([
		{path: "file.js", integrity: "hash-abc123", size: 12345, lastModified: 9999, inode: 7777}
	], registry);

	const cacheData = tree1.toCacheObject();

	const registry2 = new TreeRegistry();
	const tree2 = SharedHashTree.fromCache(cacheData, registry2);

	const node1 = tree1.root.children.get("file.js");
	const node2 = tree2.root.children.get("file.js");

	t.is(node2.integrity, node1.integrity, "Should preserve integrity");
	t.is(node2.size, node1.size, "Should preserve size");
	t.is(node2.lastModified, node1.lastModified, "Should preserve lastModified");
	t.is(node2.inode, node1.inode, "Should preserve inode");
});

test("SharedHashTree.fromCache - accepts indexTimestamp option", (t) => {
	const registry = new TreeRegistry();

	const tree1 = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"}
	], registry, {indexTimestamp: 5000});

	const cacheData = tree1.toCacheObject();

	const registry2 = new TreeRegistry();
	const tree2 = SharedHashTree.fromCache(cacheData, registry2, {indexTimestamp: 5000});

	t.is(tree2.getIndexTimestamp(), 5000, "Should accept and use indexTimestamp option");
});

test("SharedHashTree.fromCache - restored tree can be modified", async (t) => {
	const registry = new TreeRegistry();

	const tree1 = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"}
	], registry);

	const cacheData = tree1.toCacheObject();

	const registry2 = new TreeRegistry();
	const tree2 = SharedHashTree.fromCache(cacheData, registry2);

	const originalHash = tree2.getRootHash();

	// Modify restored tree
	await tree2.upsertResources([
		createMockResource("b.js", "hash-b", Date.now(), 1024, 1)
	], Date.now());
	await registry2.flush();

	const newHash = tree2.getRootHash();
	t.not(newHash, originalHash, "Hash should change after modification");
	t.true(tree2.hasPath("b.js"), "Should have new resource");
});

test("SharedHashTree.fromCache - handles empty tree", (t) => {
	const registry = new TreeRegistry();

	const tree1 = new SharedHashTree([], registry);
	const cacheData = tree1.toCacheObject();

	const registry2 = new TreeRegistry();
	const tree2 = SharedHashTree.fromCache(cacheData, registry2);

	t.truthy(tree2, "Should create tree from empty cache");
	t.is(tree2.getResourcePaths().length, 0, "Should have no resources");
	t.truthy(tree2.getRootHash(), "Should have root hash even when empty");
});

// ============================================================================
// SharedHashTree upsertResources Tests
// ============================================================================

test("SharedHashTree - upsertResources schedules with registry", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	const resource = createMockResource("b.js", "hash-b", Date.now(), 1024, 1);
	const result = await tree.upsertResources([resource], Date.now());

	t.is(result, undefined, "Should return undefined (scheduled mode)");
	t.is(registry.getPendingUpdateCount(), 1, "Should schedule upsert with registry");
});

test("SharedHashTree - upsertResources with empty array returns immediately", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	const result = await tree.upsertResources([], Date.now());

	t.is(result, undefined, "Should return undefined");
	t.is(registry.getPendingUpdateCount(), 0, "Should not schedule anything");
});

test("SharedHashTree - multiple upserts are batched", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	await tree.upsertResources([createMockResource("b.js", "hash-b", Date.now(), 1024, 1)], Date.now());
	await tree.upsertResources([createMockResource("c.js", "hash-c", Date.now(), 2048, 2)], Date.now());

	t.is(registry.getPendingUpdateCount(), 2, "Should have 2 pending upserts");

	const result = await registry.flush();
	t.deepEqual(result.added.sort(), ["b.js", "c.js"], "Should add both resources");
});

// ============================================================================
// SharedHashTree removeResources Tests
// ============================================================================

test("SharedHashTree - removeResources schedules with registry", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	], registry);

	const result = await tree.removeResources(["b.js"]);

	t.is(result, undefined, "Should return undefined (scheduled mode)");
	t.is(registry.getPendingUpdateCount(), 1, "Should schedule removal with registry");
});

test("SharedHashTree - removeResources with empty array returns immediately", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	const result = await tree.removeResources([]);

	t.is(result, undefined, "Should return undefined");
	t.is(registry.getPendingUpdateCount(), 0, "Should not schedule anything");
});

test("SharedHashTree - multiple removals are batched", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"},
		{path: "c.js", integrity: "hash-c"}
	], registry);

	await tree.removeResources(["b.js"]);
	await tree.removeResources(["c.js"]);

	t.is(registry.getPendingUpdateCount(), 2, "Should have 2 pending removals");

	const result = await registry.flush();
	t.deepEqual(result.removed.sort(), ["b.js", "c.js"], "Should remove both resources");
});

// ============================================================================
// SharedHashTree deriveTree Tests
// ============================================================================

test("SharedHashTree - deriveTree creates SharedHashTree", (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	const tree2 = tree1.deriveTree([{path: "b.js", integrity: "hash-b"}]);

	t.true(tree2 instanceof SharedHashTree, "Derived tree should be SharedHashTree");
	t.is(tree2.registry, registry, "Derived tree should share same registry");
});

test("SharedHashTree - deriveTree registers derived tree", (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	t.is(registry.getTreeCount(), 1, "Should have 1 tree initially");

	tree1.deriveTree([{path: "b.js", integrity: "hash-b"}]);

	t.is(registry.getTreeCount(), 2, "Should have 2 trees after derivation");
});

test("SharedHashTree - deriveTree shares nodes with parent", (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	], registry);

	const tree2 = tree1.deriveTree([{path: "unique/c.js", integrity: "hash-c"}]);

	// Verify they share the "shared" directory node
	const sharedDir1 = tree1.root.children.get("shared");
	const sharedDir2 = tree2.root.children.get("shared");

	t.is(sharedDir1, sharedDir2, "Should share the same 'shared' directory node");
});

test("SharedHashTree - deriveTree with empty resources", (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	const tree2 = tree1.deriveTree([]);

	t.is(tree1.getRootHash(), tree2.getRootHash(), "Empty derivation should have same hash");
	t.true(tree2 instanceof SharedHashTree, "Should be SharedHashTree");
});

test("deriveTree - copies only modified directories (copy-on-write)", (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	], registry);

	// Derive a new tree (should share structure per design goal)
	const tree2 = tree1.deriveTree([]);

	// Check if they share the "shared" directory node initially
	const dir1Before = tree1.root.children.get("shared");
	const dir2Before = tree2.root.children.get("shared");

	t.is(dir1Before, dir2Before, "Should share same directory node after deriveTree");

	// Now insert into tree2 via the intended API (not directly)
	tree2._insertResourceWithSharing("shared/c.js", {integrity: "hash-c"});

	// Check what happened
	const dir1After = tree1.root.children.get("shared");
	const dir2After = tree2.root.children.get("shared");

	// EXPECTED BEHAVIOR (per copy-on-write):
	// - Tree2 should copy "shared" directory to add "c.js" without affecting tree1
	// - dir2After !== dir1After (tree2 has its own copy)
	// - dir1After === dir1Before (tree1 unchanged)

	t.is(dir1After, dir1Before, "Tree1 should be unaffected");
	t.not(dir2After, dir1After, "Tree2 should have its own copy after modification");
});

test("deriveTree - preserves structural sharing for unmodified paths", (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([
		{path: "shared/nested/deep/a.js", integrity: "hash-a"},
		{path: "other/b.js", integrity: "hash-b"}
	], registry);

	// Derive tree and add to "other" directory
	const tree2 = tree1.deriveTree([]);
	tree2._insertResourceWithSharing("other/c.js", {integrity: "hash-c"});

	// The "shared" directory should still be shared (not copied)
	// because we didn't modify it
	const sharedDir1 = tree1.root.children.get("shared");
	const sharedDir2 = tree2.root.children.get("shared");

	t.is(sharedDir1, sharedDir2,
		"Unmodified 'shared' directory should remain shared between trees");

	// But "other" should be copied (we modified it)
	const otherDir1 = tree1.root.children.get("other");
	const otherDir2 = tree2.root.children.get("other");

	t.not(otherDir1, otherDir2,
		"Modified 'other' directory should be copied in tree2");

	// Verify tree1 wasn't affected
	t.false(tree1.hasPath("other/c.js"), "Tree1 should not have c.js");
	t.true(tree2.hasPath("other/c.js"), "Tree2 should have c.js");
});

test("deriveTree - changes propagate to derived trees (shared view)", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([
		{path: "shared/a.js", integrity: "hash-a", lastModified: 1000, size: 100}
	], registry);

	// Create derived tree - it's a view on the same data, not an independent copy
	const tree2 = tree1.deriveTree([
		{path: "unique/b.js", integrity: "hash-b"}
	]);

	// Get reference to shared directory in both trees
	const sharedDir1 = tree1.root.children.get("shared");
	const sharedDir2 = tree2.root.children.get("shared");

	// By design: They SHOULD share the same node reference
	t.is(sharedDir1, sharedDir2, "Trees share directory nodes (intentional design)");

	// When tree1 is updated, tree2 sees the change (filtered view behavior)
	const indexTimestamp = tree1.getIndexTimestamp();
	await tree1.upsertResources([
		createMockResource("shared/a.js", "new-hash-a", indexTimestamp + 1, 101, 1)
	]);
	await registry.flush();

	// Both trees see the update as per design
	const node1 = tree1.root.children.get("shared").children.get("a.js");
	const node2 = tree2.root.children.get("shared").children.get("a.js");

	t.is(node1, node2, "Same resource node (shared reference)");
	t.is(node1.integrity, "new-hash-a", "Tree1 sees update");
	t.is(node2.integrity, "new-hash-a", "Tree2 also sees update (intentional)");

	// This is the intended behavior: derived trees are views, not snapshots
	// Tree2 filters which resources it exposes, but underlying data is shared
});


// ============================================================================
// getAddedResources Tests
// ============================================================================

test("getAddedResources - returns empty array when no resources added", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	], registry);

	const derivedTree = baseTree.deriveTree([]);

	const added = derivedTree.getAddedResources(baseTree);

	t.deepEqual(added, [], "Should return empty array when no resources added");
});

test("getAddedResources - returns added resources from derived tree", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	], registry);

	const derivedTree = baseTree.deriveTree([
		{path: "c.js", integrity: "hash-c", size: 100, lastModified: 1000, inode: 1},
		{path: "d.js", integrity: "hash-d", size: 200, lastModified: 2000, inode: 2}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 2, "Should return 2 added resources");
	t.deepEqual(added, [
		{path: "/c.js", integrity: "hash-c", size: 100, lastModified: 1000, inode: 1},
		{path: "/d.js", integrity: "hash-d", size: 200, lastModified: 2000, inode: 2}
	], "Should return correct added resources with metadata");
});

test("getAddedResources - handles nested directory additions", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "root/a.js", integrity: "hash-a"}
	], registry);

	const derivedTree = baseTree.deriveTree([
		{path: "root/nested/b.js", integrity: "hash-b", size: 100, lastModified: 1000, inode: 1},
		{path: "root/nested/c.js", integrity: "hash-c", size: 200, lastModified: 2000, inode: 2}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 2, "Should return 2 added resources");
	t.true(added.some((r) => r.path === "/root/nested/b.js"), "Should include nested b.js");
	t.true(added.some((r) => r.path === "/root/nested/c.js"), "Should include nested c.js");
});

test("getAddedResources - handles new directory with multiple resources", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "src/a.js", integrity: "hash-a"}
	], registry);

	const derivedTree = baseTree.deriveTree([
		{path: "lib/b.js", integrity: "hash-b", size: 100, lastModified: 1000, inode: 1},
		{path: "lib/c.js", integrity: "hash-c", size: 200, lastModified: 2000, inode: 2},
		{path: "lib/nested/d.js", integrity: "hash-d", size: 300, lastModified: 3000, inode: 3}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 3, "Should return 3 added resources");
	t.true(added.some((r) => r.path === "/lib/b.js"), "Should include lib/b.js");
	t.true(added.some((r) => r.path === "/lib/c.js"), "Should include lib/c.js");
	t.true(added.some((r) => r.path === "/lib/nested/d.js"), "Should include nested resource");
});

test("getAddedResources - preserves metadata for added resources", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"}
	], registry);

	const derivedTree = baseTree.deriveTree([
		{path: "b.js", integrity: "hash-b", size: 12345, lastModified: 9999, inode: 7777}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 1, "Should return 1 added resource");
	t.is(added[0].path, "/b.js", "Should have correct path");
	t.is(added[0].integrity, "hash-b", "Should preserve integrity");
	t.is(added[0].size, 12345, "Should preserve size");
	t.is(added[0].lastModified, 9999, "Should preserve lastModified");
	t.is(added[0].inode, 7777, "Should preserve inode");
});

test("getAddedResources - handles mixed shared and added resources", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	], registry);

	const derivedTree = baseTree.deriveTree([
		{path: "shared/c.js", integrity: "hash-c", size: 100, lastModified: 1000, inode: 1},
		{path: "unique/d.js", integrity: "hash-d", size: 200, lastModified: 2000, inode: 2}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 2, "Should return 2 added resources");
	t.true(added.some((r) => r.path === "/shared/c.js"), "Should include c.js in shared dir");
	t.true(added.some((r) => r.path === "/unique/d.js"), "Should include d.js in unique dir");
	t.false(added.some((r) => r.path === "/shared/a.js"), "Should not include shared a.js");
	t.false(added.some((r) => r.path === "/shared/b.js"), "Should not include shared b.js");
});

test("getAddedResources - handles deeply nested additions", (t) => {
	const registry = new TreeRegistry();
	const baseTree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a"}
	], registry);

	const derivedTree = baseTree.deriveTree([
		{path: "dir1/dir2/dir3/dir4/deep.js", integrity: "hash-deep", size: 100, lastModified: 1000, inode: 1}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 1, "Should return 1 added resource");
	t.is(added[0].path, "/dir1/dir2/dir3/dir4/deep.js", "Should have correct deeply nested path");
	t.is(added[0].integrity, "hash-deep", "Should preserve integrity");
});


// ============================================================================
// SharedHashTree with Registry Integration Tests
// ============================================================================

test("SharedHashTree - changes via registry affect tree", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);

	const originalHash = tree.getRootHash();

	await tree.upsertResources([createMockResource("b.js", "hash-b", Date.now(), 1024, 1)], Date.now());
	await registry.flush();

	const newHash = tree.getRootHash();
	t.not(originalHash, newHash, "Root hash should change after flush");
	t.true(tree.hasPath("b.js"), "Tree should have new resource");
});

test("SharedHashTree - batch updates via registry", async (t) => {
	const registry = new TreeRegistry();
	const tree = new SharedHashTree([
		{path: "a.js", integrity: "hash-a", lastModified: 1000, size: 100}
	], registry);

	const indexTimestamp = tree.getIndexTimestamp();

	// Schedule multiple operations
	await tree.upsertResources([createMockResource("b.js", "hash-b", Date.now(), 1024, 1)], Date.now());
	await tree.upsertResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)], Date.now());

	const result = await registry.flush();

	t.deepEqual(result.added, ["b.js"], "Should add b.js");
	t.deepEqual(result.updated, ["a.js"], "Should update a.js");
});

test("SharedHashTree - multiple trees coordinate via registry", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([
		{path: "shared/a.js", integrity: "hash-a"}
	], registry);

	const tree2 = tree1.deriveTree([{path: "unique/b.js", integrity: "hash-b"}]);

	// Verify they share directory nodes
	const sharedDir1Before = tree1.root.children.get("shared");
	const sharedDir2Before = tree2.root.children.get("shared");
	t.is(sharedDir1Before, sharedDir2Before, "Should share nodes before update");

	// Update shared resource via tree1
	const indexTimestamp = tree1.getIndexTimestamp();
	await tree1.upsertResources([
		createMockResource("shared/a.js", "new-hash-a", indexTimestamp + 1, 101, 1)
	], Date.now());

	await registry.flush();

	// Both trees see the change
	const node1 = tree1.root.children.get("shared").children.get("a.js");
	const node2 = tree2.root.children.get("shared").children.get("a.js");

	t.is(node1, node2, "Should share same resource node");
	t.is(node1.integrity, "new-hash-a", "Tree1 sees update");
	t.is(node2.integrity, "new-hash-a", "Tree2 sees update (shared node)");
});

test("SharedHashTree - registry tracks per-tree statistics", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);
	const tree2 = new SharedHashTree([{path: "b.js", integrity: "hash-b"}], registry);

	await tree1.upsertResources([createMockResource("c.js", "hash-c", Date.now(), 1024, 1)], Date.now());
	await tree2.upsertResources([createMockResource("d.js", "hash-d", Date.now(), 2048, 2)], Date.now());

	const result = await registry.flush();

	t.is(result.treeStats.size, 2, "Should have stats for 2 trees");
	// Each tree only sees additions for resources added to itself (not to other independent trees)
	const stats1 = result.treeStats.get(tree1);
	const stats2 = result.treeStats.get(tree2);

	// c.js is only added to tree1, d.js is only added to tree2
	t.deepEqual(stats1.added.sort(), ["c.js"], "Tree1 should see c.js addition");
	t.deepEqual(stats2.added.sort(), ["d.js"], "Tree2 should see d.js addition");
});

test("SharedHashTree - unregister removes tree from coordination", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new SharedHashTree([{path: "a.js", integrity: "hash-a"}], registry);
	new SharedHashTree([{path: "b.js", integrity: "hash-b"}], registry);

	t.is(registry.getTreeCount(), 2, "Should have 2 trees");

	registry.unregister(tree1);

	t.is(registry.getTreeCount(), 1, "Should have 1 tree after unregister");

	// Operations on tree1 no longer coordinated
	await tree1.upsertResources([createMockResource("c.js", "hash-c", Date.now(), 1024, 1)], Date.now());
	const result = await registry.flush();

	// tree1 not in results since it's unregistered
	t.is(result.treeStats.size, 1, "Should only have stats for tree2");
	t.false(result.treeStats.has(tree1), "Should not have stats for unregistered tree1");
});

test("SharedHashTree - complex multi-tree coordination", async (t) => {
	const registry = new TreeRegistry();

	// Create base tree
	const baseTree = new SharedHashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	], registry);

	// Derive two trees from base
	const derived1 = baseTree.deriveTree([{path: "d1/c.js", integrity: "hash-c"}]);
	const derived2 = baseTree.deriveTree([{path: "d2/d.js", integrity: "hash-d"}]);

	t.is(registry.getTreeCount(), 3, "Should have 3 trees");

	// Schedule updates to shared resource
	const indexTimestamp = baseTree.getIndexTimestamp();
	await baseTree.upsertResources([
		createMockResource("shared/a.js", "new-hash-a", indexTimestamp + 1, 101, 1)
	], Date.now());

	const result = await registry.flush();

	// All trees see the update
	t.deepEqual(result.treeStats.get(baseTree).updated, ["shared/a.js"]);
	t.deepEqual(result.treeStats.get(derived1).updated, ["shared/a.js"]);
	t.deepEqual(result.treeStats.get(derived2).updated, ["shared/a.js"]);

	// Verify shared nodes
	const sharedA1 = baseTree.root.children.get("shared").children.get("a.js");
	const sharedA2 = derived1.root.children.get("shared").children.get("a.js");
	const sharedA3 = derived2.root.children.get("shared").children.get("a.js");

	t.is(sharedA1, sharedA2, "baseTree and derived1 share node");
	t.is(sharedA1, sharedA3, "baseTree and derived2 share node");
	t.is(sharedA1.integrity, "new-hash-a", "All see updated value");
});
