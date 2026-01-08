import test from "ava";
import sinon from "sinon";
import HashTree from "../../../../../lib/build/cache/index/HashTree.js";

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

test("Create HashTree", (t) => {
	const mt = new HashTree();
	t.truthy(mt, "HashTree instance created");
});

test("Two instances with same resources produce same root hash", (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1"},
		{path: "file2.js", integrity: "hash2"},
		{path: "dir/file3.js", integrity: "hash3"}
	];

	const tree1 = new HashTree(resources);
	const tree2 = new HashTree(resources);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Trees with identical resources should have identical root hashes");
});

test("Order of resource insertion doesn't affect root hash", (t) => {
	const resources1 = [
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"},
		{path: "c.js", integrity: "hash-c"}
	];

	const resources2 = [
		{path: "c.js", integrity: "hash-c"},
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	];

	const tree1 = new HashTree(resources1);
	const tree2 = new HashTree(resources2);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Trees should produce same hash regardless of insertion order");
});

test("Updating resources in two trees produces same root hash", async (t) => {
	const initialResources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200},
		{path: "dir/file3.js", integrity: "hash3", lastModified: 3000, size: 300}
	];

	const tree1 = new HashTree(initialResources);
	const tree2 = new HashTree(initialResources);
	const indexTimestamp = tree1.getIndexTimestamp();

	// Update same resource in both trees
	const resource = createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1);
	await tree1.updateResources([resource]);
	await tree2.updateResources([resource]);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Trees should have same root hash after identical updates");
});

test("Multiple updates in same order produce same root hash", async (t) => {
	const initialResources = [
		{path: "a.js", integrity: "hash-a", lastModified: 1000, size: 100},
		{path: "b.js", integrity: "hash-b", lastModified: 2000, size: 200},
		{path: "c.js", integrity: "hash-c", lastModified: 3000, size: 300},
		{path: "dir/d.js", integrity: "hash-d", lastModified: 4000, size: 400}
	];

	const tree1 = new HashTree(initialResources);
	const tree2 = new HashTree(initialResources);
	const indexTimestamp = tree1.getIndexTimestamp();

	// Update multiple resources in same order
	await tree1.updateResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree1.updateResources([createMockResource("dir/d.js", "new-hash-d", indexTimestamp + 1, 401, 4)]);
	await tree1.updateResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);

	await tree2.updateResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree2.updateResources([createMockResource("dir/d.js", "new-hash-d", indexTimestamp + 1, 401, 4)]);
	await tree2.updateResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Trees should have same root hash after same sequence of updates");
});

test("Multiple updates in different order produce same root hash", async (t) => {
	const initialResources = [
		{path: "a.js", integrity: "hash-a", lastModified: 1000, size: 100},
		{path: "b.js", integrity: "hash-b", lastModified: 2000, size: 200},
		{path: "c.js", integrity: "hash-c", lastModified: 3000, size: 300}
	];

	const tree1 = new HashTree(initialResources);
	const tree2 = new HashTree(initialResources);
	const indexTimestamp = tree1.getIndexTimestamp();

	// Update in different orders
	await tree1.updateResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree1.updateResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);
	await tree1.updateResources([createMockResource("c.js", "new-hash-c", indexTimestamp + 1, 301, 3)]);

	await tree2.updateResources([createMockResource("c.js", "new-hash-c", indexTimestamp + 1, 301, 3)]);
	await tree2.updateResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree2.updateResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Trees should have same root hash regardless of update order");
});

test("Batch updates produce same hash as individual updates", async (t) => {
	const initialResources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200},
		{path: "file3.js", integrity: "hash3", lastModified: 3000, size: 300}
	];

	const tree1 = new HashTree(initialResources);
	const tree2 = new HashTree(initialResources);
	const indexTimestamp = tree1.getIndexTimestamp();

	// Individual updates
	await tree1.updateResources([createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)]);
	await tree1.updateResources([createMockResource("file2.js", "new-hash2", indexTimestamp + 1, 201, 2)]);

	// Batch update
	const resources = [
		createMockResource("file1.js", "new-hash1", 1001, 101, 1),
		createMockResource("file2.js", "new-hash2", 2001, 201, 2)
	];
	await tree2.updateResources(resources);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Batch updates should produce same hash as individual updates");
});

test("Updating resource changes root hash", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200}
	];

	const tree = new HashTree(resources);
	const originalHash = tree.getRootHash();
	const indexTimestamp = tree.getIndexTimestamp();

	await tree.updateResources([createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)]);
	const newHash = tree.getRootHash();

	t.not(originalHash, newHash,
		"Root hash should change after resource update");
});

test("Updating resource back to original value restores original hash", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200}
	];

	const tree = new HashTree(resources);
	const originalHash = tree.getRootHash();
	const indexTimestamp = tree.getIndexTimestamp();

	// Update and then revert
	await tree.updateResources([createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)]);
	await tree.updateResources([createMockResource("file1.js", "hash1", 1000, 100, 1)]);

	t.is(tree.getRootHash(), originalHash,
		"Root hash should be restored when resource is reverted to original value");
});

test("updateResource returns changed resource path", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100}
	];

	const tree = new HashTree(resources);
	const indexTimestamp = tree.getIndexTimestamp();
	const changed = await tree.updateResources([
		createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)
	]);

	t.deepEqual(changed, ["file1.js"], "Should return path of changed resource");
});

test("updateResource returns empty array when integrity unchanged", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100}
	];

	const tree = new HashTree(resources);
	const changed = await tree.updateResources([createMockResource("file1.js", "hash1", 1000, 100, 1)]);

	t.deepEqual(changed, [], "Should return empty array when integrity unchanged");
});

test("updateResource does not change hash when integrity unchanged", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100}
	];

	const tree = new HashTree(resources);
	const originalHash = tree.getRootHash();
	await tree.updateResources([createMockResource("file1.js", "hash1", 1000, 100, 1)]);

	t.is(tree.getRootHash(), originalHash, "Hash should not change when integrity unchanged");
});

test("updateResources returns changed resource paths", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200},
		{path: "file3.js", integrity: "hash3", lastModified: 3000, size: 300}
	];

	const tree = new HashTree(resources);
	const indexTimestamp = tree.getIndexTimestamp();

	const resourceUpdates = [
		createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1), // Changed
		createMockResource("file2.js", "hash2", 2000, 200, 2), // unchanged
		createMockResource("file3.js", "new-hash3", indexTimestamp + 1, 301, 3) // Changed
	];
	const changed = await tree.updateResources(resourceUpdates);

	t.deepEqual(changed, ["file1.js", "file3.js"], "Should return only changed paths");
});

test("updateResources returns empty array when no changes", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200}
	];

	const tree = new HashTree(resources);
	const resourceUpdates = [
		createMockResource("file1.js", "hash1", 1000, 100, 1),
		createMockResource("file2.js", "hash2", 2000, 200, 2)
	];
	const changed = await tree.updateResources(resourceUpdates);

	t.deepEqual(changed, [], "Should return empty array when no changes");
});

test("Different nested structures with same resources produce different hashes", (t) => {
	const resources1 = [
		{path: "a/b/file.js", integrity: "hash1"}
	];

	const resources2 = [
		{path: "a/file.js", integrity: "hash1"}
	];

	const tree1 = new HashTree(resources1);
	const tree2 = new HashTree(resources2);

	t.not(tree1.getRootHash(), tree2.getRootHash(),
		"Different directory structures should produce different hashes");
});

test("Updating unrelated resource doesn't affect consistency", async (t) => {
	const initialResources = [
		{path: "file1.js", integrity: "hash1"},
		{path: "file2.js", integrity: "hash2"},
		{path: "dir/file3.js", integrity: "hash3"}
	];

	const tree1 = new HashTree(initialResources);
	const tree2 = new HashTree(initialResources);

	// Update different resources
	await tree1.updateResources([createMockResource("file1.js", "new-hash1", Date.now(), 1024, 789)]);
	await tree2.updateResources([createMockResource("file1.js", "new-hash1", Date.now(), 1024, 789)]);

	// Update an unrelated resource in both
	await tree1.updateResources([createMockResource("dir/file3.js", "new-hash3", Date.now(), 2048, 790)]);
	await tree2.updateResources([createMockResource("dir/file3.js", "new-hash3", Date.now(), 2048, 790)]);

	t.is(tree1.getRootHash(), tree2.getRootHash(),
		"Trees should remain consistent after updating multiple resources");
});

test("getResourcePaths returns all resource paths in sorted order", (t) => {
	const resources = [
		{path: "z.js", integrity: "hash-z"},
		{path: "a.js", integrity: "hash-a"},
		{path: "dir/b.js", integrity: "hash-b"},
		{path: "dir/nested/c.js", integrity: "hash-c"}
	];

	const tree = new HashTree(resources);
	const paths = tree.getResourcePaths();

	t.deepEqual(paths, [
		"/a.js",
		"/dir/b.js",
		"/dir/nested/c.js",
		"/z.js"
	], "Resource paths should be sorted alphabetically");
});

test("getResourcePaths returns empty array for empty tree", (t) => {
	const tree = new HashTree();
	const paths = tree.getResourcePaths();

	t.deepEqual(paths, [], "Empty tree should return empty array");
});

// ============================================================================
// upsertResources Tests
// ============================================================================

test("upsertResources - insert new resources", async (t) => {
	const tree = new HashTree([{path: "a.js", integrity: "hash-a"}]);
	const originalHash = tree.getRootHash();

	const result = await tree.upsertResources([
		createMockResource("b.js", "hash-b", Date.now(), 1024, 1),
		createMockResource("c.js", "hash-c", Date.now(), 2048, 2)
	]);

	t.deepEqual(result.added, ["b.js", "c.js"], "Should report added resources");
	t.deepEqual(result.updated, [], "Should have no updates");
	t.deepEqual(result.unchanged, [], "Should have no unchanged");

	t.truthy(tree.hasPath("b.js"), "Tree should have b.js");
	t.truthy(tree.hasPath("c.js"), "Tree should have c.js");
	t.not(tree.getRootHash(), originalHash, "Root hash should change");
});

test("upsertResources - update existing resources", async (t) => {
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a", lastModified: 1000, size: 100},
		{path: "b.js", integrity: "hash-b", lastModified: 2000, size: 200}
	]);
	const originalHash = tree.getRootHash();
	const indexTimestamp = tree.getIndexTimestamp();

	const result = await tree.upsertResources([
		createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1),
		createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)
	]);

	t.deepEqual(result.added, [], "Should have no additions");
	t.deepEqual(result.updated, ["a.js", "b.js"], "Should report updated resources");
	t.deepEqual(result.unchanged, [], "Should have no unchanged");

	t.is(tree.getResourceByPath("a.js").integrity, "new-hash-a");
	t.is(tree.getResourceByPath("b.js").integrity, "new-hash-b");
	t.not(tree.getRootHash(), originalHash, "Root hash should change");
});

test("upsertResources - mixed insert, update, and unchanged", async (t) => {
	const timestamp = Date.now();
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a", lastModified: timestamp, size: 100, inode: 1}
	]);
	const originalHash = tree.getRootHash();

	const result = await tree.upsertResources([
		createMockResource("a.js", "hash-a", timestamp, 100, 1), // unchanged
		createMockResource("b.js", "hash-b", timestamp, 200, 2), // new
		createMockResource("c.js", "hash-c", timestamp, 300, 3) // new
	]);

	t.deepEqual(result.unchanged, ["a.js"], "Should report unchanged resource");
	t.deepEqual(result.added, ["b.js", "c.js"], "Should report added resources");
	t.deepEqual(result.updated, [], "Should have no updates");

	t.not(tree.getRootHash(), originalHash, "Root hash should change (new resources added)");
});

// ============================================================================
// removeResources Tests
// ============================================================================

test("removeResources - remove existing resources", async (t) => {
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"},
		{path: "c.js", integrity: "hash-c"}
	]);
	const originalHash = tree.getRootHash();

	const result = await tree.removeResources(["b.js", "c.js"]);

	t.deepEqual(result.removed, ["b.js", "c.js"], "Should report removed resources");
	t.deepEqual(result.notFound, [], "Should have no not found");

	t.truthy(tree.hasPath("a.js"), "Tree should still have a.js");
	t.false(tree.hasPath("b.js"), "Tree should not have b.js");
	t.false(tree.hasPath("c.js"), "Tree should not have c.js");
	t.not(tree.getRootHash(), originalHash, "Root hash should change");
});

test("removeResources - remove non-existent resources", async (t) => {
	const tree = new HashTree([{path: "a.js", integrity: "hash-a"}]);
	const originalHash = tree.getRootHash();

	const result = await tree.removeResources(["b.js", "c.js"]);

	t.deepEqual(result.removed, [], "Should have no removals");
	t.deepEqual(result.notFound, ["b.js", "c.js"], "Should report not found");

	t.is(tree.getRootHash(), originalHash, "Root hash should not change");
});

test("removeResources - mixed existing and non-existent", async (t) => {
	const tree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	]);

	const result = await tree.removeResources(["b.js", "c.js", "d.js"]);

	t.deepEqual(result.removed, ["b.js"], "Should report removed resources");
	t.deepEqual(result.notFound, ["c.js", "d.js"], "Should report not found");

	t.truthy(tree.hasPath("a.js"), "Tree should still have a.js");
	t.false(tree.hasPath("b.js"), "Tree should not have b.js");
});

test("removeResources - remove from nested directory", async (t) => {
	const tree = new HashTree([
		{path: "dir1/dir2/a.js", integrity: "hash-a"},
		{path: "dir1/dir2/b.js", integrity: "hash-b"},
		{path: "dir1/c.js", integrity: "hash-c"}
	]);

	const result = await tree.removeResources(["dir1/dir2/a.js"]);

	t.deepEqual(result.removed, ["dir1/dir2/a.js"], "Should remove nested resource");
	t.false(tree.hasPath("dir1/dir2/a.js"), "Should not have dir1/dir2/a.js");
	t.truthy(tree.hasPath("dir1/dir2/b.js"), "Should still have dir1/dir2/b.js");
	t.truthy(tree.hasPath("dir1/c.js"), "Should still have dir1/c.js");
});

test("deriveTree - copies only modified directories (copy-on-write)", (t) => {
	const tree1 = new HashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	]);

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
	const tree1 = new HashTree([
		{path: "shared/nested/deep/a.js", integrity: "hash-a"},
		{path: "other/b.js", integrity: "hash-b"}
	]);

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
	const tree1 = new HashTree([
		{path: "shared/a.js", integrity: "hash-a", lastModified: 1000, size: 100}
	]);

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
	await tree1.updateResources([
		createMockResource("shared/a.js", "new-hash-a", indexTimestamp + 1, 101, 1)
	]);

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
	const baseTree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	]);

	const derivedTree = baseTree.deriveTree([]);

	const added = derivedTree.getAddedResources(baseTree);

	t.deepEqual(added, [], "Should return empty array when no resources added");
});

test("getAddedResources - returns added resources from derived tree", (t) => {
	const baseTree = new HashTree([
		{path: "a.js", integrity: "hash-a"},
		{path: "b.js", integrity: "hash-b"}
	]);

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
	const baseTree = new HashTree([
		{path: "root/a.js", integrity: "hash-a"}
	]);

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
	const baseTree = new HashTree([
		{path: "src/a.js", integrity: "hash-a"}
	]);

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
	const baseTree = new HashTree([
		{path: "a.js", integrity: "hash-a"}
	]);

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
	const baseTree = new HashTree([
		{path: "shared/a.js", integrity: "hash-a"},
		{path: "shared/b.js", integrity: "hash-b"}
	]);

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
	const baseTree = new HashTree([
		{path: "a.js", integrity: "hash-a"}
	]);

	const derivedTree = baseTree.deriveTree([
		{path: "dir1/dir2/dir3/dir4/deep.js", integrity: "hash-deep", size: 100, lastModified: 1000, inode: 1}
	]);

	const added = derivedTree.getAddedResources(baseTree);

	t.is(added.length, 1, "Should return 1 added resource");
	t.is(added[0].path, "/dir1/dir2/dir3/dir4/deep.js", "Should have correct deeply nested path");
	t.is(added[0].integrity, "hash-deep", "Should preserve integrity");
});
