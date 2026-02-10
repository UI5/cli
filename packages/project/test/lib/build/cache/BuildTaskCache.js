import test from "ava";
import sinon from "sinon";
import BuildTaskCache from "../../../../lib/build/cache/BuildTaskCache.js";

// Helper to create mock readers
function createMockReader(resources = []) {
	const resourceMap = new Map(resources.map((r) => [r.getPath(), r]));
	return {
		byGlob: sinon.stub().callsFake(async (pattern) => {
			// Simple pattern matching for tests
			if (pattern === "/**/*") {
				return Array.from(resourceMap.values());
			}
			return resources.filter((r) => r.getPath().includes(pattern.replace(/[*]/g, "")));
		}),
		byPath: sinon.stub().callsFake(async (path) => {
			return resourceMap.get(path) || null;
		})
	};
}

// Helper to create mock resources
function createMockResource(path, content = "test content", hash = null) {
	const actualHash = hash || `hash-${path}`;
	return {
		getPath: () => path,
		getOriginalPath: () => path,
		getBuffer: async () => Buffer.from(content),
		getIntegrity: async () => actualHash,
		getLastModified: () => 1000,
		getSize: async () => content.length,
		getInode: () => 1
	};
}

test.afterEach.always(() => {
	sinon.restore();
});

// ===== CREATION AND INITIALIZATION TESTS =====

test("Create BuildTaskCache instance", (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	t.truthy(cache, "BuildTaskCache instance created");
	t.is(cache.getTaskName(), "testTask", "Task name matches");
	t.is(cache.getSupportsDifferentialBuilds(), false, "Differential updates disabled");
});

test("Create with differential updates enabled", (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", true);

	t.is(cache.getSupportsDifferentialBuilds(), true, "Differential updates enabled");
});

test("fromCache: restore BuildTaskCache from cached data", (t) => {
	const projectRequests = {
		requestSetGraph: {
			nodes: [],
			nextId: 1
		},
		rootIndices: [],
		deltaIndices: [],
		unusedAtLeastOnce: false
	};

	const dependencyRequests = {
		requestSetGraph: {
			nodes: [],
			nextId: 1
		},
		rootIndices: [],
		deltaIndices: [],
		unusedAtLeastOnce: false
	};

	const cache = BuildTaskCache.fromCache("test.project", "testTask", false,
		projectRequests, dependencyRequests);

	t.truthy(cache, "Cache restored from cached data");
	t.is(cache.getTaskName(), "testTask", "Task name preserved");
	t.is(cache.getSupportsDifferentialBuilds(), false, "Differential updates setting preserved");
});

// ===== METADATA ACCESS TESTS =====

test("getTaskName: returns task name", (t) => {
	const cache = new BuildTaskCache("test.project", "myTask", false);

	t.is(cache.getTaskName(), "myTask", "Task name returned");
});

test("getSupportsDifferentialBuilds: returns correct value", (t) => {
	const cache1 = new BuildTaskCache("test.project", "task1", false);
	const cache2 = new BuildTaskCache("test.project", "task2", true);

	t.false(cache1.getSupportsDifferentialBuilds(), "Returns false when disabled");
	t.true(cache2.getSupportsDifferentialBuilds(), "Returns true when enabled");
});

test("hasNewOrModifiedCacheEntries: initially true for new instance", (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	// A new instance has new entries that need to be written
	t.true(cache.hasNewOrModifiedCacheEntries(), "New instance has entries to write");
});

test("hasNewOrModifiedCacheEntries: true after recording requests", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, undefined, projectReader, dependencyReader);

	t.true(cache.hasNewOrModifiedCacheEntries(), "Has new entries after recording");
});

// ===== SIGNATURE TESTS =====

test("getProjectIndexSignatures: returns signatures after recording", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, undefined, projectReader, dependencyReader);

	const signatures = cache.getProjectIndexSignatures();

	t.true(Array.isArray(signatures), "Returns array");
	t.true(signatures.length > 0, "Has at least one signature");
	t.is(typeof signatures[0], "string", "Signature is a string");
});

test("getDependencyIndexSignatures: returns signatures after recording", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const projectResource = createMockResource("/test.js");
	const depResource = createMockResource("/dep.js");
	const projectReader = createMockReader([projectResource]);
	const dependencyReader = createMockReader([depResource]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const dependencyRequests = {
		paths: new Set(["/dep.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, dependencyRequests, projectReader, dependencyReader);

	const signatures = cache.getDependencyIndexSignatures();

	t.true(Array.isArray(signatures), "Returns array");
	t.true(signatures.length > 0, "Has at least one signature");
	t.is(typeof signatures[0], "string", "Signature is a string");
});

// ===== REQUEST RECORDING TESTS =====

test("recordRequests: handles project requests only", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests(
		projectRequests, undefined, projectReader, dependencyReader);

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
	t.true(projectSig.length > 0, "Project signature not empty");
	t.true(depSig.length > 0, "Dependency signature not empty");
});

test("recordRequests: handles both project and dependency requests", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const projectResource = createMockResource("/test.js");
	const depResource = createMockResource("/dep.js");
	const projectReader = createMockReader([projectResource]);
	const dependencyReader = createMockReader([depResource]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const dependencyRequests = {
		paths: new Set(["/dep.js"]),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests(
		projectRequests, dependencyRequests, projectReader, dependencyReader);

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
});

test("recordRequests: handles glob patterns", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const resource1 = createMockResource("/src/test1.js");
	const resource2 = createMockResource("/src/test2.js");
	const projectReader = createMockReader([resource1, resource2]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(),
		patterns: new Set(["/src/**/*.js"])
	};

	const [projectSig, depSig] = await cache.recordRequests(
		projectRequests, undefined, projectReader, dependencyReader);

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
});

test("recordRequests: handles empty requests", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const projectReader = createMockReader([]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests(
		projectRequests, undefined, projectReader, dependencyReader);

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
});

// ===== INDEX UPDATE TESTS =====

test("updateProjectIndices: processes changed resources", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	// First, record some requests
	const resource = createMockResource("/test.js", "initial content");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, undefined, projectReader, dependencyReader);

	// Now update with changed resource
	const updatedResource = createMockResource("/test.js", "updated content", "new-hash");
	const updatedReader = createMockReader([updatedResource]);

	const changed = await cache.updateProjectIndices(updatedReader, ["/test.js"]);

	t.is(typeof changed, "boolean", "Returns boolean");
});

test("updateDependencyIndices: processes changed dependencies", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	// First, record some requests
	const projectResource = createMockResource("/test.js");
	const depResource = createMockResource("/dep.js", "initial");
	const projectReader = createMockReader([projectResource]);
	const dependencyReader = createMockReader([depResource]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const dependencyRequests = {
		paths: new Set(["/dep.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, dependencyRequests, projectReader, dependencyReader);

	// Now update with changed dependency
	const updatedDepResource = createMockResource("/dep.js", "updated", "new-dep-hash");
	const updatedDepReader = createMockReader([updatedDepResource]);

	const changed = await cache.updateDependencyIndices(updatedDepReader, ["/dep.js"]);

	t.is(typeof changed, "boolean", "Returns boolean");
});

test("refreshDependencyIndices: refreshes all dependency indices", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	// First, record some requests
	const projectResource = createMockResource("/test.js");
	const depResource = createMockResource("/dep.js");
	const projectReader = createMockReader([projectResource]);
	const dependencyReader = createMockReader([depResource]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const dependencyRequests = {
		paths: new Set(["/dep.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, dependencyRequests, projectReader, dependencyReader);

	// Refresh all indices - returns undefined when processing changes, or false if no requests
	const result = await cache.refreshDependencyIndices(dependencyReader);

	t.true(result === undefined || result === false, "Returns undefined or false");
});

// ===== DELTA TESTS (for differential updates) =====

test("getProjectIndexDeltas: returns deltas when enabled", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", true);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, undefined, projectReader, dependencyReader);

	const deltas = cache.getProjectIndexDeltas();

	t.true(deltas instanceof Map, "Returns Map");
});

test("getDependencyIndexDeltas: returns deltas when enabled", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", true);

	const projectResource = createMockResource("/test.js");
	const depResource = createMockResource("/dep.js");
	const projectReader = createMockReader([projectResource]);
	const dependencyReader = createMockReader([depResource]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const dependencyRequests = {
		paths: new Set(["/dep.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, dependencyRequests, projectReader, dependencyReader);

	const deltas = cache.getDependencyIndexDeltas();

	t.true(deltas instanceof Map, "Returns Map");
});

// ===== SERIALIZATION TESTS =====

test("toCacheObjects: returns cache objects", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests, undefined, projectReader, dependencyReader);

	const [projectCache, dependencyCache] = cache.toCacheObjects();

	t.truthy(projectCache, "Project cache object exists");
	t.truthy(dependencyCache, "Dependency cache object exists");
	t.truthy(projectCache.requestSetGraph, "Has request set graph");
	t.true(Array.isArray(projectCache.rootIndices), "Has root indices array");
});

test("toCacheObjects: can restore from serialized data", async (t) => {
	const cache1 = new BuildTaskCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache1.recordRequests(projectRequests, undefined, projectReader, dependencyReader);

	const [projectCache, dependencyCache] = cache1.toCacheObjects();

	// Restore from cache
	const cache2 = BuildTaskCache.fromCache("test.project", "testTask", false,
		projectCache, dependencyCache);

	t.truthy(cache2, "Cache restored");
	t.is(cache2.getTaskName(), "testTask", "Task name preserved");
});

// ===== EDGE CASES =====

test("Create with empty project name", (t) => {
	const cache = new BuildTaskCache("", "testTask", false);

	t.truthy(cache, "Cache created with empty project name");
	t.is(cache.getTaskName(), "testTask", "Task name still accessible");
});

test("Multiple recordRequests calls accumulate", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const resource1 = createMockResource("/test1.js");
	const resource2 = createMockResource("/test2.js");
	const projectReader = createMockReader([resource1, resource2]);
	const dependencyReader = createMockReader([]);

	// First request
	const projectRequests1 = {
		paths: new Set(["/test1.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests1, undefined, projectReader, dependencyReader);

	const sigsBefore = cache.getProjectIndexSignatures();

	// Second request with different resources
	const projectRequests2 = {
		paths: new Set(["/test2.js"]),
		patterns: new Set()
	};

	await cache.recordRequests(projectRequests2, undefined, projectReader, dependencyReader);

	const sigsAfter = cache.getProjectIndexSignatures();

	t.true(sigsAfter.length >= sigsBefore.length, "Signatures accumulated");
});

test("Handles non-existent resource paths", async (t) => {
	const cache = new BuildTaskCache("test.project", "testTask", false);

	const projectReader = createMockReader([]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/nonexistent.js"]),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests(
		projectRequests, undefined, projectReader, dependencyReader);

	t.is(typeof projectSig, "string", "Still returns signature");
	t.is(typeof depSig, "string", "Still returns dependency signature");
});
