import test from "ava";
import sinon from "sinon";
import crypto from "node:crypto";
import BuildStageCache from "../../../../lib/build/cache/BuildStageCache.js";

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
		getInode: () => 1,
		getTags: () => null
	};
}

test.afterEach.always(() => {
	sinon.restore();
});

// ===== CREATION AND INITIALIZATION TESTS =====

test("Create BuildStageCache instance", (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	t.truthy(cache, "BuildStageCache instance created");
	t.is(cache.getStageId(), "testTask", "Stage id matches");
	t.is(cache.getStepBased(), false, "Differential updates disabled");
});

test("Create with differential updates enabled", (t) => {
	const cache = new BuildStageCache("test.project", "testTask", true);

	t.is(cache.getStepBased(), true, "Differential updates enabled");
});

test("getRootSignature: no recorded root requests returns the sha256 of an empty list", (t) => {
	// A stage with no root requests short-circuits to a precomputed constant. It must equal the digest
	// the previous code produced for an empty, sorted, NUL-joined signature list, so a standard build's
	// stages (none read through getRootReader) keep the same root component in their stage signature.
	const cache = new BuildStageCache("test.project", "testTask", false);
	const expected = crypto.createHash("sha256").update("").digest("hex");
	t.is(cache.getRootSignature(), expected,
		"empty root signature equals the digest of the empty join the hash loop produced");
});

test("fromCache: restore BuildStageCache from cached data", (t) => {
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

	const cache = BuildStageCache.fromCache({
		projectName: "test.project",
		stageId: "testTask",
		stepBased: false,
		projectRequests,
		dependencyRequests,
	});

	t.truthy(cache, "Cache restored from cached data");
	t.is(cache.getStageId(), "testTask", "Stage id preserved");
	t.is(cache.getStepBased(), false, "Differential updates setting preserved");
});

// ===== METADATA ACCESS TESTS =====

test("getStageId: returns stage id", (t) => {
	const cache = new BuildStageCache("test.project", "myTask", false);

	t.is(cache.getStageId(), "myTask", "Stage id returned");
});

test("getStepBased: returns correct value", (t) => {
	const cache1 = new BuildStageCache("test.project", "task1", false);
	const cache2 = new BuildStageCache("test.project", "task2", true);

	t.false(cache1.getStepBased(), "Returns false when disabled");
	t.true(cache2.getStepBased(), "Returns true when enabled");
});

test("hasNewOrModifiedCacheEntries: initially true for new instance", (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	// A new instance has new entries that need to be written
	t.true(cache.hasNewOrModifiedCacheEntries(), "New instance has entries to write");
});

test("hasNewOrModifiedCacheEntries: true after recording requests", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	t.true(cache.hasNewOrModifiedCacheEntries(), "Has new entries after recording");
});

// ===== SIGNATURE TESTS =====

test("getProjectIndexSignatures: returns signatures after recording", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	const signatures = cache.getProjectIndexSignatures();

	t.true(Array.isArray(signatures), "Returns array");
	t.true(signatures.length > 0, "Has at least one signature");
	t.is(typeof signatures[0], "string", "Signature is a string");
});

test("getDependencyIndexSignatures: returns signatures after recording", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

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

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		dependencyRequestRecording: dependencyRequests,
		projectReader,
		dependencyReader,
	});

	const signatures = cache.getDependencyIndexSignatures();

	t.true(Array.isArray(signatures), "Returns array");
	t.true(signatures.length > 0, "Has at least one signature");
	t.is(typeof signatures[0], "string", "Signature is a string");
});

// ===== REQUEST RECORDING TESTS =====

test("recordRequests: handles project requests only", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
	t.true(projectSig.length > 0, "Project signature not empty");
	t.true(depSig.length > 0, "Dependency signature not empty");
});

test("recordRequests: handles both project and dependency requests", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

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

	const [projectSig, depSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		dependencyRequestRecording: dependencyRequests,
		projectReader,
		dependencyReader,
	});

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
});

test("recordRequests: handles glob patterns", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const resource1 = createMockResource("/src/test1.js");
	const resource2 = createMockResource("/src/test2.js");
	const projectReader = createMockReader([resource1, resource2]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(),
		patterns: new Set(["/src/**/*.js"])
	};

	const [projectSig, depSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
});

test("recordRequests: handles empty requests", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const projectReader = createMockReader([]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	t.is(typeof projectSig, "string", "Project signature returned");
	t.is(typeof depSig, "string", "Dependency signature returned");
});

// ===== INDEX UPDATE TESTS =====

test("updateProjectIndices: processes changed resources", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	// First, record some requests
	const resource = createMockResource("/test.js", "initial content");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	// Now update with changed resource
	const updatedResource = createMockResource("/test.js", "updated content", "new-hash");
	const updatedReader = createMockReader([updatedResource]);

	const changed = await cache.updateProjectIndices(updatedReader, ["/test.js"]);

	t.is(typeof changed, "boolean", "Returns boolean");
});

test("updateDependencyIndices: processes changed dependencies", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

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

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		dependencyRequestRecording: dependencyRequests,
		projectReader,
		dependencyReader,
	});

	// Now update with changed dependency
	const updatedDepResource = createMockResource("/dep.js", "updated", "new-dep-hash");
	const updatedDepReader = createMockReader([updatedDepResource]);

	const changed = await cache.updateDependencyIndices(updatedDepReader, ["/dep.js"]);

	t.is(typeof changed, "boolean", "Returns boolean");
});

test("refreshDependencyIndices: refreshes all dependency indices", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

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

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		dependencyRequestRecording: dependencyRequests,
		projectReader,
		dependencyReader,
	});

	// Refresh all indices - returns undefined when processing changes, or false if no requests
	const result = await cache.refreshDependencyIndices(dependencyReader);

	t.true(result === undefined || result === false, "Returns undefined or false");
});

// ===== DELTA TESTS (for differential updates) =====

test("getProjectIndexDeltas: returns deltas when enabled", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", true);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	const deltas = cache.getProjectIndexDeltas();

	t.true(deltas instanceof Map, "Returns Map");
});

test("getDependencyIndexDeltas: returns deltas when enabled", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", true);

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

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		dependencyRequestRecording: dependencyRequests,
		projectReader,
		dependencyReader,
	});

	const deltas = cache.getDependencyIndexDeltas();

	t.true(deltas instanceof Map, "Returns Map");
});

// ===== STAGE SIGNATURE TESTS =====

test("getStageSignatures: composes the [project, dependency, input, root] tuple", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectResource = createMockResource("/test.js");
	const depResource = createMockResource("/dep.js");
	const projectReader = createMockReader([projectResource]);
	const dependencyReader = createMockReader([depResource]);

	const [projectSig, dependencySig, inputSig, rootSig] = await cache.recordRequests({
		projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
		dependencyRequestRecording: {paths: new Set(["/dep.js"]), patterns: new Set()},
		projectReader,
		dependencyReader,
	});

	const stageSignatures = cache.getStageSignatures();

	t.deepEqual(stageSignatures, [`${projectSig}-${dependencySig}-${inputSig}-${rootSig}`],
		"The single exact-match signature is the four components joined in tuple order");
});

test("getStageSignatures: empty-input and empty-root components are the stable empty-set digests",
	async (t) => {
		// A stage that reads only resources, with no non-resource inputs and no root reads: the input and
		// root slots must still carry the empty-set digests getInputSignature()/getRootSignature() return,
		// so a later lookup recomposes the same signature.
		const cache = new BuildStageCache("test.project", "testTask", false);
		const projectReader = createMockReader([createMockResource("/test.js")]);
		const dependencyReader = createMockReader([createMockResource("/dep.js")]);

		await cache.recordRequests({
			projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
			dependencyRequestRecording: {paths: new Set(["/dep.js"]), patterns: new Set()},
			projectReader,
			dependencyReader,
		});

		const [signature] = cache.getStageSignatures();
		const [, , inputComponent, rootComponent] = signature.split("-");

		t.is(inputComponent, cache.getInputSignature(), "Input slot is the empty-input digest");
		t.is(rootComponent, cache.getRootSignature(), "Root slot is the empty-root digest");
	});

test("getStageSignatures: one signature per project x dependency index-signature combination",
	async (t) => {
		// With a single project request set and a single dependency request set the cartesian product is
		// one signature. The product grows only as additional request sets are recorded.
		const cache = new BuildStageCache("test.project", "testTask", false);
		const projectReader = createMockReader([createMockResource("/test.js")]);
		const dependencyReader = createMockReader([createMockResource("/dep.js")]);

		await cache.recordRequests({
			projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
			dependencyRequestRecording: {paths: new Set(["/dep.js"]), patterns: new Set()},
			projectReader,
			dependencyReader,
		});

		t.is(cache.getStageSignatures().length, 1,
			"One project signature times one dependency signature yields one stage signature");
	});

// ===== SERIALIZATION TESTS =====

test("toCacheObjects: returns cache objects", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	const [projectCache, dependencyCache] = cache.toCacheObjects();

	t.truthy(projectCache, "Project cache object exists");
	t.truthy(dependencyCache, "Dependency cache object exists");
	t.truthy(projectCache.requestSetGraph, "Has request set graph");
	t.true(Array.isArray(projectCache.rootIndices), "Has root indices array");
});

test("toCacheObjects: can restore from serialized data", async (t) => {
	const cache1 = new BuildStageCache("test.project", "testTask", false);

	const resource = createMockResource("/test.js");
	const projectReader = createMockReader([resource]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/test.js"]),
		patterns: new Set()
	};

	await cache1.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	const [projectCache, dependencyCache] = cache1.toCacheObjects();

	// Restore from cache
	const cache2 = BuildStageCache.fromCache({
		projectName: "test.project",
		stageId: "testTask",
		stepBased: false,
		projectRequests: projectCache,
		dependencyRequests: dependencyCache,
	});

	t.truthy(cache2, "Cache restored");
	t.is(cache2.getStageId(), "testTask", "Stage id preserved");
});

// ===== EDGE CASES =====

test("Create with empty project name", (t) => {
	const cache = new BuildStageCache("", "testTask", false);

	t.truthy(cache, "Cache created with empty project name");
	t.is(cache.getStageId(), "testTask", "Stage id still accessible");
});

test("Multiple recordRequests calls accumulate", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const resource1 = createMockResource("/test1.js");
	const resource2 = createMockResource("/test2.js");
	const projectReader = createMockReader([resource1, resource2]);
	const dependencyReader = createMockReader([]);

	// First request
	const projectRequests1 = {
		paths: new Set(["/test1.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests1,
		projectReader,
		dependencyReader,
	});

	const sigsBefore = cache.getProjectIndexSignatures();

	// Second request with different resources
	const projectRequests2 = {
		paths: new Set(["/test2.js"]),
		patterns: new Set()
	};

	await cache.recordRequests({
		projectRequestRecording: projectRequests2,
		projectReader,
		dependencyReader,
	});

	const sigsAfter = cache.getProjectIndexSignatures();

	t.true(sigsAfter.length >= sigsBefore.length, "Signatures accumulated");
});

test("Handles non-existent resource paths", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);

	const projectReader = createMockReader([]);
	const dependencyReader = createMockReader([]);

	const projectRequests = {
		paths: new Set(["/nonexistent.js"]),
		patterns: new Set()
	};

	const [projectSig, depSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
	});

	t.is(typeof projectSig, "string", "Still returns signature");
	t.is(typeof depSig, "string", "Still returns dependency signature");
});

test("recordRequests with unresolved probe in delta position returns a distinct signature", async (t) => {
	// Shape observed in OpenUI5 after a branch switch: the first recording anchors
	// a resolvable parent request set, then a subsequent recording adds a byPath
	// probe for a file that no longer exists.
	const cache = new BuildStageCache("test.project", "testTask", false);

	const projectReader = createMockReader([
		createMockResource("/a.js"),
	]);
	const dependencyReader = createMockReader([]);

	const firstRequests = {
		paths: new Set(["/a.js"]),
		patterns: new Set(),
	};
	const [firstProjSig] = await cache.recordRequests({
		projectRequestRecording: firstRequests,
		projectReader,
		dependencyReader,
	});

	const probingRequests = {
		paths: new Set(["/a.js", "/optional.json"]),
		patterns: new Set(),
	};
	const [probingProjSig] = await cache.recordRequests({
		projectRequestRecording: probingRequests,
		projectReader,
		dependencyReader,
	});

	t.is(typeof probingProjSig, "string",
		"Probing recording completes without throwing");
	t.not(probingProjSig, firstProjSig,
		"Probing recording gets a cache key distinct from the parent's; the probed absence matters for output");
});

// ===== NON-RESOURCE INPUT TRACKING =====

test("recordRequests: returns an input signature and flags a modified input set", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const dependencyReader = createMockReader([]);
	const projectRequests = {paths: new Set(["/test.js"]), patterns: new Set()};

	const [, , inputSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader,
		inputRecording: [{type: "env", name: "FLAG", value: "on"}],
	});

	t.is(typeof inputSig, "string", "Input signature returned");
	t.true(cache.hasNewOrModifiedCacheEntries(), "Recording an input flags the set as modified");
});

test("getInputSignature: re-evaluates recorded inputs via the resolver", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const projectRequests = {paths: new Set(["/test.js"]), patterns: new Set()};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [{type: "project.getVersion", name: "sap.ui.core", value: "1.120.0"}],
	});

	const sameVersion = cache.getInputSignature(() => "1.120.0");
	const bumpedVersion = cache.getInputSignature(() => "2.0.0");
	t.not(sameVersion, bumpedVersion, "A changed resolver value changes the input signature");
});

test("toCacheObjects: includes an input cache object only when inputs were recorded", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const projectRequests = {paths: new Set(["/test.js"]), patterns: new Set()};

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader: createMockReader([]),
	});
	t.is(cache.toCacheObjects()[2], undefined, "No input cache object without recorded inputs");

	await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [{type: "env", name: "FLAG", value: "on"}],
	});
	const inputCache = cache.toCacheObjects()[2];
	t.truthy(inputCache, "Input cache object present after recording an input");
	t.deepEqual(inputCache.entries, [{type: "env", name: "FLAG"}], "Only type/name persisted");
});

test("fromCache: restores recorded inputs and re-evaluates them on lookup", async (t) => {
	const cache1 = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const projectRequests = {paths: new Set(["/test.js"]), patterns: new Set()};

	await cache1.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [{type: "project.getVersion", name: "sap.ui.core", value: "1.120.0"}],
	});
	const [projectCache, dependencyCache, inputCache] = cache1.toCacheObjects();

	const cache2 = BuildStageCache.fromCache({
		projectName: "test.project",
		stageId: "testTask",
		stepBased: false,
		projectRequests: projectCache,
		dependencyRequests: dependencyCache,
		inputSet: inputCache,
	});

	// Restored set carries only names; the resolver decides the value.
	t.is(cache2.getInputSignature(() => "1.120.0"), cache1.getInputSignature(() => "1.120.0"),
		"Restored input set reproduces the signature for the same resolved value");
	t.not(cache2.getInputSignature(() => "2.0.0"), cache2.getInputSignature(() => "1.120.0"),
		"Restored input set still reacts to a changed resolved value");
});

// ===== ROOT REQUEST TRACKING =====

const ROOT_REQUESTS = {
	gitignore: {paths: ["/tsconfig.json"], patterns: []},
	noGitignore: {paths: [], patterns: []},
};

test("recordRequests: records root requests and reflects them in the root signature", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const rootReader = createMockReader([createMockResource("/tsconfig.json", "{}")]);
	const projectRequests = {paths: new Set(["/test.js"]), patterns: new Set()};

	t.false(cache.hasRootRequests(), "No root requests before recording");
	const emptyRootSig = cache.getRootSignature();

	const [, , , rootSig] = await cache.recordRequests({
		projectRequestRecording: projectRequests,
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [],
		rootRequestRecording: ROOT_REQUESTS,
		getRootReader: () => rootReader,
	});

	t.true(cache.hasRootRequests(), "Root requests recorded");
	t.is(typeof rootSig, "string");
	t.not(rootSig, emptyRootSig, "Recording a root read changes the root signature");
	t.is(rootSig, cache.getRootSignature(), "recordRequests returns the aggregated root signature");
});

test("getRootSignature: is stable and empty when no root requests were recorded", async (t) => {
	const a = new BuildStageCache("test.project", "testTask", false);
	const b = new BuildStageCache("other.project", "otherTask", false);
	const reader = createMockReader([createMockResource("/test.js")]);
	// Record only project requests, leaving the root managers untouched.
	await a.recordRequests({
		projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
		projectReader: reader,
		dependencyReader: createMockReader([]),
	});

	t.false(a.hasRootRequests(), "A task with no root reads reports no root requests");
	t.is(a.getRootSignature(), b.getRootSignature(),
		"Two caches without root requests share the same stable root signature");
});

test("recordRequests: an empty root bucket leaves the manager clean", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	await cache.recordRequests({
		projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [],
		rootRequestRecording: {gitignore: {paths: [], patterns: []}, noGitignore: {paths: [], patterns: []}},
		getRootReader: () => createMockReader([]),
	});

	t.false(cache.hasRootRequests(), "An empty root recording records no requests");
	const [, , , rootCache, rootNoGitignoreCache] = cache.toCacheObjects();
	t.is(rootCache, undefined, "No root cache object for an empty gitignore bucket");
	t.is(rootNoGitignoreCache, undefined, "No root cache object for an empty noGitignore bucket");
});

test("refreshRootIndices: a changed root file changes the root signature", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);

	await cache.recordRequests({
		projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [],
		rootRequestRecording: ROOT_REQUESTS,
		getRootReader: () => createMockReader([createMockResource("/tsconfig.json", "{}", "hash-v1")]),
	});
	const before = cache.getRootSignature();

	// A later build sees tsconfig.json with different content.
	await cache.refreshRootIndices(
		() => createMockReader([createMockResource("/tsconfig.json", "{changed}", "hash-v2")]));

	t.not(cache.getRootSignature(), before, "Root signature reflects the changed root file");
});

test("toCacheObjects/fromCache: round-trips recorded root requests", async (t) => {
	const cache1 = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const rootReader = () => createMockReader([createMockResource("/tsconfig.json", "{}", "hash-root")]);

	await cache1.recordRequests({
		projectRequestRecording: {paths: new Set(["/test.js"]), patterns: new Set()},
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [],
		rootRequestRecording: ROOT_REQUESTS,
		getRootReader: rootReader,
	});
	const [projectCache, dependencyCache, inputCache, rootCache, rootNoGitignoreCache] =
		cache1.toCacheObjects();

	t.truthy(rootCache, "useGitignore:true root cache object present");
	t.is(rootNoGitignoreCache, undefined, "useGitignore:false bucket was empty, so nothing to persist");

	const cache2 = BuildStageCache.fromCache({
		projectName: "test.project",
		stageId: "testTask",
		stepBased: false,
		projectRequests: projectCache,
		dependencyRequests: dependencyCache,
		inputSet: inputCache,
		rootRequests: rootCache,
		rootNoGitignoreRequests: rootNoGitignoreCache,
	});

	t.true(cache2.hasRootRequests(), "Restored cache carries the root requests");
	await cache2.refreshRootIndices(rootReader);
	t.is(cache2.getRootSignature(), cache1.getRootSignature(),
		"Restored root managers reproduce the root signature for unchanged content");
});

test("recordRequests: a stage that stops reading root clears and persists the emptied manager", async (t) => {
	const cache = new BuildStageCache("test.project", "testTask", false);
	const projectReader = createMockReader([createMockResource("/test.js")]);
	const projectRequestRecording = {paths: new Set(["/test.js"]), patterns: new Set()};
	const emptyRootSig = cache.getRootSignature();

	// First build: the stage reads /tsconfig.json through the root reader.
	await cache.recordRequests({
		projectRequestRecording,
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [],
		rootRequestRecording: ROOT_REQUESTS,
		getRootReader: () => createMockReader([createMockResource("/tsconfig.json", "{}")]),
	});
	t.true(cache.hasRootRequests(), "Root request recorded on the first build");
	t.not(cache.getRootSignature(), emptyRootSig, "Root signature folds in the recorded root read");

	// Second build: the stage no longer reads any root resource.
	const [, , , rootSig] = await cache.recordRequests({
		projectRequestRecording,
		projectReader,
		dependencyReader: createMockReader([]),
		inputRecording: [],
		rootRequestRecording: {gitignore: {paths: [], patterns: []}, noGitignore: {paths: [], patterns: []}},
		getRootReader: () => createMockReader([]),
	});

	t.false(cache.hasRootRequests(), "The stale root request set is cleared");
	t.is(cache.getRootSignature(), emptyRootSig,
		"Root signature no longer folds in a resource the stage no longer reads");
	t.is(rootSig, emptyRootSig, "recordRequests returns the empty-root digest");

	// The emptied manager is persisted so the stored (stale) request set is overwritten, not left
	// behind for the next build to restore and keep folding into the signature.
	const [, , , rootCache] = cache.toCacheObjects();
	t.truthy(rootCache, "The cleared gitignore bucket is persisted to overwrite the stored request set");

	const restored = BuildStageCache.fromCache({
		projectName: "test.project",
		stageId: "testTask",
		stepBased: false,
		projectRequests: {requestSetGraph: {nodes: [], nextId: 1}, rootIndices: [], deltaIndices: []},
		dependencyRequests: {requestSetGraph: {nodes: [], nextId: 1}, rootIndices: [], deltaIndices: []},
		rootRequests: rootCache,
	});
	t.false(restored.hasRootRequests(), "Restoring the persisted empty manager carries no root requests");
	t.is(restored.getRootSignature(), emptyRootSig,
		"The restored manager reproduces the empty-root digest, so the stale read is gone for good");
});

test("fromCache: a task without root metadata restores clean root managers", (t) => {
	const emptyRequests = {requestSetGraph: {nodes: [], nextId: 1}, rootIndices: [], deltaIndices: []};
	const cache = BuildStageCache.fromCache({
		projectName: "test.project",
		stageId: "testTask",
		stepBased: false,
		projectRequests: emptyRequests,
		dependencyRequests: emptyRequests,
	});

	t.false(cache.hasRootRequests(), "No root requests restored");
	t.false(cache.hasNewOrModifiedCacheEntries(),
		"Restoring a task without root reads does not mark it for re-persistence");
});
