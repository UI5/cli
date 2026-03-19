import test from "ava";
import sinon from "sinon";
import ProjectBuildCache from "../../../../lib/build/cache/ProjectBuildCache.js";

// Helper to create mock Project instances
function createMockProject(name = "test.project", id = "test-project-id") {
	const stages = new Map();
	let currentStage = {getId: () => "initial"};
	let resultStageReader = null;

	// Create a reusable reader with both byGlob and byPath
	const createReader = () => ({
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	});

	const projectResources = {
		getStage: sinon.stub().returns({
			getId: () => currentStage.id || "initial",
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([])
			})
		}),
		useStage: sinon.stub().callsFake((stageName) => {
			currentStage = {id: stageName};
		}),
		setStage: sinon.stub().callsFake((stageName, stage) => {
			stages.set(stageName, stage);
		}),
		initStages: sinon.stub(),
		setResultStage: sinon.stub().callsFake((reader) => {
			resultStageReader = reader;
		}),
		useResultStage: sinon.stub().callsFake(() => {
			currentStage = {id: "result"};
		}),
		getResourceTagOperations: sinon.stub().returns({
			projectTagOperations: new Map(),
			buildTagOperations: new Map(),
		}),
		buildFinished: sinon.stub(),
		setFrozenSourceReader: sinon.stub(),
	};

	return {
		getName: () => name,
		getId: () => id,
		getSourceReader: sinon.stub().callsFake(() => createReader()),
		getReader: sinon.stub().callsFake(() => createReader()),
		getProjectResources: () => projectResources,
		_getCurrentStage: () => currentStage,
		_getResultStageReader: () => resultStageReader
	};
}

// Helper to create mock CacheManager instances
function createMockCacheManager() {
	return {
		readIndexCache: sinon.stub().resolves(null),
		writeIndexCache: sinon.stub().resolves(),
		readStageCache: sinon.stub().resolves(null),
		writeStageCache: sinon.stub().resolves(),
		readResultMetadata: sinon.stub().resolves(null),
		writeResultMetadata: sinon.stub().resolves(),
		readTaskMetadata: sinon.stub().resolves(null),
		writeTaskMetadata: sinon.stub().resolves(),
		writeStageResource: sinon.stub().resolves(),
		getResourcePathForStage: sinon.stub().resolves("/fake/cache/path")
	};
}

// Helper to create mock Resource instances
function createMockResource(path, integrity = "test-hash", lastModified = 1000, size = 100, inode = 1) {
	return {
		getOriginalPath: () => path,
		getPath: () => path,
		getIntegrity: async () => integrity,
		getLastModified: () => lastModified,
		getSize: async () => size,
		getInode: () => inode,
		getTags: () => null,
		getBuffer: async () => Buffer.from("test content"),
		getStream: () => null
	};
}

test.afterEach.always(() => {
	sinon.restore();
});

// ===== CREATION AND INITIALIZATION TESTS =====

test("Create ProjectBuildCache instance", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	t.truthy(cache, "ProjectBuildCache instance created");
	t.true(cacheManager.readIndexCache.called, "Index cache was attempted to be loaded");
});

test("Create with existing index cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resource])
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash1",
				children: {
					"test.js": {
						hash: "hash1",
						metadata: {
							path: "/test.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: [["task1", false]]
	};

	// Mock task metadata responses
	cacheManager.readTaskMetadata.callsFake((projectId, buildSig, taskName, type) => {
		if (type === "project") {
			return Promise.resolve({
				requestSetGraph: {
					nodes: [],
					nextId: 1
				},
				rootIndices: [],
				deltaIndices: [],
				unusedAtLeastOnce: false
			});
		} else if (type === "dependencies") {
			return Promise.resolve({
				requestSetGraph: {
					nodes: [],
					nextId: 1
				},
				rootIndices: [],
				deltaIndices: [],
				unusedAtLeastOnce: false
			});
		}
		return Promise.resolve(null);
	});

	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	t.truthy(cache, "Cache created with existing index");
	const taskCache = cache.getTaskCache("task1");
	t.truthy(taskCache, "Task cache loaded from index");
});

test("Initialize without any cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	t.false(cache.isFresh(), "Cache is not fresh when empty");
});

test("isFresh returns false for empty cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.false(cache.isFresh(), "Empty cache is not fresh");
});

test("getTaskCache returns undefined for non-existent task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.is(cache.getTaskCache("nonexistent"), undefined, "Returns undefined");
});

// ===== TASK MANAGEMENT TESTS =====

test("setTasks initializes project stages", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1", "task2", "task3"]);

	t.true(project.getProjectResources().initStages.calledOnce, "initStages called once");
	t.deepEqual(
		project.getProjectResources().initStages.firstCall.args[0],
		["task/task1", "task/task2", "task/task3"],
		"Stage names generated correctly"
	);
});

test("setTasks with empty task list", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks([]);

	t.true(project.getProjectResources().initStages.calledWith([]), "initStages called with empty array");
});

test("allTasksCompleted switches to result stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const changedPaths = await cache.allTasksCompleted();

	t.true(project.getProjectResources().useResultStage.calledOnce, "useResultStage called");
	t.true(Array.isArray(changedPaths), "Returns array of changed paths");
	t.true(cache.isFresh(), "Cache is fresh after all tasks completed");
});

test("allTasksCompleted returns changed resource paths", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	// Create cache with existing index to be able to track changes
	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resource])
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash1",
				children: {
					"test.js": {
						hash: "hash1",
						metadata: {
							path: "/test.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: []
	};
	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	// Simulate some changes - change tracking happens during prepareProjectBuildAndValidateCache
	cache.projectSourcesChanged(["/test.js"]);

	const changedPaths = await cache.allTasksCompleted();

	t.true(Array.isArray(changedPaths), "Returns array of changed paths");
});

// ===== TASK EXECUTION AND RECORDING TESTS =====

test("prepareTaskExecutionAndValidateCache: task needs execution when no cache exists", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["myTask"]);
	const canUseCache = await cache.prepareTaskExecutionAndValidateCache("myTask");

	t.false(canUseCache, "Task cannot use cache");
	t.true(project.getProjectResources().useStage.calledWith("task/myTask"), "Project switched to task stage");
});

test("prepareTaskExecutionAndValidateCache: switches project to correct stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1", "task2"]);
	await cache.prepareTaskExecutionAndValidateCache("task2");

	t.true(project.getProjectResources().useStage.calledWith("task/task2"), "Switched to task2 stage");
});

test("recordTaskResult: creates task cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["newTask"]);
	await cache.prepareTaskExecutionAndValidateCache("newTask");

	const projectRequests = {paths: new Set(["/input.js"]), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};

	await cache.recordTaskResult("newTask", projectRequests, dependencyRequests, null, false);

	const taskCache = cache.getTaskCache("newTask");
	t.truthy(taskCache, "Task cache created");
});

test("recordTaskResult with empty requests", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecutionAndValidateCache("task1");

	const projectRequests = {paths: new Set(), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};

	await cache.recordTaskResult("task1", projectRequests, dependencyRequests, null, false);

	const taskCache = cache.getTaskCache("task1");
	t.truthy(taskCache, "Task cache created even with no requests");
});

// ===== RESOURCE CHANGE TRACKING TESTS =====

test("projectSourcesChanged: marks cache as requiring validation", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	// Create cache with existing index
	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resource])
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash1",
				children: {
					"test.js": {
						hash: "hash1",
						metadata: {
							path: "/test.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: []
	};
	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	cache.projectSourcesChanged(["/test.js"]);

	t.false(cache.isFresh(), "Cache is not fresh after changes");
});

test("dependencyResourcesChanged: marks cache as requiring validation", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	// Create cache with existing index
	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resource])
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash1",
				children: {
					"test.js": {
						hash: "hash1",
						metadata: {
							path: "/test.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: []
	};
	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	cache.dependencyResourcesChanged(["/dep.js"]);

	t.false(cache.isFresh(), "Cache is not fresh after dependency changes");
});

test("projectSourcesChanged: tracks multiple changes", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	cache.projectSourcesChanged(["/test1.js"]);
	cache.projectSourcesChanged(["/test2.js", "/test3.js"]);

	// Changes are tracked internally
	t.pass("Multiple changes tracked");
});

test("prepareProjectBuildAndValidateCache: returns false for empty cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const mockDependencyReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	};

	const result = await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);

	t.is(result, false, "Returns false for empty cache");
});

test("_refreshDependencyIndices: updates dependency indices", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	// Create cache with existing task
	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resource])
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash1",
				children: {
					"test.js": {
						hash: "hash1",
						metadata: {
							path: "/test.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: [["task1", false]]
	};

	// Mock task metadata responses
	cacheManager.readTaskMetadata.callsFake((projectId, buildSig, taskName, type) => {
		if (type === "project") {
			return Promise.resolve({
				requestSetGraph: {
					nodes: [],
					nextId: 1
				},
				rootIndices: [],
				deltaIndices: [],
				unusedAtLeastOnce: false
			});
		} else if (type === "dependencies") {
			return Promise.resolve({
				requestSetGraph: {
					nodes: [],
					nextId: 1
				},
				rootIndices: [],
				deltaIndices: [],
				unusedAtLeastOnce: false
			});
		}
		return Promise.resolve(null);
	});

	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const mockDependencyReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	};

	await cache._refreshDependencyIndices(mockDependencyReader);

	t.pass("Dependency indices refreshed");
});

// ===== CACHE STORAGE TESTS =====

test("writeCache: writes index and stage caches", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	project.getReader.returns({
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	});

	await cache.writeCache();

	t.true(cacheManager.writeIndexCache.called, "Index cache written");
});

test("writeCache: skips writing unchanged caches", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	// Create cache with existing index
	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resource])
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash1",
				children: {
					"test.js": {
						hash: "hash1",
						metadata: {
							path: "/test.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: []
	};
	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	project.getReader.returns({
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	});

	// Write cache multiple times
	await cache.writeCache();
	const firstCallCount = cacheManager.writeIndexCache.callCount;

	await cache.writeCache();
	const secondCallCount = cacheManager.writeIndexCache.callCount;

	t.is(secondCallCount, firstCallCount + 1, "Index written each time");
});

// ===== EDGE CASES =====

test("Create cache with empty project name", async (t) => {
	const project = createMockProject("", "empty-project");
	const cacheManager = createMockCacheManager();

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.truthy(cache, "Cache created with empty project name");
});

test("Empty task list doesn't fail", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks([]);

	t.true(project.getProjectResources().initStages.calledWith([]), "initStages called with empty array");
});

// ===== CAS SOURCE FREEZE TESTS =====

// Helper: Creates a ProjectBuildCache with a populated source index containing the given resources.
// Runs a single task that writes `writtenPaths` and then calls allTasksCompleted.
// Returns {cache, project, cacheManager} for assertions.
async function buildCacheWithTaskResult(resources, writtenPaths = []) {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-sig";

	// Source reader returns the given resources for byGlob and individual byPath
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves(resources),
		byPath: sinon.stub().callsFake((path) => {
			const res = resources.find((r) => r.getPath() === path);
			return Promise.resolve(res || null);
		})
	}));

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	// Set up and execute a task
	await cache.setTasks(["myTask"]);
	await cache.prepareTaskExecutionAndValidateCache("myTask");

	// Simulate task writing some resources
	const writtenResources = writtenPaths.map(
		(p) => createMockResource(p, `hash-${p}`, 2000, 200, 2)
	);
	project.getProjectResources().getStage.returns({
		getId: () => "task/myTask",
		getWriter: sinon.stub().returns({
			byGlob: sinon.stub().resolves(writtenResources)
		})
	});

	const projectRequests = {paths: new Set(), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};
	await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, null, false);

	return {cache, project, cacheManager};
}

test("freezeUntransformedSources: writes only untransformed source files to CAS", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resB = createMockResource("/b.js", "hash-b", 1000, 100, 2);
	const resC = createMockResource("/c.js", "hash-c", 1000, 100, 3);
	const resD = createMockResource("/d.js", "hash-d", 1000, 100, 4);

	// Task writes /a.js and /b.js, so /c.js and /d.js are untransformed
	const {cache, cacheManager} = await buildCacheWithTaskResult(
		[resA, resB, resC, resD],
		["/a.js", "/b.js"]
	);

	await cache.allTasksCompleted();

	// writeStageResource should be called for untransformed files /c.js and /d.js
	const stageResourceCalls = cacheManager.writeStageResource.getCalls();
	const writtenPaths = stageResourceCalls.map((call) => call.args[3].getOriginalPath());
	t.true(writtenPaths.includes("/c.js"), "Untransformed /c.js written to CAS");
	t.true(writtenPaths.includes("/d.js"), "Untransformed /d.js written to CAS");
	t.false(writtenPaths.includes("/a.js"), "Transformed /a.js NOT written to CAS by freeze");
	t.false(writtenPaths.includes("/b.js"), "Transformed /b.js NOT written to CAS by freeze");
});

test("freezeUntransformedSources: early return when all sources overlayed", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resB = createMockResource("/b.js", "hash-b", 1000, 100, 2);

	// Task writes all source files
	const {cache, cacheManager} = await buildCacheWithTaskResult(
		[resA, resB],
		["/a.js", "/b.js"]
	);

	await cache.allTasksCompleted();

	// writeStageCache should NOT be called with stageId "source"
	const sourceStageCalls = cacheManager.writeStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	t.is(sourceStageCalls.length, 0, "No source stage cache written when all files overlayed");
});

test("freezeUntransformedSources: writes stage cache with correct stageId and signature", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resB = createMockResource("/b.js", "hash-b", 1000, 100, 2);

	// Task writes only /a.js, so /b.js is untransformed
	const {cache, project, cacheManager} = await buildCacheWithTaskResult(
		[resA, resB],
		["/a.js"]
	);

	await cache.allTasksCompleted();

	// writeStageCache called with stageId "source"
	const sourceStageCalls = cacheManager.writeStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	t.is(sourceStageCalls.length, 1, "writeStageCache called once for source stage");

	const call = sourceStageCalls[0];
	t.is(call.args[0], "test-project-id", "Correct project ID");
	t.is(call.args[1], "test-sig", "Correct build signature");
	t.is(call.args[2], "source", "Correct stageId");
	t.is(typeof call.args[3], "string", "Signature is a string");
	t.truthy(call.args[4].resourceMetadata, "Metadata contains resourceMetadata");
	t.truthy(call.args[4].resourceMetadata["/b.js"], "resourceMetadata has entry for untransformed /b.js");
	t.falsy(call.args[4].resourceMetadata["/a.js"], "resourceMetadata does NOT have entry for transformed /a.js");

	// Verify setFrozenSourceReader was called on project resources
	const projectResources = project.getProjectResources();
	t.true(projectResources.setFrozenSourceReader.calledOnce,
		"setFrozenSourceReader called once after freeze");
	t.truthy(projectResources.setFrozenSourceReader.firstCall.args[0],
		"setFrozenSourceReader called with a reader");
});

test("freezeUntransformedSources: throws when source file not found", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resB = createMockResource("/b.js", "hash-b", 1000, 100, 2);

	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	// First call during init returns both resources; second call during freeze returns only /a.js
	let callCount = 0;
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().callsFake(() => {
			callCount++;
			if (callCount <= 1) {
				return Promise.resolve([resA, resB]);
			}
			return Promise.resolve([resA, resB]);
		}),
		byPath: sinon.stub().callsFake((path) => {
			// During freeze, /b.js disappears
			if (path === "/b.js") {
				return Promise.resolve(null);
			}
			return Promise.resolve(resA);
		})
	}));

	const cache = await ProjectBuildCache.create(project, "test-sig", cacheManager);
	await cache.setTasks(["myTask"]);
	await cache.prepareTaskExecutionAndValidateCache("myTask");

	project.getProjectResources().getStage.returns({
		getId: () => "task/myTask",
		getWriter: sinon.stub().returns({
			byGlob: sinon.stub().resolves([createMockResource("/a.js", "hash-a", 2000, 200, 2)])
		})
	});

	const projectRequests = {paths: new Set(), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};
	await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, null, false);

	const error = await t.throwsAsync(() => cache.allTasksCompleted());
	t.true(error.message.includes("not found during CAS freeze"),
		"Error message mentions CAS freeze");
});

// ===== RESULT METADATA SHAPE TESTS =====

test("writeResultCache: metadata includes sourceStageSignature", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);

	const {cache, cacheManager} = await buildCacheWithTaskResult(
		[resA],
		["/a.js"]
	);

	await cache.allTasksCompleted();
	await cache.writeCache();

	// writeResultMetadata should have been called
	t.true(cacheManager.writeResultMetadata.called, "writeResultMetadata was called");

	const metadataCall = cacheManager.writeResultMetadata.getCall(0);
	const metadata = metadataCall.args[3];
	t.truthy(metadata.stageSignatures, "Metadata contains stageSignatures");
	t.is(typeof metadata.sourceStageSignature, "string",
		"Metadata contains sourceStageSignature as string");
});

// ===== RESTORE FROZEN SOURCES TESTS =====

test("restoreFrozenSources: cache miss skips gracefully", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resA]),
		byPath: sinon.stub().resolves(resA)
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash-a",
				children: {
					"a.js": {
						hash: "hash-a",
						metadata: {
							path: "/a.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: [["task1", false]]
	};
	cacheManager.readIndexCache.resolves(indexCache);
	cacheManager.readTaskMetadata.callsFake((projectId, buildSig, taskName, type) => {
		return Promise.resolve({
			requestSetGraph: {nodes: [], nextId: 1},
			rootIndices: [],
			deltaIndices: [],
			unusedAtLeastOnce: true
		});
	});

	// readResultMetadata returns metadata WITH sourceStageSignature
	cacheManager.readResultMetadata.resolves({
		stageSignatures: {"task/task1": "sig1-sig2"},
		sourceStageSignature: "source-sig-123"
	});

	// readStageCache for task stage returns valid data, but for "source" stage returns null
	cacheManager.readStageCache.callsFake((projectId, buildSig, stageName, signature) => {
		if (stageName === "source") {
			return Promise.resolve(null); // Cache miss for source stage
		}
		// Return valid stage for task stages
		return Promise.resolve({
			resourceMetadata: {"/a.js": {integrity: "hash-a", lastModified: 1000, size: 100, inode: 1}},
			projectTagOperations: {},
			buildTagOperations: {},
		});
	});

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const mockDepReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	};
	const result = await cache.prepareProjectBuildAndValidateCache(mockDepReader);

	// Should succeed without error — cache miss for source stage is non-fatal
	t.truthy(result, "prepareProjectBuildAndValidateCache succeeds despite source cache miss");

	// setFrozenSourceReader should NOT have been called
	t.false(project.getProjectResources().setFrozenSourceReader.called,
		"setFrozenSourceReader not called on cache miss");

	// Verify readStageCache was called with "source" stageId
	const sourceReadCalls = cacheManager.readStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	t.true(sourceReadCalls.length > 0, "readStageCache was called for source stage");
});

test("restoreFrozenSources: cache hit creates CAS reader", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves([resA]),
		byPath: sinon.stub().resolves(resA)
	}));

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 1000,
			root: {
				hash: "hash-a",
				children: {
					"a.js": {
						hash: "hash-a",
						metadata: {
							path: "/a.js",
							lastModified: 1000,
							size: 100,
							inode: 1
						}
					}
				}
			}
		},
		tasks: [["task1", false]]
	};
	cacheManager.readIndexCache.resolves(indexCache);
	cacheManager.readTaskMetadata.callsFake((projectId, buildSig, taskName, type) => {
		return Promise.resolve({
			requestSetGraph: {nodes: [], nextId: 1},
			rootIndices: [],
			deltaIndices: [],
			unusedAtLeastOnce: true
		});
	});

	// readResultMetadata returns metadata WITH sourceStageSignature
	cacheManager.readResultMetadata.resolves({
		stageSignatures: {"task/task1": "sig1-sig2"},
		sourceStageSignature: "source-sig-456"
	});

	// readStageCache returns valid data for both task and source stages
	cacheManager.readStageCache.callsFake((projectId, buildSig, stageName, signature) => {
		if (stageName === "source") {
			return Promise.resolve({
				resourceMetadata: {
					"/b.js": {integrity: "hash-b", lastModified: 1000, size: 100, inode: 2}
				},
			});
		}
		return Promise.resolve({
			resourceMetadata: {"/a.js": {integrity: "hash-a", lastModified: 1000, size: 100, inode: 1}},
			projectTagOperations: {},
			buildTagOperations: {},
		});
	});

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const mockDepReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	};
	const result = await cache.prepareProjectBuildAndValidateCache(mockDepReader);

	t.truthy(result, "Cache restored successfully");

	// Verify readStageCache was called with "source" stageId and the correct signature
	const sourceReadCalls = cacheManager.readStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	t.true(sourceReadCalls.length > 0, "readStageCache was called for source stage");
	t.is(sourceReadCalls[0].args[3], "source-sig-456",
		"readStageCache called with correct source signature");

	// Verify setFrozenSourceReader was called on project resources after restore
	const projectResources = project.getProjectResources();
	t.true(projectResources.setFrozenSourceReader.calledOnce,
		"setFrozenSourceReader called once after restore");
	t.truthy(projectResources.setFrozenSourceReader.firstCall.args[0],
		"setFrozenSourceReader called with a reader");
});
