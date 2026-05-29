import test from "ava";
import {
	isResourceUnchanged,
	createResourceIndex
} from "../../../../lib/build/cache/utils.js";

function createMockResource(opts = {}) {
	const path = opts.path ?? "/a.js";
	const integrity = opts.integrity ?? "hash-a";
	const lastModified = opts.lastModified ?? 1000;
	const size = opts.size ?? 100;
	const inode = "inode" in opts ? opts.inode : 1;
	const tags = opts.tags ?? null;
	return {
		tags,
		getOriginalPath: () => path,
		getIntegrity: async () => integrity,
		getLastModified: () => lastModified,
		getSize: async () => size,
		getInode: () => inode,
		getTags() {
			return this.tags;
		}
	};
}

// === isResourceUnchanged ===

test("isResourceUnchanged: throws when resource is undefined", async (t) => {
	await t.throwsAsync(isResourceUnchanged(null, {integrity: "x"}), {
		message: /Cannot compare undefined/
	});
});

test("isResourceUnchanged: throws when metadata is undefined", async (t) => {
	await t.throwsAsync(isResourceUnchanged(createMockResource(), null), {
		message: /Cannot compare undefined/
	});
});

test("isResourceUnchanged: short-circuits true when lastModified matches and not at indexTimestamp",
	async (t) => {
		const resource = createMockResource({lastModified: 1000});
		const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
		t.true(await isResourceUnchanged(resource, metadata, 2000));
	});

test("isResourceUnchanged: falls through when lastModified matches indexTimestamp (race)", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, integrity: "hash-a"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.true(await isResourceUnchanged(resource, metadata, 1000));
});

// Mtime is not a content fingerprint: cp -p, tar -x, rsync -t and atomic renames
// can preserve it across content changes. Verify that size mismatch is detected
// even when lastModified matches the cached value.
test(
	"isResourceUnchanged: returns false when content changed but mtime preserved (size differs)",
	async (t) => {
		const resource = createMockResource({lastModified: 1000, size: 200, integrity: "hash-different"});
		const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
		t.false(await isResourceUnchanged(resource, metadata, 2000));
	}
);

test("isResourceUnchanged: returns false when size differs", async (t) => {
	const resource = createMockResource({lastModified: 2000, size: 200});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await isResourceUnchanged(resource, metadata, 500));
});

test("isResourceUnchanged: falls through to integrity when lastModified differs but size matches",
	async (t) => {
		const resource = createMockResource({lastModified: 2000, size: 100, integrity: "hash-a"});
		const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
		t.true(await isResourceUnchanged(resource, metadata, 500));
	});

test("isResourceUnchanged: returns false when integrity differs", async (t) => {
	const resource = createMockResource({lastModified: 2000, size: 100, integrity: "different"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await isResourceUnchanged(resource, metadata, 500));
});

test("isResourceUnchanged: no indexTimestamp - falls through on matching lastModified", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, integrity: "hash-a"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.true(await isResourceUnchanged(resource, metadata));
});

// An atomic rename with preserved mtime (cp -p, mv tmp, ...) yields a new inode
// without changing size or lastModified. The size+mtime cheap path would
// otherwise short-circuit and serve a stale cache hit; force the integrity
// check whenever the inode disagrees.
test("isResourceUnchanged: inode mismatch forces integrity check (content unchanged)",
	async (t) => {
		const resource = createMockResource({lastModified: 1000, size: 100, inode: 2, integrity: "hash-a"});
		const metadata = {lastModified: 1000, size: 100, inode: 1, integrity: "hash-a"};
		t.true(await isResourceUnchanged(resource, metadata, 2000));
	});

test("isResourceUnchanged: inode mismatch detects same-size content change",
	async (t) => {
		const resource = createMockResource({lastModified: 1000, size: 100, inode: 2, integrity: "hash-different"});
		const metadata = {lastModified: 1000, size: 100, inode: 1, integrity: "hash-a"};
		t.false(await isResourceUnchanged(resource, metadata, 2000));
	});

test("isResourceUnchanged: skips inode check when cached metadata has no inode",
	async (t) => {
		const resource = createMockResource({lastModified: 1000, size: 100, inode: 7, integrity: "hash-a"});
		const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
		t.true(await isResourceUnchanged(resource, metadata, 2000));
	});

test("isResourceUnchanged: skips inode check when resource has no inode",
	async (t) => {
		const resource = createMockResource({lastModified: 1000, size: 100, inode: undefined, integrity: "hash-a"});
		const metadata = {lastModified: 1000, size: 100, inode: 5, integrity: "hash-a"};
		t.true(await isResourceUnchanged(resource, metadata, 2000));
	});

// === createResourceIndex ===

test("createResourceIndex: indexes resources correctly", async (t) => {
	const resources = [
		createMockResource({path: "/a.js", integrity: "hash-a", lastModified: 1000, size: 50, inode: 7}),
		createMockResource({path: "/b.js", integrity: "hash-b", lastModified: 2000, size: 60, inode: 8}),
	];

	const result = await createResourceIndex(resources);

	t.is(result.length, 2);
	t.is(result[0].path, "/a.js");
	t.is(result[0].integrity, "hash-a");
	t.is(result[0].lastModified, 1000);
	t.is(result[0].size, 50);
	t.is(result[0].inode, 7);
});

test("createResourceIndex: leaves inode undefined when resource has none", async (t) => {
	const resources = [
		createMockResource({path: "/a.js", inode: undefined}),
	];

	const result = await createResourceIndex(resources);

	t.is(result[0].inode, undefined);
});

test("createResourceIndex: includes tags", async (t) => {
	const resources = [
		createMockResource({path: "/a.js", tags: {ui5: "bundle"}}),
	];

	const result = await createResourceIndex(resources);

	t.deepEqual(result[0].tags, {ui5: "bundle"});
});

test("createResourceIndex: empty array returns empty result", async (t) => {
	const result = await createResourceIndex([]);
	t.deepEqual(result, []);
});
