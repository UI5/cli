import test from "ava";
import sinon from "sinon";
import ResourceRequestManager from "../../../../lib/build/cache/ResourceRequestManager.js";
import ResourceRequestGraph from "../../../../lib/build/cache/ResourceRequestGraph.js";

// Helper to create mock Resource instances
function createMockResource(path, integrity = "test-hash", lastModified = 1000, size = 100, inode = 1) {
	return {
		getOriginalPath: () => path,
		getPath: () => path,
		getIntegrity: async () => integrity,
		getLastModified: () => lastModified,
		getSize: async () => size,
		getInode: () => inode,
		getBuffer: async () => Buffer.from("test content"),
		getStream: () => null
	};
}

// Helper to create mock Reader (project or dependency)
function createMockReader(resources = new Map()) {
	return {
		byPath: sinon.stub().callsFake(async (path) => {
			return resources.get(path) || null;
		}),
		byGlob: sinon.stub().callsFake(async (patterns) => {
			const patternArray = Array.isArray(patterns) ? patterns : [patterns];
			const results = [];
			for (const [path, resource] of resources.entries()) {
				for (const pattern of patternArray) {
					// Simple pattern matching
					if (pattern === "/**/*" || pattern === "**/*") {
						results.push(resource);
						break;
					}
					// Convert glob pattern to regex
					const regex = new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, "."));
					if (regex.test(path)) {
						results.push(resource);
						break;
					}
				}
			}
			return results;
		})
	};
}

test.afterEach.always(() => {
	sinon.restore();
});

// ===== CONSTRUCTOR TESTS =====

test("ResourceRequestManager: Create new instance", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	t.truthy(manager, "Manager instance created");
	t.true(manager.hasNewOrModifiedCacheEntries(), "New manager has modified entries");
});

test("ResourceRequestManager: Create with request graph from cache", (t) => {
	const graph = new ResourceRequestGraph();
	const manager = new ResourceRequestManager("test.project", "myTask", false, graph);

	t.truthy(manager, "Manager instance created with graph");
	t.false(manager.hasNewOrModifiedCacheEntries(), "Manager restored from cache has no new entries initially");
});

test("ResourceRequestManager: Create with differential update enabled", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", true);

	t.truthy(manager, "Manager instance created with differential updates");
});

test("ResourceRequestManager: Create with unusedAtLeastOnce flag", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false, null, true);

	t.truthy(manager, "Manager instance created");
	const signatures = manager.getIndexSignatures();
	t.true(signatures.includes("X"), "Signatures include 'X' for unused state");
});

// ===== fromCache FACTORY METHOD TESTS =====

test("ResourceRequestManager: fromCache with basic data", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	// Create a manager and add some requests
	const manager1 = new ResourceRequestManager("test.project", "myTask", false);
	await manager1.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	// Serialize and restore
	const cacheData = manager1.toCacheObject();
	t.truthy(cacheData, "Cache data created");

	const manager2 = ResourceRequestManager.fromCache("test.project", "myTask", false, cacheData);

	t.truthy(manager2, "Manager restored from cache");
	t.false(manager2.hasNewOrModifiedCacheEntries(), "Restored manager has no new entries");
});

test("ResourceRequestManager: fromCache with unusedAtLeastOnce", (t) => {
	const cacheData = {
		requestSetGraph: {
			nodes: [],
			nextId: 1
		},
		rootIndices: [],
		unusedAtLeastOnce: true
	};

	const manager = ResourceRequestManager.fromCache("test.project", "myTask", false, cacheData);

	t.truthy(manager, "Manager restored");
	const signatures = manager.getIndexSignatures();
	t.true(signatures.includes("X"), "Includes 'X' signature for unused state");
});

// ===== addRequests TESTS =====

test("ResourceRequestManager: Add path requests", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const result = await manager.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	t.truthy(result, "Result returned");
	t.truthy(result.setId, "Result has setId");
	t.truthy(result.signature, "Result has signature");
	t.is(typeof result.signature, "string", "Signature is a string");
});

test("ResourceRequestManager: Add pattern requests", async (t) => {
	const resources = new Map([
		["/src/a.js", createMockResource("/src/a.js", "hash-a")],
		["/src/b.js", createMockResource("/src/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const result = await manager.addRequests({
		paths: [],
		patterns: [["/src/*.js"]]
	}, reader);

	t.truthy(result, "Result returned");
	t.truthy(result.signature, "Result has signature");
});

test("ResourceRequestManager: Add multiple request sets", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")],
		["/c.js", createMockResource("/c.js", "hash-c")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);

	// First request set
	const result1 = await manager.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	// Second request set (superset)
	const result2 = await manager.addRequests({
		paths: ["/a.js", "/b.js", "/c.js"],
		patterns: []
	}, reader);

	t.not(result1.signature, result2.signature, "Different signatures for different request sets");
	t.true(manager.hasNewOrModifiedCacheEntries(), "Has new entries");
});

test("ResourceRequestManager: Reuse existing request set", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);

	// Add first request set
	const result1 = await manager.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	// Add identical request set
	const result2 = await manager.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	t.is(result1.setId, result2.setId, "Same setId for identical requests");
	t.is(result1.signature, result2.signature, "Same signature for identical requests");
});

// ===== recordNoRequests TESTS =====

test("ResourceRequestManager: Record no requests", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const signature = manager.recordNoRequests();

	t.is(signature, "X", "Returns 'X' signature");
	t.true(manager.hasNewOrModifiedCacheEntries(), "Has new entries");
});

test("ResourceRequestManager: Record no requests multiple times", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const sig1 = manager.recordNoRequests();
	const sig2 = manager.recordNoRequests();

	t.is(sig1, "X", "First call returns 'X'");
	t.is(sig2, "X", "Second call returns 'X'");
});

// ===== getIndexSignatures TESTS =====

test("ResourceRequestManager: Get signatures from empty manager", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const signatures = manager.getIndexSignatures();

	t.is(signatures.length, 0, "No signatures for empty manager");
});

test("ResourceRequestManager: Get signatures after adding requests", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	const signatures = manager.getIndexSignatures();

	t.is(signatures.length, 1, "One signature");
	t.is(typeof signatures[0], "string", "Signature is a string");
});

test("ResourceRequestManager: Get signatures includes 'X' when unused", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);
	manager.recordNoRequests();

	const signatures = manager.getIndexSignatures();

	t.true(signatures.includes("X"), "Includes 'X' signature");
});

// ===== hasNewOrModifiedCacheEntries TESTS =====

test("ResourceRequestManager: New manager has modified entries", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	t.true(manager.hasNewOrModifiedCacheEntries(), "New manager has modified entries");
});

test("ResourceRequestManager: Restored manager has no modified entries initially", (t) => {
	const graph = new ResourceRequestGraph();
	const manager = new ResourceRequestManager("test.project", "myTask", false, graph);

	t.false(manager.hasNewOrModifiedCacheEntries(), "Restored manager has no modified entries");
});

test("ResourceRequestManager: Adding requests marks as modified", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	const graph = new ResourceRequestGraph();
	const manager = new ResourceRequestManager("test.project", "myTask", false, graph);

	t.false(manager.hasNewOrModifiedCacheEntries(), "Initially no modified entries");

	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	t.true(manager.hasNewOrModifiedCacheEntries(), "Has modified entries after adding requests");
});

// ===== toCacheObject TESTS =====

test("ResourceRequestManager: Serialize to cache object", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	const cacheObj = manager.toCacheObject();

	t.truthy(cacheObj, "Cache object created");
	t.truthy(cacheObj.requestSetGraph, "Has requestSetGraph");
	t.truthy(cacheObj.rootIndices, "Has rootIndices");
	t.true(Array.isArray(cacheObj.rootIndices), "rootIndices is an array");
});

test("ResourceRequestManager: Serialize returns undefined when no changes", (t) => {
	const graph = new ResourceRequestGraph();
	const manager = new ResourceRequestManager("test.project", "myTask", false, graph);

	const cacheObj = manager.toCacheObject();

	t.is(cacheObj, undefined, "Returns undefined when no changes");
});

test("ResourceRequestManager: Serialize includes unusedAtLeastOnce", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", false);
	manager.recordNoRequests();

	const cacheObj = manager.toCacheObject();

	t.truthy(cacheObj, "Cache object created");
	t.true(cacheObj.unusedAtLeastOnce, "Includes unusedAtLeastOnce flag");
});

test("ResourceRequestManager: Serialize with differential updates", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", true);
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	const cacheObj = manager.toCacheObject();

	t.truthy(cacheObj, "Cache object created");
	t.truthy(cacheObj.deltaIndices, "Has deltaIndices");
	t.true(Array.isArray(cacheObj.deltaIndices), "deltaIndices is an array");
});

// ===== getDeltas TESTS =====

test("ResourceRequestManager: Get deltas returns empty map initially", (t) => {
	const manager = new ResourceRequestManager("test.project", "myTask", true);

	const deltas = manager.getDeltas();

	t.true(deltas instanceof Map, "Returns a Map");
	t.is(deltas.size, 0, "Empty initially");
});

test("ResourceRequestManager: Get deltas after updates", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", true);
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	// Update resource
	resources.set("/a.js", createMockResource("/a.js", "hash-a-new"));

	// Note: In a real scenario, updateIndices would be called here
	// For this test, we're just checking the method exists and returns a Map
	const deltas = manager.getDeltas();

	t.true(deltas instanceof Map, "Returns a Map");
});

// ===== updateIndices TESTS =====

test("ResourceRequestManager: updateIndices with no requests", async (t) => {
	const reader = createMockReader(new Map());
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const hasChanges = await manager.updateIndices(reader, []);

	t.false(hasChanges, "No changes when no requests recorded");
});

test("ResourceRequestManager: updateIndices with no changed paths", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	const hasChanges = await manager.updateIndices(reader, []);

	t.false(hasChanges, "No changes when paths don't match");
});

test("ResourceRequestManager: updateIndices with matching changed path", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	// Update the resource
	resources.set("/a.js", createMockResource("/a.js", "hash-a-new"));

	const hasChanges = await manager.updateIndices(reader, ["/a.js"]);

	t.true(hasChanges, "Detects changes for matching path");
});

test("ResourceRequestManager: updateIndices with pattern matches", async (t) => {
	const resources = new Map([
		["/src/a.js", createMockResource("/src/a.js", "hash-a")],
		["/src/b.js", createMockResource("/src/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({
		paths: [],
		patterns: [["/src/*.js"]]
	}, reader);

	// Update one resource
	resources.set("/src/a.js", createMockResource("/src/a.js", "hash-a-new"));

	const hasChanges = await manager.updateIndices(reader, ["/src/a.js"]);

	t.true(hasChanges, "Detects changes for pattern-matched resources");
});

test("ResourceRequestManager: updateIndices with removed resource", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({paths: ["/a.js", "/b.js"], patterns: []}, reader);

	// Remove a resource
	resources.delete("/b.js");

	const hasChanges = await manager.updateIndices(reader, ["/b.js"]);

	t.true(hasChanges, "Detects removal of resource");
});

// ===== refreshIndices TESTS =====

test("ResourceRequestManager: refreshIndices with no requests", async (t) => {
	const reader = createMockReader(new Map());
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const hasChanges = await manager.refreshIndices(reader);

	t.false(hasChanges, "No changes when no requests recorded");
});

test("ResourceRequestManager: refreshIndices after adding requests", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);
	await manager.addRequests({paths: ["/a.js", "/b.js"], patterns: []}, reader);

	// Update resources
	resources.set("/a.js", createMockResource("/a.js", "hash-a-new"));

	const result = await manager.refreshIndices(reader);

	// refreshIndices doesn't return a value (undefined) when changes are made
	// It only returns false when there are no requests
	t.is(result, undefined, "refreshIndices returns undefined when it processes changes");
	t.pass("refreshIndices completed");
});

// ===== INTEGRATION TESTS =====

test("ResourceRequestManager: Complete workflow", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	// 1. Create manager
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	// 2. Add requests
	const result = await manager.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	t.truthy(result.signature, "Got signature from addRequests");

	// 3. Get signatures
	const signatures = manager.getIndexSignatures();
	t.is(signatures.length, 1, "One signature recorded");
	t.is(signatures[0], result.signature, "Signature matches");

	// 4. Serialize
	const cacheObj = manager.toCacheObject();
	t.truthy(cacheObj, "Can serialize to cache object");

	// 5. Restore from cache
	const manager2 = ResourceRequestManager.fromCache("test.project", "myTask", false, cacheObj);
	t.truthy(manager2, "Can restore from cache");

	const signatures2 = manager2.getIndexSignatures();
	t.deepEqual(signatures2, signatures, "Restored manager has same signatures");
});

test("ResourceRequestManager: Differential update workflow", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")]
	]);
	const reader = createMockReader(resources);

	// Create with differential updates enabled
	const manager = new ResourceRequestManager("test.project", "myTask", true);

	// Add requests
	await manager.addRequests({paths: ["/a.js"], patterns: []}, reader);

	// Update resource
	resources.set("/a.js", createMockResource("/a.js", "hash-a-new"));

	// Update indices
	const hasChanges = await manager.updateIndices(reader, ["/a.js"]);
	t.true(hasChanges, "Detected changes");

	// Get deltas
	const deltas = manager.getDeltas();
	t.true(deltas instanceof Map, "Has deltas");

	// Serialize
	const cacheObj = manager.toCacheObject();
	t.truthy(cacheObj, "Can serialize");
	t.truthy(cacheObj.deltaIndices, "Has delta indices");
});

test("ResourceRequestManager: Mixed path and pattern requests", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/src/b.js", createMockResource("/src/b.js", "hash-b")],
		["/src/c.js", createMockResource("/src/c.js", "hash-c")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const result = await manager.addRequests({
		paths: ["/a.js"],
		patterns: [["/src/*.js"]]
	}, reader);

	t.truthy(result.signature, "Got signature for mixed requests");

	const signatures = manager.getIndexSignatures();
	t.is(signatures.length, 1, "One signature");
});

test("ResourceRequestManager: Hierarchical request sets", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")],
		["/c.js", createMockResource("/c.js", "hash-c")]
	]);
	const reader = createMockReader(resources);

	const manager = new ResourceRequestManager("test.project", "myTask", false);

	// First request set
	const result1 = await manager.addRequests({
		paths: ["/a.js"],
		patterns: []
	}, reader);

	// Second request set (superset)
	const result2 = await manager.addRequests({
		paths: ["/a.js", "/b.js"],
		patterns: []
	}, reader);

	// Third request set (superset)
	const result3 = await manager.addRequests({
		paths: ["/a.js", "/b.js", "/c.js"],
		patterns: []
	}, reader);

	const signatures = manager.getIndexSignatures();
	t.is(signatures.length, 3, "Three different signatures");
	t.not(result1.signature, result2.signature, "Different signatures");
	t.not(result2.signature, result3.signature, "Different signatures");
});

test("ResourceRequestManager: Empty request sets", async (t) => {
	const reader = createMockReader(new Map());
	const manager = new ResourceRequestManager("test.project", "myTask", false);

	const result = await manager.addRequests({
		paths: [],
		patterns: []
	}, reader);

	t.truthy(result, "Can add empty request set");
	t.truthy(result.signature, "Has signature even when empty");
});

test("ResourceRequestManager: Serialization round-trip with multiple request sets", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	// Create manager and add multiple request sets (keep it simpler - two levels)
	const manager1 = new ResourceRequestManager("test.project", "myTask", false);
	await manager1.addRequests({paths: ["/a.js"], patterns: []}, reader);
	await manager1.addRequests({paths: ["/a.js", "/b.js"], patterns: []}, reader);

	const signatures1 = manager1.getIndexSignatures();

	// Serialize and restore
	const cacheObj = manager1.toCacheObject();
	const manager2 = ResourceRequestManager.fromCache("test.project", "myTask", false, cacheObj);

	const signatures2 = manager2.getIndexSignatures();

	t.deepEqual(signatures2, signatures1, "Signatures preserved through serialization");
	t.false(manager2.hasNewOrModifiedCacheEntries(), "Restored manager has no new entries");
});

test("ResourceRequestManager: Serialization round-trip with multiple request sets and following update", async (t) => {
	const resources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")],
		["/b.js", createMockResource("/b.js", "hash-b")]
	]);
	const reader = createMockReader(resources);

	// Create manager and add multiple request sets (keep it simpler - two levels)
	const manager1 = new ResourceRequestManager("test.project", "myTask", false);
	await manager1.addRequests({paths: ["/a.js"], patterns: []}, reader);
	await manager1.addRequests({paths: ["/a.js", "/b.js"], patterns: []}, reader);

	const signatures1 = manager1.getIndexSignatures();

	// Serialize and restore
	const cacheObj = manager1.toCacheObject();
	const manager2 = ResourceRequestManager.fromCache("test.project", "myTask", false, cacheObj);


	const changedResources = new Map([
		["/a.js", createMockResource("/a.js", "hash-a")], // Identical to first
		["/b.js", createMockResource("/b.js", "hash-y")]
	]);
	const changedReader = createMockReader(changedResources);

	const hasChanges = await manager2.updateIndices(changedReader, ["/a.js", "/b.js"]);

	t.true(hasChanges, "Detected changes after update");

	const signatures2 = manager2.getIndexSignatures();

	t.is(signatures2[0], signatures1[0], "Unchanged signature of first request set");
	t.not(signatures2[1], signatures1[1], "Changed signature of second request set");
	t.true(manager2.hasNewOrModifiedCacheEntries(), "Restored manager has new entries");
});

