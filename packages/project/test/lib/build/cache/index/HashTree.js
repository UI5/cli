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
	await tree1.upsertResources([resource]);
	await tree2.upsertResources([resource]);

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
	await tree1.upsertResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree1.upsertResources([createMockResource("dir/d.js", "new-hash-d", indexTimestamp + 1, 401, 4)]);
	await tree1.upsertResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);

	await tree2.upsertResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree2.upsertResources([createMockResource("dir/d.js", "new-hash-d", indexTimestamp + 1, 401, 4)]);
	await tree2.upsertResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);

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
	await tree1.upsertResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree1.upsertResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);
	await tree1.upsertResources([createMockResource("c.js", "new-hash-c", indexTimestamp + 1, 301, 3)]);

	await tree2.upsertResources([createMockResource("c.js", "new-hash-c", indexTimestamp + 1, 301, 3)]);
	await tree2.upsertResources([createMockResource("a.js", "new-hash-a", indexTimestamp + 1, 101, 1)]);
	await tree2.upsertResources([createMockResource("b.js", "new-hash-b", indexTimestamp + 1, 201, 2)]);

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
	await tree1.upsertResources([createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)]);
	await tree1.upsertResources([createMockResource("file2.js", "new-hash2", indexTimestamp + 1, 201, 2)]);

	// Batch update
	const resources = [
		createMockResource("file1.js", "new-hash1", 1001, 101, 1),
		createMockResource("file2.js", "new-hash2", 2001, 201, 2)
	];
	await tree2.upsertResources(resources);

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

	await tree.upsertResources([createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)]);
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
	await tree.upsertResources([createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)]);
	await tree.upsertResources([createMockResource("file1.js", "hash1", 1000, 100, 1)]);

	t.is(tree.getRootHash(), originalHash,
		"Root hash should be restored when resource is reverted to original value");
});

test("updateResource returns changed resource path", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100}
	];

	const tree = new HashTree(resources);
	const indexTimestamp = tree.getIndexTimestamp();
	const {updated} = await tree.upsertResources([
		createMockResource("file1.js", "new-hash1", indexTimestamp + 1, 101, 1)
	]);

	t.deepEqual(updated, ["file1.js"], "Should return path of changed resource");
});

test("updateResource returns empty array when integrity unchanged", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100}
	];

	const tree = new HashTree(resources);
	const {updated} = await tree.upsertResources([createMockResource("file1.js", "hash1", 1000, 100, 1)]);

	t.deepEqual(updated, [], "Should return empty array when integrity unchanged");
});

test("updateResource does not change hash when integrity unchanged", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100}
	];

	const tree = new HashTree(resources);
	const originalHash = tree.getRootHash();
	await tree.upsertResources([createMockResource("file1.js", "hash1", 1000, 100, 1)]);

	t.is(tree.getRootHash(), originalHash, "Hash should not change when integrity unchanged");
});

test("upsertResources returns changed resource paths", async (t) => {
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
	const {updated} = await tree.upsertResources(resourceUpdates);

	t.deepEqual(updated, ["file1.js", "file3.js"], "Should return only updated paths");
});

test("upsertResources returns empty array when no changes", async (t) => {
	const resources = [
		{path: "file1.js", integrity: "hash1", lastModified: 1000, size: 100},
		{path: "file2.js", integrity: "hash2", lastModified: 2000, size: 200}
	];

	const tree = new HashTree(resources);
	const resourceUpdates = [
		createMockResource("file1.js", "hash1", 1000, 100, 1),
		createMockResource("file2.js", "hash2", 2000, 200, 2)
	];
	const {updated} = await tree.upsertResources(resourceUpdates);

	t.deepEqual(updated, [], "Should return empty array when no changes");
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
	await tree1.upsertResources([createMockResource("file1.js", "new-hash1", Date.now(), 1024, 789)]);
	await tree2.upsertResources([createMockResource("file1.js", "new-hash1", Date.now(), 1024, 789)]);

	// Update an unrelated resource in both
	await tree1.upsertResources([createMockResource("dir/file3.js", "new-hash3", Date.now(), 2048, 790)]);
	await tree2.upsertResources([createMockResource("dir/file3.js", "new-hash3", Date.now(), 2048, 790)]);

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

test("removeResources - removing last resource in directory cleans up directory", async (t) => {
	const tree = new HashTree([
		{path: "dir1/dir2/only.js", integrity: "hash-only"},
		{path: "dir1/other.js", integrity: "hash-other"}
	]);

	// Verify structure before removal
	t.truthy(tree.hasPath("dir1/dir2/only.js"), "Should have dir1/dir2/only.js");
	t.truthy(tree._findNode("dir1/dir2"), "Directory dir1/dir2 should exist");

	// Remove the only resource in dir2
	const result = await tree.removeResources(["dir1/dir2/only.js"]);

	t.deepEqual(result.removed, ["dir1/dir2/only.js"], "Should remove resource");
	t.false(tree.hasPath("dir1/dir2/only.js"), "Should not have dir1/dir2/only.js");

	// Check if empty directory is cleaned up
	const dir2Node = tree._findNode("dir1/dir2");
	t.is(dir2Node, null, "Empty directory dir1/dir2 should be removed");

	// Parent directory should still exist with other.js
	t.truthy(tree.hasPath("dir1/other.js"), "Should still have dir1/other.js");
	t.truthy(tree._findNode("dir1"), "Parent directory dir1 should still exist");
});

test("removeResources - cleans up deeply nested empty directories", async (t) => {
	const tree = new HashTree([
		{path: "a/b/c/d/e/deep.js", integrity: "hash-deep"},
		{path: "a/sibling.js", integrity: "hash-sibling"}
	]);

	// Verify structure before removal
	t.truthy(tree.hasPath("a/b/c/d/e/deep.js"), "Should have deeply nested file");
	t.truthy(tree._findNode("a/b/c/d/e"), "Deep directory should exist");

	// Remove the only resource in the deep hierarchy
	const result = await tree.removeResources(["a/b/c/d/e/deep.js"]);

	t.deepEqual(result.removed, ["a/b/c/d/e/deep.js"], "Should remove resource");

	// All empty directories in the chain should be removed
	t.is(tree._findNode("a/b/c/d/e"), null, "Directory e should be removed");
	t.is(tree._findNode("a/b/c/d"), null, "Directory d should be removed");
	t.is(tree._findNode("a/b/c"), null, "Directory c should be removed");
	t.is(tree._findNode("a/b"), null, "Directory b should be removed");

	// Parent directory with sibling should still exist
	t.truthy(tree._findNode("a"), "Directory a should still exist (has sibling.js)");
	t.truthy(tree.hasPath("a/sibling.js"), "Sibling file should still exist");
});
