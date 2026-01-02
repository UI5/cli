import test from "ava";
import sinon from "sinon";
import HashTree from "../../../../../lib/build/cache/index/HashTree.js";
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
// TreeRegistry Tests
// ============================================================================

test("TreeRegistry - register and track trees", (t) => {
	const registry = new TreeRegistry();
	new HashTree([{path: "a.js", integrity: "hash1"}], {registry});
	new HashTree([{path: "b.js", integrity: "hash2"}], {registry});

	t.is(registry.getTreeCount(), 2, "Should track both trees");
});

test("TreeRegistry - schedule and flush updates", async (t) => {
	const registry = new TreeRegistry();
	const resources = [{path: "file.js", integrity: "hash1"}];
	const tree = new HashTree(resources, {registry});

	const originalHash = tree.getRootHash();

	const resource = createMockResource("file.js", "hash2", Date.now(), 2048, 456);
	registry.scheduleUpdate(resource);
	t.is(registry.getPendingUpdateCount(), 1, "Should have one pending update");

	const result = await registry.flush();
	t.is(registry.getPendingUpdateCount(), 0, "Should have no pending updates after flush");
	t.deepEqual(result.updated, ["file.js"], "Should return changed resource path");

	const newHash = tree.getRootHash();
	t.not(originalHash, newHash, "Root hash should change after flush");
});

test("TreeRegistry - flush returns only changed resources", async (t) => {
	const registry = new TreeRegistry();
	const timestamp = Date.now();
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: timestamp, size: 1024, inode: 123},
		{path: "file2.js", integrity: "hash2", lastModified: timestamp, size: 2048, inode: 124}
	];
	new HashTree(resources, {registry});

	registry.scheduleUpdate(createMockResource("file1.js", "new-hash1", timestamp, 1024, 123));
	registry.scheduleUpdate(createMockResource("file2.js", "hash2", timestamp, 2048, 124)); // unchanged

	const result = await registry.flush();
	t.deepEqual(result.updated, ["file1.js"], "Should return only changed resource");
});

test("TreeRegistry - flush returns empty array when no changes", async (t) => {
	const registry = new TreeRegistry();
	const timestamp = Date.now();
	const resources = [{path: "file.js", integrity: "hash1", lastModified: timestamp, size: 1024, inode: 123}];
	new HashTree(resources, {registry});

	registry.scheduleUpdate(createMockResource("file.js", "hash1", timestamp, 1024, 123)); // same value

	const result = await registry.flush();
	t.deepEqual(result.updated, [], "Should return empty array when no actual changes");
});

test("TreeRegistry - batch updates affect all trees sharing nodes", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	];

	const tree1 = new HashTree(resources, {registry});
	const originalHash1 = tree1.getRootHash();

	// Create derived tree that shares "shared" directory
	const tree2 = tree1.deriveTree([{path: "unique/c.js", integrity: "hash-c"}]);
	const originalHash2 = tree2.getRootHash();
	t.not(originalHash1, originalHash2, "Hashes should differ due to unique content");

	// Verify they share the same "shared" directory node
	const sharedDir1 = tree1.root.children.get("shared");
	const sharedDir2 = tree2.root.children.get("shared");
	t.is(sharedDir1, sharedDir2, "Should share the same 'shared' directory node");

	// Update shared resource
	registry.scheduleUpdate(createMockResource("shared/a.js", "new-hash-a", Date.now(), 2048, 999));
	const result = await registry.flush();

	t.deepEqual(result.updated, ["shared/a.js"], "Should report the updated resource");

	const newHash1 = tree1.getRootHash();
	const newHash2 = tree2.getRootHash();

	t.not(originalHash1, newHash1, "Tree1 hash should change");
	t.not(originalHash2, newHash2, "Tree2 hash should change");
	t.not(newHash1, newHash2, "Hashes should differ due to unique content");

	// Both trees should see the update
	const resource1 = tree1.getResourceByPath("shared/a.js");
	const resource2 = tree2.getResourceByPath("shared/a.js");

	t.is(resource1.integrity, "new-hash-a", "Tree1 should have updated integrity");
	t.is(resource2.integrity, "new-hash-a", "Tree2 should have updated integrity (shared node)");
});

test("TreeRegistry - handles missing resources gracefully during flush", async (t) => {
	const registry = new TreeRegistry();
	new HashTree([{path: "exists.js", integrity: "hash1"}], {registry});

	// Schedule update for non-existent resource
	registry.scheduleUpdate(createMockResource("missing.js", "hash2", Date.now(), 1024, 444));

	// Should not throw
	await t.notThrows(async () => await registry.flush(), "Should handle missing resources gracefully");
});

test("TreeRegistry - multiple updates to same resource", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([{path: "file.js", integrity: "v1"}], {registry});

	const timestamp = Date.now();
	registry.scheduleUpdate(createMockResource("file.js", "v2", timestamp, 1024, 100));
	registry.scheduleUpdate(createMockResource("file.js", "v3", timestamp + 1, 1024, 100));
	registry.scheduleUpdate(createMockResource("file.js", "v4", timestamp + 2, 1024, 100));

	t.is(registry.getPendingUpdateCount(), 1, "Should consolidate updates to same path");

	await registry.flush();

	// Should apply the last update
	t.is(tree.getResourceByPath("file.js").integrity, "v4", "Should apply last update");
});

test("TreeRegistry - updates without changes lead to same hash", async (t) => {
	const registry = new TreeRegistry();
	const timestamp = Date.now();
	const tree = new HashTree([{
		path: "/src/foo/file1.js", integrity: "v1",
	}, {
		path: "/src/foo/file3.js", integrity: "v1",
	}, {
		path: "/src/foo/file2.js", integrity: "v1",
	}], {registry});
	const initialHash = tree.getRootHash();
	const file2Hash = tree.getResourceByPath("/src/foo/file2.js").hash;

	registry.scheduleUpdate(createMockResource("/src/foo/file2.js", "v1", timestamp, 1024, 200));

	t.is(registry.getPendingUpdateCount(), 1, "Should have one pending update");

	await registry.flush();

	// Should apply the last update
	t.is(tree.getResourceByPath("/src/foo/file2.js").hash.toString("hex"), file2Hash.toString("hex"),
		"Should have same has for file");
	t.is(tree.getRootHash(), initialHash, "Root hash should remain unchanged");
});

test("TreeRegistry - unregister tree", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new HashTree([{path: "a.js", integrity: "hash1"}], {registry});
	const tree2 = new HashTree([{path: "b.js", integrity: "hash2"}], {registry});

	t.is(registry.getTreeCount(), 2);

	registry.unregister(tree1);
	t.is(registry.getTreeCount(), 1);

	// Flush should only affect tree2
	registry.scheduleUpdate(createMockResource("b.js", "new-hash2", Date.now(), 1024, 777));
	await registry.flush();

	t.notThrows(() => tree2.getRootHash(), "Tree2 should still work");
});

// ============================================================================
// Derived Tree Tests
// ============================================================================

test("deriveTree - creates tree sharing subtrees", (t) => {
	const resources = [
		{path: "dir1/a.js", integrity: "hash-a"},
		{path: "dir1/b.js", integrity: "hash-b"}
	];

	const tree1 = new HashTree(resources);
	const tree2 = tree1.deriveTree([{path: "dir2/c.js", integrity: "hash-c"}]);

	// Both trees should have dir1
	t.truthy(tree2.hasPath("dir1/a.js"), "Derived tree should have shared resources");
	t.truthy(tree2.hasPath("dir2/c.js"), "Derived tree should have new resources");

	// Tree1 should not have dir2
	t.false(tree1.hasPath("dir2/c.js"), "Original tree should not have derived resources");
});

test("deriveTree - shared nodes are the same reference", (t) => {
	const resources = [
		{path: "shared/file.js", integrity: "hash1"}
	];

	const tree1 = new HashTree(resources);
	const tree2 = tree1.deriveTree([]);

	// Get the shared directory node from both trees
	const dir1 = tree1.root.children.get("shared");
	const dir2 = tree2.root.children.get("shared");

	t.is(dir1, dir2, "Shared directory nodes should be same reference");

	// Get the file node
	const file1 = dir1.children.get("file.js");
	const file2 = dir2.children.get("file.js");

	t.is(file1, file2, "Shared resource nodes should be same reference");
});

test("deriveTree - updates to shared nodes visible in all trees", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		{path: "shared/file.js", integrity: "original"}
	];

	const tree1 = new HashTree(resources, {registry});
	const tree2 = tree1.deriveTree([]);

	// Get nodes before update
	const node1Before = tree1.getResourceByPath("shared/file.js");
	const node2Before = tree2.getResourceByPath("shared/file.js");

	t.is(node1Before, node2Before, "Should be same node reference");
	t.is(node1Before.integrity, "original", "Original integrity");

	// Update via registry
	registry.scheduleUpdate(createMockResource("shared/file.js", "updated", Date.now(), 1024, 555));
	await registry.flush();

	// Both should see the update (same node)
	t.is(node1Before.integrity, "updated", "Tree1 node should be updated");
	t.is(node2Before.integrity, "updated", "Tree2 node should be updated (same reference)");
});

test("deriveTree - multiple levels of derivation", async (t) => {
	const registry = new TreeRegistry();

	const tree1 = new HashTree([{path: "a.js", integrity: "hash-a"}], {registry});
	const tree2 = tree1.deriveTree([{path: "b.js", integrity: "hash-b"}]);
	const tree3 = tree2.deriveTree([{path: "c.js", integrity: "hash-c"}]);

	t.truthy(tree3.hasPath("a.js"), "Should have resources from tree1");
	t.truthy(tree3.hasPath("b.js"), "Should have resources from tree2");
	t.truthy(tree3.hasPath("c.js"), "Should have its own resources");

	// Update shared resource
	registry.scheduleUpdate(createMockResource("a.js", "new-hash-a", Date.now(), 1024, 111));
	await registry.flush();

	// All trees should see the update
	t.is(tree1.getResourceByPath("a.js").integrity, "new-hash-a");
	t.is(tree2.getResourceByPath("a.js").integrity, "new-hash-a");
	t.is(tree3.getResourceByPath("a.js").integrity, "new-hash-a");
});

test("deriveTree - efficient hash recomputation", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		{path: "dir1/a.js", integrity: "hash-a"},
		{path: "dir1/b.js", integrity: "hash-b"},
		{path: "dir2/c.js", integrity: "hash-c"}
	];

	const tree1 = new HashTree(resources, {registry});
	const tree2 = tree1.deriveTree([{path: "dir3/d.js", integrity: "hash-d"}]);

	// Spy on _computeHash to count calls
	const computeSpy = sinon.spy(tree1, "_computeHash");
	const compute2Spy = sinon.spy(tree2, "_computeHash");

	// Update resource in shared directory
	registry.scheduleUpdate(createMockResource("dir1/a.js", "new-hash-a", Date.now(), 2048, 222));
	await registry.flush();

	// Each affected directory should be hashed once per tree
	// dir1/a.js node, dir1 node, root node for each tree
	t.true(computeSpy.callCount >= 3, "Tree1 should recompute affected nodes");
	t.true(compute2Spy.callCount >= 3, "Tree2 should recompute affected nodes");
});

test("deriveTree - independent updates to different directories", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		{path: "dir1/a.js", integrity: "hash-a"}
	];

	const tree1 = new HashTree(resources, {registry});
	const tree2 = tree1.deriveTree([{path: "dir2/b.js", integrity: "hash-b"}]);

	const hash1Before = tree1.getRootHash();
	const hash2Before = tree2.getRootHash();

	// Update only in tree2's unique directory
	registry.scheduleUpdate(createMockResource("dir2/b.js", "new-hash-b", Date.now(), 1024, 333));
	await registry.flush();

	const hash1After = tree1.getRootHash();
	const hash2After = tree2.getRootHash();

	// Both trees are affected because they share the root and dir2 is added/updated via registry
	t.not(hash1Before, hash1After, "Tree1 hash changes (dir2 added to shared root)");
	t.not(hash2Before, hash2After, "Tree2 hash should change");

	// Tree1 now has dir2 because registry ensures directory path exists
	t.truthy(tree1.hasPath("dir2/b.js"), "Tree1 should now have dir2/b.js");
	t.truthy(tree2.hasPath("dir2/b.js"), "Tree2 should have dir2/b.js");
});

test("deriveTree - preserves tree statistics correctly", (t) => {
	const resources = [
		{path: "dir1/a.js", integrity: "hash-a"},
		{path: "dir1/b.js", integrity: "hash-b"}
	];

	const tree1 = new HashTree(resources);
	const tree2 = tree1.deriveTree([
		{path: "dir2/c.js", integrity: "hash-c"},
		{path: "dir2/d.js", integrity: "hash-d"}
	]);

	const stats1 = tree1.getStats();
	const stats2 = tree2.getStats();

	t.is(stats1.resources, 2, "Tree1 should have 2 resources");
	t.is(stats2.resources, 4, "Tree2 should have 4 resources");
	t.true(stats2.directories >= stats1.directories, "Tree2 should have at least as many directories");
});

test("deriveTree - empty derivation creates exact copy with shared nodes", (t) => {
	const resources = [
		{path: "file.js", integrity: "hash1"}
	];

	const tree1 = new HashTree(resources);
	const tree2 = tree1.deriveTree([]);

	// Should have same structure
	t.is(tree1.getRootHash(), tree2.getRootHash(), "Should have same root hash");

	// But different root nodes (shallow copied)
	t.not(tree1.root, tree2.root, "Root nodes should be different");

	// But shared children
	const child1 = tree1.root.children.get("file.js");
	const child2 = tree2.root.children.get("file.js");
	t.is(child1, child2, "Children should be shared");
});

test("deriveTree - complex shared structure", async (t) => {
	const registry = new TreeRegistry();
	const resources = [
		{path: "shared/deep/nested/file1.js", integrity: "hash1"},
		{path: "shared/deep/file2.js", integrity: "hash2"},
		{path: "shared/file3.js", integrity: "hash3"}
	];

	const tree1 = new HashTree(resources, {registry});
	const tree2 = tree1.deriveTree([
		{path: "unique/file4.js", integrity: "hash4"}
	]);

	// Update deeply nested shared file
	registry.scheduleUpdate(createMockResource("shared/deep/nested/file1.js", "new-hash1", Date.now(), 2048, 666));
	await registry.flush();

	// Both trees should reflect the change
	t.is(tree1.getResourceByPath("shared/deep/nested/file1.js").integrity, "new-hash1");
	t.is(tree2.getResourceByPath("shared/deep/nested/file1.js").integrity, "new-hash1");

	// Root hashes should both change
	const paths1 = tree1.getResourcePaths();
	const paths2 = tree2.getResourcePaths();

	t.is(paths1.length, 3, "Tree1 should have 3 resources");
	t.is(paths2.length, 4, "Tree2 should have 4 resources");
});

// ============================================================================
// upsertResources Tests with Registry
// ============================================================================

test("upsertResources - with registry schedules operations", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([{path: "a.js", integrity: "hash-a"}], {registry});

	const result = await tree.upsertResources([
		createMockResource("b.js", "hash-b", Date.now(), 1024, 1)
	]);

	t.is(result, undefined, "Should return undefined in scheduled mode");
});

test("upsertResources - with registry and flush", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([{path: "a.js", integrity: "hash-a"}], {registry});
	const originalHash = tree.getRootHash();

	await tree.upsertResources([
		createMockResource("b.js", "hash-b", Date.now(), 1024, 1),
		createMockResource("c.js", "hash-c", Date.now(), 2048, 2)
	]);

	const result = await registry.flush();

	t.truthy(result.added, "Result should have added array");
	t.true(result.added.includes("b.js"), "Should report b.js as added");
	t.true(result.added.includes("c.js"), "Should report c.js as added");

	t.truthy(tree.hasPath("b.js"), "Tree should have b.js");
	t.truthy(tree.hasPath("c.js"), "Tree should have c.js");
	t.not(tree.getRootHash(), originalHash, "Root hash should change");
});

test("upsertResources - with derived trees", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new HashTree([{path: "shared/a.js", integrity: "hash-a"}], {registry});
	const tree2 = tree1.deriveTree([{path: "unique/b.js", integrity: "hash-b"}]);

	await tree1.upsertResources([
		createMockResource("shared/c.js", "hash-c", Date.now(), 1024, 3)
	]);

	await registry.flush();

	t.truthy(tree1.hasPath("shared/c.js"), "Tree1 should have shared/c.js");
	t.truthy(tree2.hasPath("shared/c.js"), "Tree2 should also have shared/c.js");
	t.false(tree1.hasPath("unique/b.js"), "Tree1 should not have unique/b.js");
	t.truthy(tree2.hasPath("unique/b.js"), "Tree2 should have unique/b.js");
});

// ============================================================================
// removeResources Tests with Registry
// ============================================================================

test("removeResources - with registry schedules operations", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	], {registry});

	const result = await tree.removeResources(["b.js"]);

	t.is(result, undefined, "Should return undefined in scheduled mode");
});

test("removeResources - with registry and flush", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"},
		{path: "c.js", integrity: "hash-c"}
	], {registry});
	const originalHash = tree.getRootHash();

	await tree.removeResources(["b.js", "c.js"]);

	const result = await registry.flush();

	t.truthy(result.removed, "Result should have removed array");
	t.true(result.removed.includes("b.js"), "Should report b.js as removed");
	t.true(result.removed.includes("c.js"), "Should report c.js as removed");

	t.truthy(tree.hasPath("a.js"), "Tree should still have a.js");
	t.false(tree.hasPath("b.js"), "Tree should not have b.js");
	t.false(tree.hasPath("c.js"), "Tree should not have c.js");
	t.not(tree.getRootHash(), originalHash, "Root hash should change");
});

test("removeResources - with derived trees propagates removal", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new HashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	], {registry});
	const tree2 = tree1.deriveTree([{path: "unique/c.js", integrity: "hash-c"}]);

	// Verify both trees share the resources
	t.truthy(tree1.hasPath("shared/a.js"));
	t.truthy(tree1.hasPath("shared/b.js"));
	t.truthy(tree2.hasPath("shared/a.js"));
	t.truthy(tree2.hasPath("shared/b.js"));

	// Remove from shared directory
	await tree1.removeResources(["shared/b.js"]);
	await registry.flush();

	// Both trees should see the removal
	t.truthy(tree1.hasPath("shared/a.js"), "Tree1 should still have shared/a.js");
	t.false(tree1.hasPath("shared/b.js"), "Tree1 should not have shared/b.js");
	t.truthy(tree2.hasPath("shared/a.js"), "Tree2 should still have shared/a.js");
	t.false(tree2.hasPath("shared/b.js"), "Tree2 should not have shared/b.js");
	t.truthy(tree2.hasPath("unique/c.js"), "Tree2 should still have unique/c.js");
});

// ============================================================================
// Combined upsert and remove operations with Registry
// ============================================================================

test("upsertResources and removeResources - combined operations", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	], {registry});
	const originalHash = tree.getRootHash();

	// Schedule both operations
	await tree.upsertResources([
		createMockResource("c.js", "hash-c", Date.now(), 1024, 3)
	]);
	await tree.removeResources(["b.js"]);

	const result = await registry.flush();

	t.true(result.added.includes("c.js"), "Should add c.js");
	t.true(result.removed.includes("b.js"), "Should remove b.js");

	t.truthy(tree.hasPath("a.js"), "Tree should have a.js");
	t.false(tree.hasPath("b.js"), "Tree should not have b.js");
	t.truthy(tree.hasPath("c.js"), "Tree should have c.js");
	t.not(tree.getRootHash(), originalHash, "Root hash should change");
});

test("upsertResources and removeResources - conflicting operations on same path", async (t) => {
	const registry = new TreeRegistry();
	const tree = new HashTree([{path: "a.js", integrity: "hash-a"}], {registry});

	// Schedule removal then upsert (upsert should win)
	await tree.removeResources(["a.js"]);
	await tree.upsertResources([
		createMockResource("a.js", "new-hash-a", Date.now(), 1024, 1)
	]);

	const result = await registry.flush();

	// Upsert cancels removal
	t.deepEqual(result.removed, [], "Should have no removals");
	t.true(result.updated.includes("a.js") || result.changed.includes("a.js"), "Should update or keep a.js");
	t.truthy(tree.hasPath("a.js"), "Tree should still have a.js");
});

// ============================================================================
// Per-Tree Statistics Tests
// ============================================================================

test("TreeRegistry - flush returns per-tree statistics", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new HashTree([{path: "a.js", integrity: "hash-a"}], {registry});
	const tree2 = new HashTree([{path: "b.js", integrity: "hash-b"}], {registry});

	// Update tree1 resource
	registry.scheduleUpdate(createMockResource("a.js", "new-hash-a", Date.now(), 1024, 1));
	// Add new resource - gets added to all trees
	registry.scheduleUpsert(createMockResource("c.js", "hash-c", Date.now(), 2048, 2));

	const result = await registry.flush();

	// Verify global results
	// a.js gets updated in tree1 but added to tree2 (didn't exist before)
	t.true(result.updated.includes("a.js"), "Should report a.js as updated");
	t.true(result.added.includes("c.js"), "Should report c.js as added");
	t.true(result.added.includes("a.js"), "Should report a.js as added to tree2");

	// Verify per-tree statistics
	t.truthy(result.treeStats, "Should have treeStats");
	t.is(result.treeStats.size, 2, "Should have stats for both trees");

	const stats1 = result.treeStats.get(tree1);
	const stats2 = result.treeStats.get(tree2);

	t.truthy(stats1, "Should have stats for tree1");
	t.truthy(stats2, "Should have stats for tree2");

	// Tree1: 1 update to a.js, 1 add for c.js
	t.is(stats1.updated.length, 1, "Tree1 should have 1 update (a.js)");
	t.true(stats1.updated.includes("a.js"), "Tree1 should have a.js in updated");
	t.is(stats1.added.length, 1, "Tree1 should have 1 addition (c.js)");
	t.true(stats1.added.includes("c.js"), "Tree1 should have c.js in added");
	t.is(stats1.unchanged.length, 0, "Tree1 should have 0 unchanged");
	t.is(stats1.removed.length, 0, "Tree1 should have 0 removals");

	// Tree2: 1 add for c.js, 1 add for a.js (didn't exist in tree2)
	t.is(stats2.updated.length, 0, "Tree2 should have 0 updates");
	t.is(stats2.added.length, 2, "Tree2 should have 2 additions (a.js, c.js)");
	t.true(stats2.added.includes("a.js"), "Tree2 should have a.js in added");
	t.true(stats2.added.includes("c.js"), "Tree2 should have c.js in added");
	t.is(stats2.unchanged.length, 0, "Tree2 should have 0 unchanged");
	t.is(stats2.removed.length, 0, "Tree2 should have 0 removals");
});

test("TreeRegistry - per-tree statistics with shared nodes", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new HashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	], {registry});
	const tree2 = tree1.deriveTree([{path: "unique/c.js", integrity: "hash-c"}]);

	// Verify trees share the "shared" directory
	const sharedDir1 = tree1.root.children.get("shared");
	const sharedDir2 = tree2.root.children.get("shared");
	t.is(sharedDir1, sharedDir2, "Should share the same 'shared' directory node");

	// Update shared resource
	registry.scheduleUpdate(createMockResource("shared/a.js", "new-hash-a", Date.now(), 1024, 1));

	const result = await registry.flush();

	// Verify global results
	t.deepEqual(result.updated, ["shared/a.js"], "Should report shared/a.js as updated");

	// Verify per-tree statistics
	const stats1 = result.treeStats.get(tree1);
	const stats2 = result.treeStats.get(tree2);

	// Both trees should count the update since they share the node
	t.is(stats1.updated.length, 1, "Tree1 should count the shared update");
	t.true(stats1.updated.includes("shared/a.js"), "Tree1 should have shared/a.js in updated");
	t.is(stats2.updated.length, 1, "Tree2 should count the shared update");
	t.true(stats2.updated.includes("shared/a.js"), "Tree2 should have shared/a.js in updated");
	t.is(stats1.added.length, 0, "Tree1 should have 0 additions");
	t.is(stats2.added.length, 0, "Tree2 should have 0 additions");
	t.is(stats1.unchanged.length, 0, "Tree1 should have 0 unchanged");
	t.is(stats2.unchanged.length, 0, "Tree2 should have 0 unchanged");
	t.is(stats1.removed.length, 0, "Tree1 should have 0 removals");
	t.is(stats2.removed.length, 0, "Tree2 should have 0 removals");
});

test("TreeRegistry - per-tree statistics with mixed operations", async (t) => {
	const registry = new TreeRegistry();
	const tree1 = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"},
		{path: "c.js", integrity: "hash-c"}
	], {registry});
	const tree2 = tree1.deriveTree([{path: "d.js", integrity: "hash-d"}]);

	// Update a.js (affects both trees - shared)
	registry.scheduleUpdate(createMockResource("a.js", "new-hash-a", Date.now(), 1024, 1));
	// Remove b.js (affects both trees - shared)
	registry.scheduleRemoval("b.js");
	// Add e.js (affects both trees)
	registry.scheduleUpsert(createMockResource("e.js", "hash-e", Date.now(), 2048, 5));
	// Update d.js (exists in tree2, will be added to tree1)
	registry.scheduleUpdate(createMockResource("d.js", "new-hash-d", Date.now(), 1024, 4));

	const result = await registry.flush();

	// Verify per-tree statistics
	const stats1 = result.treeStats.get(tree1);
	const stats2 = result.treeStats.get(tree2);

	// Tree1: 1 update (a.js), 2 additions (e.js, d.js), 1 removal (b.js)
	t.is(stats1.updated.length, 1, "Tree1 should have 1 update (a.js)");
	t.true(stats1.updated.includes("a.js"), "Tree1 should have a.js in updated");
	t.is(stats1.added.length, 2, "Tree1 should have 2 additions (e.js, d.js)");
	t.true(stats1.added.includes("e.js"), "Tree1 should have e.js in added");
	t.true(stats1.added.includes("d.js"), "Tree1 should have d.js in added");
	t.is(stats1.unchanged.length, 0, "Tree1 should have 0 unchanged");
	t.is(stats1.removed.length, 1, "Tree1 should have 1 removal (b.js)");
	t.true(stats1.removed.includes("b.js"), "Tree1 should have b.js in removed");

	// Tree2: 2 updates (a.js shared, d.js), 1 addition (e.js), 1 removal (b.js shared)
	t.is(stats2.updated.length, 2, "Tree2 should have 2 updates (a.js, d.js)");
	t.true(stats2.updated.includes("a.js"), "Tree2 should have a.js in updated");
	t.true(stats2.updated.includes("d.js"), "Tree2 should have d.js in updated");
	t.is(stats2.added.length, 1, "Tree2 should have 1 addition (e.js)");
	t.true(stats2.added.includes("e.js"), "Tree2 should have e.js in added");
	t.is(stats2.unchanged.length, 0, "Tree2 should have 0 unchanged");
	t.is(stats2.removed.length, 1, "Tree2 should have 1 removal (b.js)");
	t.true(stats2.removed.includes("b.js"), "Tree2 should have b.js in removed");
});

test("TreeRegistry - per-tree statistics with no changes", async (t) => {
	const registry = new TreeRegistry();
	const timestamp = Date.now();
	const tree1 = new HashTree([{
		path: "a.js",
		integrity: "hash-a",
		lastModified: timestamp,
		size: 1024,
		inode: 100
	}], {registry});
	const tree2 = new HashTree([{
		path: "b.js",
		integrity: "hash-b",
		lastModified: timestamp,
		size: 2048,
		inode: 200
	}], {registry});

	// Schedule updates with unchanged metadata
	// Note: These will add missing resources to the other tree
	registry.scheduleUpdate(createMockResource("a.js", "hash-a", timestamp, 1024, 100));
	registry.scheduleUpdate(createMockResource("b.js", "hash-b", timestamp, 2048, 200));

	const result = await registry.flush();

	// a.js is unchanged in tree1 but added to tree2
	// b.js is unchanged in tree2 but added to tree1
	t.deepEqual(result.updated, [], "Should have no updates");
	t.true(result.added.includes("a.js"), "a.js should be added to tree2");
	t.true(result.added.includes("b.js"), "b.js should be added to tree1");
	t.true(result.unchanged.includes("a.js"), "a.js should be unchanged in tree1");
	t.true(result.unchanged.includes("b.js"), "b.js should be unchanged in tree2");

	// Verify per-tree statistics
	const stats1 = result.treeStats.get(tree1);
	const stats2 = result.treeStats.get(tree2);

	// Tree1: a.js unchanged, b.js added
	t.is(stats1.updated.length, 0, "Tree1 should have 0 updates");
	t.is(stats1.added.length, 1, "Tree1 should have 1 addition (b.js)");
	t.true(stats1.added.includes("b.js"), "Tree1 should have b.js in added");
	t.is(stats1.unchanged.length, 1, "Tree1 should have 1 unchanged (a.js)");
	t.true(stats1.unchanged.includes("a.js"), "Tree1 should have a.js in unchanged");
	t.is(stats1.removed.length, 0, "Tree1 should have 0 removals");

	// Tree2: b.js unchanged, a.js added
	t.is(stats2.updated.length, 0, "Tree2 should have 0 updates");
	t.is(stats2.added.length, 1, "Tree2 should have 1 addition (a.js)");
	t.true(stats2.added.includes("a.js"), "Tree2 should have a.js in added");
	t.is(stats2.unchanged.length, 1, "Tree2 should have 1 unchanged (b.js)");
	t.true(stats2.unchanged.includes("b.js"), "Tree2 should have b.js in unchanged");
	t.is(stats2.removed.length, 0, "Tree2 should have 0 removals");
});

test("TreeRegistry - empty flush returns empty treeStats", async (t) => {
	const registry = new TreeRegistry();
	new HashTree([{path: "a.js", integrity: "hash-a"}], {registry});
	new HashTree([{path: "b.js", integrity: "hash-b"}], {registry});

	// Flush without scheduling any operations
	const result = await registry.flush();

	t.truthy(result.treeStats, "Should have treeStats");
	t.is(result.treeStats.size, 0, "Should have empty treeStats when no operations");
	t.deepEqual(result.added, [], "Should have no additions");
	t.deepEqual(result.updated, [], "Should have no updates");
	t.deepEqual(result.removed, [], "Should have no removals");
});

test("TreeRegistry - derived tree reflects base tree resource changes in statistics", async (t) => {
	const registry = new TreeRegistry();

	// Create base tree with some resources
	const baseTree = new HashTree([
		{path: "shared/resource1.js", integrity: "hash1"},
		{path: "shared/resource2.js", integrity: "hash2"}
	], {registry});

	// Derive a new tree from base tree (shares same registry)
	// Note: deriveTree doesn't schedule the new resources, it adds them directly to the derived tree
	const derivedTree = baseTree.deriveTree([
		{path: "derived/resource3.js", integrity: "hash3"}
	]);

	// Verify both trees are registered
	t.is(registry.getTreeCount(), 2, "Registry should have both trees");

	// Verify they share the same nodes
	const sharedDir1 = baseTree.root.children.get("shared");
	const sharedDir2 = derivedTree.root.children.get("shared");
	t.is(sharedDir1, sharedDir2, "Both trees should share the 'shared' directory node");

	// Update a resource that exists in base tree (and is shared with derived tree)
	registry.scheduleUpdate(createMockResource("shared/resource1.js", "new-hash1", Date.now(), 2048, 100));

	// Add a new resource to the shared path
	registry.scheduleUpsert(createMockResource("shared/resource4.js", "hash4", Date.now(), 1024, 200));

	// Remove a shared resource
	registry.scheduleRemoval("shared/resource2.js");

	const result = await registry.flush();

	// Verify global results
	t.deepEqual(result.updated, ["shared/resource1.js"], "Should report resource1 as updated");
	t.true(result.added.includes("shared/resource4.js"), "Should report resource4 as added");
	t.deepEqual(result.removed, ["shared/resource2.js"], "Should report resource2 as removed");

	// Verify per-tree statistics
	const baseStats = result.treeStats.get(baseTree);
	const derivedStats = result.treeStats.get(derivedTree);

	// Base tree statistics
	// Base tree will also get derived/resource3.js added via registry (since it processes all trees)
	t.is(baseStats.updated.length, 1, "Base tree should have 1 update");
	t.true(baseStats.updated.includes("shared/resource1.js"), "Base tree should have resource1 in updated");
	// baseStats.added should include both resource4 and resource3
	t.true(baseStats.added.includes("shared/resource4.js"), "Base tree should have resource4 in added");
	t.is(baseStats.removed.length, 1, "Base tree should have 1 removal");
	t.true(baseStats.removed.includes("shared/resource2.js"), "Base tree should have resource2 in removed");

	// Derived tree statistics - CRITICAL: should reflect the same changes for shared resources
	// Note: resource4 shows as "updated" because it's added to an already-existing shared node that was modified
	t.is(derivedStats.updated.length, 2, "Derived tree should have 2 updates (resource1 changed, resource4 added to shared dir)");
	t.true(derivedStats.updated.includes("shared/resource1.js"), "Derived tree should have resource1 in updated");
	t.true(derivedStats.updated.includes("shared/resource4.js"), "Derived tree should have resource4 in updated");
	t.is(derivedStats.added.length, 0, "Derived tree should have 0 additions tracked separately");
	t.is(derivedStats.removed.length, 1, "Derived tree should have 1 removal (shared resource2)");
	t.true(derivedStats.removed.includes("shared/resource2.js"), "Derived tree should have resource2 in removed");

	// Verify the actual tree state
	t.is(baseTree.getResourceByPath("shared/resource1.js").integrity, "new-hash1", "Base tree should have updated integrity");
	t.is(derivedTree.getResourceByPath("shared/resource1.js").integrity, "new-hash1", "Derived tree should have updated integrity (shared node)");
	t.truthy(baseTree.hasPath("shared/resource4.js"), "Base tree should have new resource");
	t.truthy(derivedTree.hasPath("shared/resource4.js"), "Derived tree should have new resource (shared)");
	t.false(baseTree.hasPath("shared/resource2.js"), "Base tree should not have removed resource");
	t.false(derivedTree.hasPath("shared/resource2.js"), "Derived tree should not have removed resource (shared)");
});
