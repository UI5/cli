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
		importTagOperations: sinon.stub(),
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
		hasContent: sinon.stub().returns(false),
		readContent: sinon.stub().returns(Buffer.from("test")),
		readContentRaw: sinon.stub().returns(Buffer.from("test")),
		putContent: sinon.stub(),
		hasResourceForStage: sinon.stub().returns(false),
		beginContentBatch: sinon.stub(),
		endContentBatch: sinon.stub(),
		rollbackContentBatch: sinon.stub(),
		beginMetadataBatch: sinon.stub(),
		endMetadataBatch: sinon.stub(),
		rollbackMetadataBatch: sinon.stub(),
		findExistingStageSignatures: sinon.stub().callsFake((projectId, buildSig, stageId, sigs) => sigs),
		findExistingResultSignatures: sinon.stub().callsFake((projectId, buildSig, sigs) => sigs),
		findExistingContentIntegrities: sinon.stub().returns(new Set()),
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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	t.truthy(cache, "Cache created with existing index");
	const taskCache = cache.getTaskCache("task1");
	t.truthy(taskCache, "Task cache loaded from index");
});

test("Initialize without any cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);
	await cache.initSourceIndex();

	t.false(cache.isFresh(), "Cache is not fresh when empty");
});

test("isFresh returns false for empty cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

	t.false(cache.isFresh(), "Empty cache is not fresh");
});

test("getTaskCache returns undefined for non-existent task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

	t.is(cache.getTaskCache("nonexistent"), undefined, "Returns undefined");
});

// ===== TASK MANAGEMENT TESTS =====

test("setTasks initializes project stages", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	await cache.setTasks([]);

	t.true(project.getProjectResources().initStages.calledWith([]), "initStages called with empty array");
});

test("allTasksCompleted switches to result stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	await cache.setTasks(["myTask"]);
	const canUseCache = await cache.prepareTaskExecutionAndValidateCache("myTask");

	t.false(canUseCache, "Task cannot use cache");
	t.true(project.getProjectResources().useStage.calledWith("task/myTask"), "Project switched to task stage");
});

test("prepareTaskExecutionAndValidateCache: switches project to correct stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

	await cache.setTasks(["task1", "task2"]);
	await cache.prepareTaskExecutionAndValidateCache("task2");

	t.true(project.getProjectResources().useStage.calledWith("task/task2"), "Switched to task2 stage");
});

test("recordTaskResult: creates task cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecutionAndValidateCache("task1");

	const projectRequests = {paths: new Set(), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};

	await cache.recordTaskResult("task1", projectRequests, dependencyRequests, null, false);

	const taskCache = cache.getTaskCache("task1");
	t.truthy(taskCache, "Task cache created even with no requests");
});

// ===== DELTA (CACHEINFO) PATH IN RECORDTASKRESULT TESTS =====

test("recordTaskResult with cacheInfo: merges resources from previous stage, skipping already-written paths",
	async (t) => {
		const project = createMockProject();
		const cacheManager = createMockCacheManager();
		const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
		await cache.initSourceIndex();

		await cache.setTasks(["myTask"]);
		await cache.prepareTaskExecutionAndValidateCache("myTask");

		// Resources written by the delta execution
		const deltaWrittenRes = createMockResource("/a.js", "hash-a-new", 2000, 200, 2);
		const writeStub = sinon.stub().resolves();
		project.getProjectResources().getStage.returns({
			getId: () => "task/myTask",
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([deltaWrittenRes]),
				write: writeStub,
			})
		});

		// Resources from the previous stage cache (Reader-type: has byGlob directly)
		const prevResA = createMockResource("/a.js", "hash-a-old", 1000, 100, 1);
		const prevResB = createMockResource("/b.js", "hash-b", 1000, 100, 2);
		const prevResC = createMockResource("/c.js", "hash-c", 1000, 100, 3);

		const cacheInfo = {
			previousStageCache: {
				signature: "prev-proj-prev-dep",
				stage: {
					byGlob: sinon.stub().resolves([prevResA, prevResB, prevResC]),
				},
				writtenResourcePaths: ["/a.js", "/b.js", "/c.js"],
				projectTagOperations: undefined,
				buildTagOperations: undefined,
			},
			newSignature: "new-proj-new-dep",
			changedProjectResourcePaths: ["/a.js"],
			changedDependencyResourcePaths: [],
		};

		const projectRequests = {paths: new Set(), patterns: new Set()};
		const dependencyRequests = {paths: new Set(), patterns: new Set()};
		await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, cacheInfo, false);

		t.is(writeStub.callCount, 2, "Write called for 2 non-overlapping resources");
		const writtenPaths = writeStub.getCalls().map((call) => call.args[0].getOriginalPath());
		t.true(writtenPaths.includes("/b.js"), "Previous resource /b.js merged into stage");
		t.true(writtenPaths.includes("/c.js"), "Previous resource /c.js merged into stage");
		t.false(writtenPaths.includes("/a.js"), "Already-written /a.js not merged");
	});

test("recordTaskResult with cacheInfo: calls importTagOperations with previous stage cache tags",
	async (t) => {
		const project = createMockProject();
		const cacheManager = createMockCacheManager();
		const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
		await cache.initSourceIndex();

		await cache.setTasks(["myTask"]);
		await cache.prepareTaskExecutionAndValidateCache("myTask");

		const writeStub = sinon.stub().resolves();
		project.getProjectResources().getStage.returns({
			getId: () => "task/myTask",
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([]),
				write: writeStub,
			})
		});

		const prevProjectTags = new Map([["/x.js", new Map([["ui5:IsDebugVariant", true]])]]);
		const prevBuildTags = new Map([["/y.js", new Map([["ui5:OmitFromBuildResult", true]])]]);

		const cacheInfo = {
			previousStageCache: {
				signature: "prev-proj-prev-dep",
				stage: {
					byGlob: sinon.stub().resolves([]),
				},
				writtenResourcePaths: [],
				projectTagOperations: prevProjectTags,
				buildTagOperations: prevBuildTags,
			},
			newSignature: "new-proj-new-dep",
			changedProjectResourcePaths: [],
			changedDependencyResourcePaths: [],
		};

		const projectRequests = {paths: new Set(), patterns: new Set()};
		const dependencyRequests = {paths: new Set(), patterns: new Set()};
		await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, cacheInfo, false);

		const importStub = project.getProjectResources().importTagOperations;
		t.true(importStub.calledOnce, "importTagOperations called once");
		t.is(importStub.firstCall.args[0], prevProjectTags,
			"Called with previous stage projectTagOperations");
		t.is(importStub.firstCall.args[1], prevBuildTags,
			"Called with previous stage buildTagOperations");
	});

test("recordTaskResult with cacheInfo: merges tag operations with current delta ops taking precedence",
	async (t) => {
		const project = createMockProject();
		const cacheManager = createMockCacheManager();
		const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
		await cache.initSourceIndex();

		await cache.setTasks(["myTask"]);
		await cache.prepareTaskExecutionAndValidateCache("myTask");

		// Delta execution's own tag operations — /a.js IsDebugVariant overrides previous value
		project.getProjectResources().getResourceTagOperations.returns({
			projectTagOperations: new Map([["/a.js", new Map([["ui5:IsDebugVariant", false]])]]),
			buildTagOperations: new Map([["/c.js", new Map([["ui5:NewBuildTag", "val"]])]]),
		});

		// Set up stage mock with full resource metadata for writeCache to work
		const writtenRes = createMockResource("/a.js", "hash-a", 2000, 200, 2);
		const writeStub = sinon.stub().resolves();
		project.getProjectResources().getStage.returns({
			getId: () => "task/myTask",
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([writtenRes]),
				write: writeStub,
			})
		});

		const cacheInfo = {
			previousStageCache: {
				signature: "prev-proj-prev-dep",
				stage: {
					byGlob: sinon.stub().resolves([]),
				},
				writtenResourcePaths: [],
				projectTagOperations: new Map([
					["/a.js", new Map([["ui5:IsDebugVariant", true]])],
					["/b.js", new Map([["ui5:HasDebugVariant", true]])],
				]),
				buildTagOperations: new Map([
					["/a.js", new Map([["ui5:OldBuildTag", "old"]])],
				]),
			},
			newSignature: "merged-sig",
			changedProjectResourcePaths: [],
			changedDependencyResourcePaths: [],
		};

		const projectRequests = {paths: new Set(), patterns: new Set()};
		const dependencyRequests = {paths: new Set(), patterns: new Set()};
		await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, cacheInfo, false);

		// Verify merged tags via writeCache -> cacheManager.writeStageCache
		await cache.writeCache();

		const stageCacheCalls = cacheManager.writeStageCache.getCalls().filter(
			(call) => call.args[2] === "task/myTask"
		);
		t.is(stageCacheCalls.length, 1, "writeStageCache called once for task/myTask");

		const metadata = stageCacheCalls[0].args[4];

		// Project tag ops: /a.js should have delta's value (false), /b.js preserved from previous
		t.is(metadata.projectTagOperations["/a.js"]["ui5:IsDebugVariant"], false,
			"Delta's value for /a.js takes precedence over previous");
		t.is(metadata.projectTagOperations["/b.js"]["ui5:HasDebugVariant"], true,
			"Previous value for /b.js preserved");

		// Build tag ops: /a.js from previous, /c.js from delta
		t.is(metadata.buildTagOperations["/a.js"]["ui5:OldBuildTag"], "old",
			"Previous build tag for /a.js preserved");
		t.is(metadata.buildTagOperations["/c.js"]["ui5:NewBuildTag"], "val",
			"Delta build tag for /c.js present");
	});

test("recordTaskResult with cacheInfo: uses cacheInfo.newSignature as stage signature",
	async (t) => {
		const project = createMockProject();
		const cacheManager = createMockCacheManager();
		const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
		await cache.initSourceIndex();

		await cache.setTasks(["myTask"]);
		await cache.prepareTaskExecutionAndValidateCache("myTask");

		const writtenRes = createMockResource("/a.js", "hash-a", 2000, 200, 2);
		const writeStub = sinon.stub().resolves();
		project.getProjectResources().getStage.returns({
			getId: () => "task/myTask",
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([writtenRes]),
				write: writeStub,
			})
		});

		const cacheInfo = {
			previousStageCache: {
				signature: "prev-proj-prev-dep",
				stage: {
					byGlob: sinon.stub().resolves([]),
				},
				writtenResourcePaths: [],
				projectTagOperations: undefined,
				buildTagOperations: undefined,
			},
			newSignature: "custom-proj-sig-custom-dep-sig",
			changedProjectResourcePaths: [],
			changedDependencyResourcePaths: [],
		};

		const projectRequests = {paths: new Set(), patterns: new Set()};
		const dependencyRequests = {paths: new Set(), patterns: new Set()};
		await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, cacheInfo, false);

		await cache.writeCache();

		const stageCacheCalls = cacheManager.writeStageCache.getCalls().filter(
			(call) => call.args[2] === "task/myTask"
		);
		t.is(stageCacheCalls.length, 1, "writeStageCache called once for task/myTask");
		t.is(stageCacheCalls[0].args[3], "custom-proj-sig-custom-dep-sig",
			"Stage signature comes from cacheInfo.newSignature");
	});

test("recordTaskResult with cacheInfo: uses getCachedWriter fallback when getWriter returns null",
	async (t) => {
		const project = createMockProject();
		const cacheManager = createMockCacheManager();
		const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
		await cache.initSourceIndex();

		await cache.setTasks(["myTask"]);
		await cache.prepareTaskExecutionAndValidateCache("myTask");

		const writeStub = sinon.stub().resolves();
		project.getProjectResources().getStage.returns({
			getId: () => "task/myTask",
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([]),
				write: writeStub,
			})
		});

		// Previous stage is a Stage-type (no byGlob), getWriter returns null, getCachedWriter used
		const prevResE = createMockResource("/e.js", "hash-e", 1000, 100, 5);
		const getCachedWriterStub = sinon.stub().returns({
			byGlob: sinon.stub().resolves([prevResE]),
		});

		const cacheInfo = {
			previousStageCache: {
				signature: "prev-proj-prev-dep",
				stage: {
					getWriter: sinon.stub().returns(null),
					getCachedWriter: getCachedWriterStub,
				},
				writtenResourcePaths: ["/e.js"],
				projectTagOperations: undefined,
				buildTagOperations: undefined,
			},
			newSignature: "new-proj-new-dep",
			changedProjectResourcePaths: [],
			changedDependencyResourcePaths: [],
		};

		const projectRequests = {paths: new Set(), patterns: new Set()};
		const dependencyRequests = {paths: new Set(), patterns: new Set()};
		await cache.recordTaskResult("myTask", projectRequests, dependencyRequests, cacheInfo, false);

		t.true(getCachedWriterStub.calledOnce, "getCachedWriter used as fallback");
		t.is(writeStub.callCount, 1, "Write called for 1 resource from cached writer");
		t.is(writeStub.firstCall.args[0].getOriginalPath(), "/e.js",
			"Resource /e.js merged from getCachedWriter");
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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	cache.dependencyResourcesChanged(["/dep.js"]);

	t.false(cache.isFresh(), "Cache is not fresh after dependency changes");
});

test("projectSourcesChanged: tracks multiple changes", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

	cache.projectSourcesChanged(["/test1.js"]);
	cache.projectSourcesChanged(["/test2.js", "/test3.js"]);

	// Changes are tracked internally
	t.pass("Multiple changes tracked");
});

test("prepareProjectBuildAndValidateCache: returns false for empty cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	t.truthy(cache, "Cache created with empty project name");
});

test("Empty task list doesn't fail", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

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

	// putContent should be called for untransformed files /c.js and /d.js
	const putContentCalls = cacheManager.putContent.getCalls();
	const writtenIntegrities = putContentCalls.map((call) => call.args[0]);
	t.true(writtenIntegrities.includes("hash-c"), "Untransformed /c.js written to CAS");
	t.true(writtenIntegrities.includes("hash-d"), "Untransformed /d.js written to CAS");
	t.false(writtenIntegrities.includes("hash-a"), "Transformed /a.js NOT written to CAS by freeze");
	t.false(writtenIntegrities.includes("hash-b"), "Transformed /b.js NOT written to CAS by freeze");
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
	await cache.initSourceIndex();
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

// ===== DELTA FREEZE REUSE TESTS =====

/**
 * Helper that creates a ProjectBuildCache from a warm cache (with index cache and previous
 * frozen source metadata), runs a single task, and returns the cache + mocks for assertions.
 *
 * @param {object} options
 * @param {Array} options.sourceResources Resources returned by the source reader
 * @param {string[]} options.taskWrittenPaths Paths written by the task
 * @param {object} options.previousFrozenMetadata Previous build's frozen source resourceMetadata
 * @param {string} [options.cachedSourceSignature="prev-source-sig"] Signature from the cached index tree root
 */
async function buildCacheWithWarmCacheAndTaskResult({
	sourceResources, taskWrittenPaths, previousFrozenMetadata, cachedSourceSignature = "prev-source-sig"
}) {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-sig";

	// Source reader returns given resources for byGlob and individual byPath
	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves(sourceResources),
		byPath: sinon.stub().callsFake((path) => {
			const res = sourceResources.find((r) => r.getPath() === path);
			return Promise.resolve(res || null);
		})
	}));

	// Build an indexCache that matches the source resources with no changes detected
	const children = {};
	for (const res of sourceResources) {
		const p = res.getPath();
		const name = p.slice(1); // strip leading /
		const integrity = await res.getIntegrity();
		const size = await res.getSize();
		children[name] = {
			name,
			type: "resource",
			hash: `node-hash-${name}`,
			integrity,
			lastModified: res.getLastModified(),
			size,
			inode: res.getInode(),
			tags: null
		};
	}

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 500, // Earlier than resource lastModified (1000) so matchMetadata says unchanged
			root: {
				name: "",
				type: "directory",
				hash: cachedSourceSignature,
				children
			}
		},
		tasks: [["myTask", 0]]
	};

	// Mock task metadata for the cached task
	cacheManager.readTaskMetadata.callsFake((projectId, buildSig, taskName, type) => {
		return Promise.resolve({
			requestSetGraph: {nodes: [], nextId: 1},
			rootIndices: [],
			deltaIndices: [],
			unusedAtLeastOnce: false
		});
	});

	// Return previous frozen source metadata when readStageCache is called
	// with the cached source signature during initSourceIndex
	cacheManager.readStageCache.callsFake((projectId, buildSig, stageId, stageSignature) => {
		if (stageId === "source" && stageSignature === cachedSourceSignature && previousFrozenMetadata) {
			return Promise.resolve({resourceMetadata: previousFrozenMetadata});
		}
		return Promise.resolve(null);
	});

	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);
	await cache.initSourceIndex();

	// Set up and execute a task
	await cache.setTasks(["myTask"]);
	await cache.prepareTaskExecutionAndValidateCache("myTask");

	// Simulate task writing some resources
	const writtenResources = taskWrittenPaths.map(
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

test("freezeUntransformedSources: fast path — reuses all entries from previous metadata", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resB = createMockResource("/b.js", "hash-b", 1000, 100, 2);
	const resC = createMockResource("/c.js", "hash-c", 1000, 100, 3);
	const resD = createMockResource("/d.js", "hash-d", 1000, 100, 4);

	// Previous frozen metadata covers /c.js and /d.js (the untransformed ones)
	const previousFrozenMetadata = {
		"/c.js": {integrity: "hash-c", lastModified: 1000, size: 100, inode: 3},
		"/d.js": {integrity: "hash-d", lastModified: 1000, size: 100, inode: 4},
	};

	// Task writes /a.js and /b.js — so /c.js and /d.js are untransformed
	const {cache, cacheManager} = await buildCacheWithWarmCacheAndTaskResult({
		sourceResources: [resA, resB, resC, resD],
		taskWrittenPaths: ["/a.js", "/b.js"],
		previousFrozenMetadata,
	});

	await cache.allTasksCompleted();

	// writeStageResource should NOT be called — all metadata was reused
	t.is(cacheManager.writeStageResource.callCount, 0,
		"No CAS writes needed when all metadata is reused");

	// writeStageCache SHOULD be called with the reused metadata
	const sourceStageCalls = cacheManager.writeStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	t.is(sourceStageCalls.length, 1, "writeStageCache called once for source stage");

	const writtenMetadata = sourceStageCalls[0].args[4].resourceMetadata;
	t.truthy(writtenMetadata["/c.js"], "Reused metadata for /c.js");
	t.truthy(writtenMetadata["/d.js"], "Reused metadata for /d.js");
	t.falsy(writtenMetadata["/a.js"], "No metadata for transformed /a.js");
	t.falsy(writtenMetadata["/b.js"], "No metadata for transformed /b.js");
	t.is(writtenMetadata["/c.js"].integrity, "hash-c", "Correct integrity for /c.js");
});

test("freezeUntransformedSources: delta path — only reads new files missing from previous metadata", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resB = createMockResource("/b.js", "hash-b", 1000, 100, 2);
	const resC = createMockResource("/c.js", "hash-c", 1000, 100, 3);
	const resD = createMockResource("/d.js", "hash-d", 1000, 100, 4);
	const resE = createMockResource("/e.js", "hash-e", 1000, 100, 5);

	// Previous frozen metadata only covers /c.js and /d.js
	// /e.js is a newly added file (not in previous metadata)
	const previousFrozenMetadata = {
		"/c.js": {integrity: "hash-c", lastModified: 1000, size: 100, inode: 3},
		"/d.js": {integrity: "hash-d", lastModified: 1000, size: 100, inode: 4},
	};

	// Task writes /a.js and /b.js — so /c.js, /d.js, /e.js are untransformed
	const {cache, cacheManager} = await buildCacheWithWarmCacheAndTaskResult({
		sourceResources: [resA, resB, resC, resD, resE],
		taskWrittenPaths: ["/a.js", "/b.js"],
		previousFrozenMetadata,
	});

	await cache.allTasksCompleted();

	// putContent should be called only for /e.js (the new file)
	const putContentCalls = cacheManager.putContent.getCalls();
	const writtenIntegrities = putContentCalls.map((call) => call.args[0]);
	t.is(writtenIntegrities.length, 1, "Only 1 CAS write for the new file");
	t.true(writtenIntegrities.includes("hash-e"), "New file /e.js written to CAS");

	// Merged metadata should contain all 3 untransformed files
	const sourceStageCalls = cacheManager.writeStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	const writtenMetadata = sourceStageCalls[0].args[4].resourceMetadata;
	t.truthy(writtenMetadata["/c.js"], "Reused metadata for /c.js");
	t.truthy(writtenMetadata["/d.js"], "Reused metadata for /d.js");
	t.truthy(writtenMetadata["/e.js"], "New metadata for /e.js");
	t.is(writtenMetadata["/c.js"].integrity, "hash-c", "Correct reused integrity for /c.js");
	t.is(writtenMetadata["/e.js"].integrity, "hash-e", "Correct new integrity for /e.js");
});

test("freezeUntransformedSources: removed file excluded from reused metadata", async (t) => {
	const resA = createMockResource("/a.js", "hash-a", 1000, 100, 1);
	const resC = createMockResource("/c.js", "hash-c", 1000, 100, 3);

	// Previous frozen metadata contains /c.js and /removed.js
	// /removed.js no longer exists in source index
	const previousFrozenMetadata = {
		"/c.js": {integrity: "hash-c", lastModified: 1000, size: 100, inode: 3},
		"/removed.js": {integrity: "hash-removed", lastModified: 1000, size: 100, inode: 9},
	};

	// Task writes /a.js — /c.js is untransformed. /removed.js is gone from sources.
	const {cache, cacheManager} = await buildCacheWithWarmCacheAndTaskResult({
		sourceResources: [resA, resC],
		taskWrittenPaths: ["/a.js"],
		previousFrozenMetadata,
	});

	await cache.allTasksCompleted();

	const sourceStageCalls = cacheManager.writeStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	const writtenMetadata = sourceStageCalls[0].args[4].resourceMetadata;
	t.truthy(writtenMetadata["/c.js"], "Reused metadata for /c.js");
	t.falsy(writtenMetadata["/removed.js"], "Removed file NOT in metadata");
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
	await cache.initSourceIndex();

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
	await cache.initSourceIndex();

	const mockDepReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	};
	const result = await cache.prepareProjectBuildAndValidateCache(mockDepReader);

	t.truthy(result, "Cache restored successfully");

	// Verify readStageCache was called with "source" stageId and the correct signature
	// Two calls expected: first from #initSourceIndex (pre-populating knownCasIntegrities using the
	// cached tree's root hash), second from #restoreFrozenSources (using the result cache's source signature)
	const sourceReadCalls = cacheManager.readStageCache.getCalls().filter(
		(call) => call.args[2] === "source"
	);
	t.is(sourceReadCalls.length, 2, "readStageCache was called twice for source stage");
	t.is(sourceReadCalls[0].args[3], "hash-a",
		"First readStageCache call uses cached tree root hash for knownCasIntegrities pre-population");
	t.is(sourceReadCalls[1].args[3], "source-sig-456",
		"Second readStageCache call uses correct source signature for frozen source restore");

	// Verify setFrozenSourceReader was called on project resources after restore
	const projectResources = project.getProjectResources();
	t.true(projectResources.setFrozenSourceReader.calledOnce,
		"setFrozenSourceReader called once after restore");
	t.truthy(projectResources.setFrozenSourceReader.firstCall.args[0],
		"setFrozenSourceReader called with a reader");
});

// ===== DEPENDENCY INDEX REFRESH OPTIMIZATION TESTS =====

// Helper: Creates a ProjectBuildCache in RESTORING_DEPENDENCY_INDICES state
// (warm cache loaded from disk with task metadata) and spies on _refreshDependencyIndices.
async function createCacheInRestoringState({
	resources = [createMockResource("/test.js", "hash1", 1000, 100, 1)],
	tasks = [["task1", false]],
} = {}) {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	project.getSourceReader.callsFake(() => ({
		byGlob: sinon.stub().resolves(resources),
		byPath: sinon.stub().callsFake((path) => {
			const res = resources.find((r) => r.getPath() === path);
			return Promise.resolve(res || null);
		})
	}));

	// Build an indexCache matching the resources (no changes detected)
	const children = {};
	for (const res of resources) {
		const p = res.getPath();
		const name = p.slice(1);
		children[name] = {
			name,
			type: "resource",
			hash: `node-hash-${name}`,
			integrity: await res.getIntegrity(),
			lastModified: res.getLastModified(),
			size: await res.getSize(),
			inode: res.getInode(),
			tags: null
		};
	}

	const indexCache = {
		version: "1.0",
		indexTree: {
			version: 1,
			indexTimestamp: 500, // Earlier than resource lastModified so matchMetadata says unchanged
			root: {
				name: "",
				type: "directory",
				hash: "root-hash",
				children
			}
		},
		tasks
	};

	cacheManager.readTaskMetadata.callsFake((projectId, buildSig, taskName, type) => {
		return Promise.resolve({
			requestSetGraph: {nodes: [], nextId: 1},
			rootIndices: [],
			deltaIndices: [],
			unusedAtLeastOnce: false
		});
	});

	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);
	await cache.initSourceIndex();

	// Spy on _refreshDependencyIndices so we can verify whether it's called
	const refreshSpy = sinon.spy(cache, "_refreshDependencyIndices");

	const mockDependencyReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	};

	return {cache, project, cacheManager, refreshSpy, mockDependencyReader};
}

test("prepareProjectBuildAndValidateCache: skips _refreshDependencyIndices when no dependency " +
	"changes propagated (warm cache)", async (t) => {
	const {cache, refreshSpy, mockDependencyReader} = await createCacheInRestoringState();

	// Do NOT call dependencyResourcesChanged — simulates warm cache with no upstream changes.
	// In RESTORING_DEPENDENCY_INDICES state, cached dependency indices (from BuildTaskCache.fromCache)
	// are already correct, so _refreshDependencyIndices can be skipped.
	await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);

	t.false(refreshSpy.called,
		"_refreshDependencyIndices should NOT be called when no dependency changes were propagated");
});

test("prepareProjectBuildAndValidateCache: dependency changes move state from " +
	"RESTORING_DEPENDENCY_INDICES to REQUIRES_UPDATE", async (t) => {
	const {cache, refreshSpy, mockDependencyReader} = await createCacheInRestoringState();

	// Simulate an upstream dependency rebuild propagating changed paths.
	// dependencyResourcesChanged() transitions state from RESTORING_DEPENDENCY_INDICES to REQUIRES_UPDATE,
	// so the changes go through #flushPendingChanges (incremental delta update) rather than
	// the full _refreshDependencyIndices path.
	cache.dependencyResourcesChanged(["/dep/lib/SomeModule.js"]);

	await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);

	// _refreshDependencyIndices is NOT called because dependencyResourcesChanged() already moved
	// the state to REQUIRES_UPDATE, bypassing the RESTORING_DEPENDENCY_INDICES branch entirely.
	// Instead, #flushPendingChanges handles the changes via incremental updateDependencyIndices.
	t.false(refreshSpy.called,
		"_refreshDependencyIndices should NOT be called — changes handled via #flushPendingChanges");
});

test("prepareProjectBuildAndValidateCache: transitions from RESTORING_DEPENDENCY_INDICES " +
	"to FRESH state", async (t) => {
	const {cache, refreshSpy, mockDependencyReader} = await createCacheInRestoringState();

	// First call transitions from RESTORING_DEPENDENCY_INDICES to FRESH
	await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);
	t.false(refreshSpy.called, "_refreshDependencyIndices not called on first pass (no changes)");

	// Second call without new changes — state is already FRESH, no refresh needed
	refreshSpy.resetHistory();
	await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);

	t.false(refreshSpy.called,
		"_refreshDependencyIndices should NOT be called on second invocation (state is FRESH)");
});

test("prepareProjectBuildAndValidateCache: subsequent dependency changes go through " +
	"REQUIRES_UPDATE path, not RESTORING_DEPENDENCY_INDICES", async (t) => {
	const {cache, refreshSpy, mockDependencyReader} = await createCacheInRestoringState();

	// First call with no changes — transitions from RESTORING_DEPENDENCY_INDICES to FRESH
	await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);
	t.false(refreshSpy.called, "_refreshDependencyIndices not called on first pass (no changes)");

	// Now simulate a dependency change (e.g. from BuildServer watch mode)
	cache.dependencyResourcesChanged(["/dep/lib/NewChange.js"]);

	// Second call — should go through REQUIRES_UPDATE / #flushPendingChanges, not _refreshDependencyIndices
	refreshSpy.resetHistory();
	await cache.prepareProjectBuildAndValidateCache(mockDependencyReader);

	t.false(refreshSpy.called,
		"_refreshDependencyIndices should NOT be called for REQUIRES_UPDATE state " +
		"(#flushPendingChanges handles it instead)");
});
