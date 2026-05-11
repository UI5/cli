import test from "ava";
import {
	matchResourceMetadata,
	matchResourceMetadataStrict,
	createResourceIndex,
	firstTruthy
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

// === matchResourceMetadata ===

test("matchResourceMetadata: throws when resource is undefined", async (t) => {
	await t.throwsAsync(matchResourceMetadata(null, {integrity: "x"}), {
		message: /Cannot compare undefined/
	});
});

test("matchResourceMetadata: throws when metadata is undefined", async (t) => {
	await t.throwsAsync(matchResourceMetadata(createMockResource(), null), {
		message: /Cannot compare undefined/
	});
});

test("matchResourceMetadata: returns false if resource modified after index timestamp", async (t) => {
	const resource = createMockResource({lastModified: 2000});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await matchResourceMetadata(resource, metadata, 1500));
});

test("matchResourceMetadata: returns false if lastModified differs", async (t) => {
	const resource = createMockResource({lastModified: 2000});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await matchResourceMetadata(resource, metadata));
});

test("matchResourceMetadata: returns false if size differs", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 200});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await matchResourceMetadata(resource, metadata));
});

test("matchResourceMetadata: returns false if inodes differ", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, inode: 5});
	const metadata = {lastModified: 1000, size: 100, inode: 10, integrity: "hash-a"};
	t.false(await matchResourceMetadata(resource, metadata));
});

test("matchResourceMetadata: skips inode check when metadata inode is undefined", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, inode: 5});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.true(await matchResourceMetadata(resource, metadata));
});

test("matchResourceMetadata: skips inode check when resource inode is undefined", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, inode: undefined});
	const metadata = {lastModified: 1000, size: 100, inode: 10, integrity: "hash-a"};
	t.true(await matchResourceMetadata(resource, metadata));
});

test("matchResourceMetadata: race condition - integrity check when lastModified equals indexTimestamp", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, integrity: "hash-different"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a", inode: 1};
	t.false(await matchResourceMetadata(resource, metadata, 1000));
});

test("matchResourceMetadata: race condition - passes if integrity matches", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, integrity: "hash-a"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a", inode: 1};
	t.true(await matchResourceMetadata(resource, metadata, 1000));
});

test("matchResourceMetadata: returns true when all checks pass", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, inode: 1});
	const metadata = {lastModified: 1000, size: 100, inode: 1, integrity: "hash-a"};
	t.true(await matchResourceMetadata(resource, metadata, 2000));
});

// === matchResourceMetadataStrict ===

test("matchResourceMetadataStrict: throws when resource is undefined", async (t) => {
	await t.throwsAsync(matchResourceMetadataStrict(null, {integrity: "x"}), {
		message: /Cannot compare undefined/
	});
});

test("matchResourceMetadataStrict: throws when metadata is undefined", async (t) => {
	await t.throwsAsync(matchResourceMetadataStrict(createMockResource(), null), {
		message: /Cannot compare undefined/
	});
});

test("matchResourceMetadataStrict: short-circuits true when lastModified matches and not at indexTimestamp",
	async (t) => {
		const resource = createMockResource({lastModified: 1000});
		const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
		t.true(await matchResourceMetadataStrict(resource, metadata, 2000));
	});

test("matchResourceMetadataStrict: falls through when lastModified matches indexTimestamp (race)", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, integrity: "hash-a"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.true(await matchResourceMetadataStrict(resource, metadata, 1000));
});

test("matchResourceMetadataStrict: returns false when size differs", async (t) => {
	const resource = createMockResource({lastModified: 2000, size: 200});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await matchResourceMetadataStrict(resource, metadata, 500));
});

test("matchResourceMetadataStrict: falls through to integrity when lastModified differs but size matches",
	async (t) => {
		const resource = createMockResource({lastModified: 2000, size: 100, integrity: "hash-a"});
		const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
		t.true(await matchResourceMetadataStrict(resource, metadata, 500));
	});

test("matchResourceMetadataStrict: returns false when integrity differs", async (t) => {
	const resource = createMockResource({lastModified: 2000, size: 100, integrity: "different"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.false(await matchResourceMetadataStrict(resource, metadata, 500));
});

test("matchResourceMetadataStrict: no indexTimestamp - falls through on matching lastModified", async (t) => {
	const resource = createMockResource({lastModified: 1000, size: 100, integrity: "hash-a"});
	const metadata = {lastModified: 1000, size: 100, integrity: "hash-a"};
	t.true(await matchResourceMetadataStrict(resource, metadata));
});

// === createResourceIndex ===

test("createResourceIndex: indexes resources correctly", async (t) => {
	const resources = [
		createMockResource({path: "/a.js", integrity: "hash-a", lastModified: 1000, size: 50}),
		createMockResource({path: "/b.js", integrity: "hash-b", lastModified: 2000, size: 60}),
	];

	const result = await createResourceIndex(resources);

	t.is(result.length, 2);
	t.is(result[0].path, "/a.js");
	t.is(result[0].integrity, "hash-a");
	t.is(result[0].lastModified, 1000);
	t.is(result[0].size, 50);
	t.is(result[0].inode, undefined);
});

test("createResourceIndex: includes inode when requested", async (t) => {
	const resources = [
		createMockResource({path: "/a.js", inode: 42}),
	];

	const result = await createResourceIndex(resources, true);

	t.is(result[0].inode, 42);
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

// === firstTruthy ===

test("firstTruthy: returns null for empty array", async (t) => {
	const result = await firstTruthy([]);
	t.is(result, null);
});

test("firstTruthy: returns first truthy value", async (t) => {
	const result = await firstTruthy([
		Promise.resolve(null),
		Promise.resolve("found"),
		Promise.resolve("also found"),
	]);
	t.is(result, "found");
});

test("firstTruthy: returns null when all resolve to falsy", async (t) => {
	const result = await firstTruthy([
		Promise.resolve(null),
		Promise.resolve(false),
		Promise.resolve(0),
	]);
	t.is(result, null);
});

test("firstTruthy: rejects when a promise rejects", async (t) => {
	const error = new Error("test error");
	await t.throwsAsync(firstTruthy([
		Promise.resolve(null),
		Promise.reject(error),
	]), {message: "test error"});
});

test("firstTruthy: resolves with first truthy regardless of order", async (t) => {
	const result = await firstTruthy([
		new Promise((resolve) => setTimeout(() => resolve(null), 50)),
		Promise.resolve("immediate"),
	]);
	t.is(result, "immediate");
});
