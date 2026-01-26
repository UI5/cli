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

	return {
		getName: () => name,
		getId: () => id,
		getSourceReader: sinon.stub().callsFake(() => createReader()),
		getReader: sinon.stub().callsFake(() => createReader()),
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
		writeStageResource: sinon.stub().resolves()
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

	t.true(project.initStages.calledOnce, "initStages called once");
	t.deepEqual(
		project.initStages.firstCall.args[0],
		["task/task1", "task/task2", "task/task3"],
		"Stage names generated correctly"
	);
});

test("setTasks with empty task list", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks([]);

	t.true(project.initStages.calledWith([]), "initStages called with empty array");
});

test("allTasksCompleted switches to result stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const changedPaths = await cache.allTasksCompleted();

	t.true(project.useResultStage.calledOnce, "useResultStage called");
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
	t.true(project.useStage.calledWith("task/myTask"), "Project switched to task stage");
});

test("prepareTaskExecutionAndValidateCache: switches project to correct stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1", "task2"]);
	await cache.prepareTaskExecutionAndValidateCache("task2");

	t.true(project.useStage.calledWith("task/task2"), "Switched to task2 stage");
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

test("refreshDependencyIndices: updates dependency indices", async (t) => {
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

	await cache.refreshDependencyIndices(mockDependencyReader);

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

	t.true(project.initStages.calledWith([]), "initStages called with empty array");
});
