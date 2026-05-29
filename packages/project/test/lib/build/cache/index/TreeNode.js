import test from "ava";
import TreeNode from "../../../../../lib/build/cache/index/TreeNode.js";

test("constructor: creates resource node with defaults", (t) => {
	const node = new TreeNode("file.js", "resource");
	t.is(node.name, "file.js");
	t.is(node.type, "resource");
	t.is(node.hash, null);
	t.is(node.integrity, undefined);
	t.is(node.lastModified, undefined);
	t.is(node.size, undefined);
	t.is(node.inode, undefined);
	t.is(node.tags, null);
	t.deepEqual(node.children, new Map());
});

test("constructor: creates resource node with options", (t) => {
	const hash = Buffer.from("abc123", "hex");
	const node = new TreeNode("file.js", "resource", {
		hash,
		integrity: "sha256-xyz",
		lastModified: 1000,
		size: 500,
		inode: 42,
		tags: {ui5: "bundle"}
	});
	t.deepEqual(node.hash, hash);
	t.is(node.integrity, "sha256-xyz");
	t.is(node.lastModified, 1000);
	t.is(node.size, 500);
	t.is(node.inode, 42);
	t.deepEqual(node.tags, {ui5: "bundle"});
});

test("constructor: creates directory node with children", (t) => {
	const child = new TreeNode("child.js", "resource");
	const children = new Map([["child.js", child]]);
	const node = new TreeNode("src", "directory", {children});
	t.is(node.type, "directory");
	t.is(node.children.size, 1);
	t.is(node.children.get("child.js"), child);
});

test("getPath: returns name when parentPath is empty", (t) => {
	const node = new TreeNode("file.js", "resource");
	t.is(node.getPath(), "file.js");
	t.is(node.getPath(""), "file.js");
});

test("getPath: joins parentPath and name", (t) => {
	const node = new TreeNode("file.js", "resource");
	t.is(node.getPath("/resources/src"), "/resources/src/file.js");
});

test("toJSON: serializes resource node", (t) => {
	const hash = Buffer.from("abc123", "hex");
	const node = new TreeNode("file.js", "resource", {
		hash,
		integrity: "sha256-xyz",
		lastModified: 1000,
		size: 500,
		inode: 42,
		tags: {ui5: "bundle"}
	});
	const json = node.toJSON();
	t.deepEqual(json, {
		name: "file.js",
		type: "resource",
		hash: "abc123",
		integrity: "sha256-xyz",
		lastModified: 1000,
		size: 500,
		inode: 42,
		tags: {ui5: "bundle"}
	});
});

test("toJSON: serializes directory node with children", (t) => {
	const child = new TreeNode("child.js", "resource", {
		hash: Buffer.from("def456", "hex"),
		integrity: "sha256-abc",
		lastModified: 2000,
		size: 300
	});
	const node = new TreeNode("src", "directory", {
		hash: Buffer.from("111222", "hex"),
		children: new Map([["child.js", child]])
	});
	const json = node.toJSON();
	t.is(json.name, "src");
	t.is(json.type, "directory");
	t.is(json.hash, "111222");
	t.truthy(json.children);
	t.truthy(json.children["child.js"]);
	t.is(json.children["child.js"].name, "child.js");
});

test("toJSON: serializes null hash", (t) => {
	const node = new TreeNode("file.js", "resource");
	const json = node.toJSON();
	t.is(json.hash, null);
});

test("fromJSON: deserializes resource node", (t) => {
	const data = {
		name: "file.js",
		type: "resource",
		hash: "abc123",
		integrity: "sha256-xyz",
		lastModified: 1000,
		size: 500,
		inode: 42,
		tags: {ui5: "bundle"}
	};
	const node = TreeNode.fromJSON(data);
	t.is(node.name, "file.js");
	t.is(node.type, "resource");
	t.deepEqual(node.hash, Buffer.from("abc123", "hex"));
	t.is(node.integrity, "sha256-xyz");
	t.is(node.lastModified, 1000);
	t.is(node.size, 500);
	t.is(node.inode, 42);
	t.deepEqual(node.tags, {ui5: "bundle"});
});

test("fromJSON: deserializes directory node with children", (t) => {
	const data = {
		name: "src",
		type: "directory",
		hash: "111222",
		children: {
			"child.js": {
				name: "child.js",
				type: "resource",
				hash: "def456",
				integrity: "sha256-abc",
				lastModified: 2000,
				size: 300
			}
		}
	};
	const node = TreeNode.fromJSON(data);
	t.is(node.type, "directory");
	t.is(node.children.size, 1);
	const child = node.children.get("child.js");
	t.truthy(child);
	t.is(child.integrity, "sha256-abc");
});

test("fromJSON: handles null hash", (t) => {
	const node = TreeNode.fromJSON({name: "x", type: "resource", hash: null});
	t.is(node.hash, null);
});

test("fromJSON: handles null tags", (t) => {
	const node = TreeNode.fromJSON({name: "x", type: "resource", hash: null, tags: null});
	t.is(node.tags, null);
});

test("toJSON/fromJSON: round-trip for resource node", (t) => {
	const original = new TreeNode("file.js", "resource", {
		hash: Buffer.from("abc123", "hex"),
		integrity: "sha256-xyz",
		lastModified: 1000,
		size: 500,
		inode: 42,
		tags: {ui5: "bundle"}
	});
	const restored = TreeNode.fromJSON(original.toJSON());
	t.deepEqual(restored.hash, original.hash);
	t.is(restored.integrity, original.integrity);
	t.is(restored.lastModified, original.lastModified);
	t.is(restored.size, original.size);
	t.is(restored.inode, original.inode);
	t.deepEqual(restored.tags, original.tags);
});

test("toJSON/fromJSON: round-trip for directory node", (t) => {
	const child = new TreeNode("child.js", "resource", {
		hash: Buffer.from("def456", "hex"),
		integrity: "sha256-abc",
		lastModified: 2000,
		size: 300,
		tags: null
	});
	const original = new TreeNode("src", "directory", {
		hash: Buffer.from("111222", "hex"),
		children: new Map([["child.js", child]])
	});
	const restored = TreeNode.fromJSON(original.toJSON());
	t.is(restored.type, "directory");
	t.is(restored.children.size, 1);
	t.deepEqual(restored.children.get("child.js").hash, child.hash);
});

test("clone: deep copies resource node", (t) => {
	const original = new TreeNode("file.js", "resource", {
		hash: Buffer.from("abc123", "hex"),
		integrity: "sha256-xyz",
		lastModified: 1000,
		size: 500,
		inode: 42,
		tags: {ui5: "bundle"}
	});
	const cloned = original.clone();

	t.deepEqual(cloned.hash, original.hash);
	t.is(cloned.integrity, original.integrity);
	t.is(cloned.lastModified, original.lastModified);
	t.is(cloned.size, original.size);
	t.is(cloned.inode, original.inode);
	t.deepEqual(cloned.tags, original.tags);

	// Verify deep copy - mutating clone doesn't affect original
	cloned.hash[0] = 0xFF;
	t.not(original.hash[0], 0xFF);
	cloned.tags.newProp = "x";
	t.is(original.tags.newProp, undefined);
});

test("clone: deep copies directory node with children", (t) => {
	const child = new TreeNode("child.js", "resource", {
		hash: Buffer.from("def456", "hex"),
		integrity: "sha256-abc",
		lastModified: 2000,
		size: 300
	});
	const original = new TreeNode("src", "directory", {
		hash: Buffer.from("111222", "hex"),
		children: new Map([["child.js", child]])
	});
	const cloned = original.clone();

	t.is(cloned.children.size, 1);
	t.truthy(cloned.children.get("child.js"));

	// Verify deep copy - modifications to cloned child don't affect original
	cloned.children.get("child.js").integrity = "modified";
	t.is(original.children.get("child.js").integrity, "sha256-abc");
});

test("clone: handles null hash and tags", (t) => {
	const original = new TreeNode("file.js", "resource", {
		hash: null,
		tags: null
	});
	const cloned = original.clone();
	t.is(cloned.hash, null);
	t.is(cloned.tags, null);
});
