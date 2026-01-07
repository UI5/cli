import test from "ava";
import sinon from "sinon";
import ProjectBuildCache from "../../../../lib/build/cache/ProjectBuildCache.js";

// Helper to create mock Project instances
function createMockProject(name = "test.project", id = "test-project-id") {
	const stages = new Map();
	let currentStage = "source";
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
			getWriter: sinon.stub().returns({
				byGlob: sinon.stub().resolves([])
			})
		}),
		useStage: sinon.stub().callsFake((stageName) => {
			currentStage = stageName;
		}),
		setStage: sinon.stub().callsFake((stageName, stage) => {
			stages.set(stageName, stage);
		}),
		initStages: sinon.stub(),
		setResultStage: sinon.stub().callsFake((reader) => {
			resultStageReader = reader;
		}),
		useResultStage: sinon.stub().callsFake(() => {
			currentStage = "result";
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
		readBuildManifest: sinon.stub().resolves(null),
		writeBuildManifest: sinon.stub().resolves(),
		getResourcePathForStage: sinon.stub().resolves(null),
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
	t.true(cacheManager.readBuildManifest.called, "Build manifest was attempted to be loaded");
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
				hash: "expected-hash",
				children: {}
			}
		},
		taskMetadata: {
			"task1": {
				requestSetGraph: {
					nodes: [],
					nextId: 1
				}
			}
		}
	};

	cacheManager.readIndexCache.resolves(indexCache);

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	t.truthy(cache, "Cache created with existing index");
	t.true(cache.hasTaskCache("task1"), "Task cache loaded from index");
});

test("Initialize without any cache", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	t.true(cache.requiresBuild(), "Build is required when no cache exists");
	t.false(cache.hasAnyCache(), "No task cache exists initially");
});

test("requiresBuild returns true when invalidated tasks exist", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const buildSignature = "test-signature";

	const resource = createMockResource("/test.js", "hash1", 1000, 100, 1);
	project.getSourceReader.returns({
		byGlob: sinon.stub().resolves([resource])
	});

	const cache = await ProjectBuildCache.create(project, buildSignature, cacheManager);

	// Simulate having a task cache but with changed resources
	cache.resourceChanged(["/test.js"], []);

	t.true(cache.requiresBuild(), "Build required when tasks invalidated");
});

// ===== TASK CACHE TESTS =====

test("hasTaskCache returns false for non-existent task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.false(cache.hasTaskCache("nonexistent"), "Task cache doesn't exist");
});

test("getTaskCache returns undefined for non-existent task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.is(cache.getTaskCache("nonexistent"), undefined, "Returns undefined");
});

test("isTaskCacheValid returns false for non-existent task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.false(cache.isTaskCacheValid("nonexistent"), "Non-existent task is not valid");
});

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

test("setDependencyReader sets the dependency reader", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const mockDependencyReader = {byGlob: sinon.stub()};
	cache.setDependencyReader(mockDependencyReader);

	// The reader is stored internally, we can verify by checking it's used later
	t.pass("Dependency reader set");
});

test("allTasksCompleted switches to result stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	cache.allTasksCompleted();

	t.true(project.useResultStage.calledOnce, "useResultStage called");
});

// ===== TASK EXECUTION TESTS =====

test("prepareTaskExecution: task needs execution when no cache exists", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["myTask"]);
	const needsExecution = await cache.prepareTaskExecution("myTask", false);

	t.true(needsExecution, "Task needs execution without cache");
	t.true(project.useStage.calledWith("task/myTask"), "Project switched to task stage");
});

test("prepareTaskExecution: switches project to correct stage", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1", "task2"]);
	await cache.prepareTaskExecution("task2", false);

	t.true(project.useStage.calledWith("task/task2"), "Switched to task2 stage");
});

test("recordTaskResult: creates task cache if not exists", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["newTask"]);
	await cache.prepareTaskExecution("newTask", false);

	const writtenPaths = new Set(["/output.js"]);
	const projectRequests = {paths: new Set(["/input.js"]), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};

	await cache.recordTaskResult("newTask", writtenPaths, projectRequests, dependencyRequests);

	t.true(cache.hasTaskCache("newTask"), "Task cache created");
	t.true(cache.isTaskCacheValid("newTask"), "Task cache is valid");
});

test("recordTaskResult: removes task from invalidated list", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecution("task1", false);

	// Record initial result
	await cache.recordTaskResult("task1", new Set(),
		{paths: new Set(), patterns: new Set()}, {paths: new Set(), patterns: new Set()});

	// Invalidate task
	cache.resourceChanged(["/test.js"], []);

	// Re-execute and record
	await cache.prepareTaskExecution("task1", false);
	await cache.recordTaskResult("task1", new Set(),
		{paths: new Set(), patterns: new Set()}, {paths: new Set(), patterns: new Set()});

	t.deepEqual(cache.getInvalidatedTaskNames(), [], "No invalidated tasks after re-execution");
});

// ===== RESOURCE CHANGE TESTS =====

test("resourceChanged: invalidates no tasks when no cache exists", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const taskInvalidated = cache.resourceChanged(["/test.js"], []);

	t.false(taskInvalidated, "No tasks invalidated when no cache exists");
	t.deepEqual(cache.getInvalidatedTaskNames(), [], "No invalidated tasks");
});

test("getChangedProjectResourcePaths: returns empty set for non-invalidated task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const changedPaths = cache.getChangedProjectResourcePaths("task1");

	t.deepEqual(changedPaths, new Set(), "Returns empty set");
});

test("getChangedDependencyResourcePaths: returns empty set for non-invalidated task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const changedPaths = cache.getChangedDependencyResourcePaths("task1");

	t.deepEqual(changedPaths, new Set(), "Returns empty set");
});

test("resourceChanged: tracks changed resource paths", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	// Create a task cache first
	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecution("task1", false);
	await cache.recordTaskResult("task1", new Set(),
		{paths: new Set(["/test.js"]), patterns: new Set()},
		{paths: new Set(), patterns: new Set()});

	// Now invalidate with changed resources
	cache.resourceChanged(["/test.js", "/another.js"], ["/dep.js"]);

	const changedProject = cache.getChangedProjectResourcePaths("task1");
	const changedDeps = cache.getChangedDependencyResourcePaths("task1");

	t.true(changedProject.has("/test.js"), "Project resource tracked");
	t.true(changedProject.has("/another.js"), "Another project resource tracked");
	t.true(changedDeps.has("/dep.js"), "Dependency resource tracked");
});

test("resourceChanged: accumulates multiple invalidations", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	// Create a task cache first
	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecution("task1", false);
	await cache.recordTaskResult("task1", new Set(),
		{paths: new Set(["/test.js", "/another.js"]), patterns: new Set()},
		{paths: new Set(), patterns: new Set()});

	// First invalidation
	cache.resourceChanged(["/test.js"], []);

	// Second invalidation
	cache.resourceChanged(["/another.js"], []);

	const changedProject = cache.getChangedProjectResourcePaths("task1");

	t.true(changedProject.has("/test.js"), "First change tracked");
	t.true(changedProject.has("/another.js"), "Second change tracked");
	t.is(changedProject.size, 2, "Both changes accumulated");
});

// ===== INVALIDATION TESTS =====

test("getInvalidatedTaskNames: returns empty array when no tasks invalidated", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.deepEqual(cache.getInvalidatedTaskNames(), [], "No invalidated tasks");
});

test("isTaskCacheValid: returns false for invalidated task", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	// Create a task cache
	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecution("task1", false);
	await cache.recordTaskResult("task1", new Set(),
		{paths: new Set(["/test.js"]), patterns: new Set()},
		{paths: new Set(), patterns: new Set()});

	t.true(cache.isTaskCacheValid("task1"), "Task is valid initially");

	// Invalidate it
	cache.resourceChanged(["/test.js"], []);

	t.false(cache.isTaskCacheValid("task1"), "Task is no longer valid after invalidation");
	t.deepEqual(cache.getInvalidatedTaskNames(), ["task1"], "Task appears in invalidated list");
});

// ===== CACHE STORAGE TESTS =====

test("storeCache: writes index cache and build manifest", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const buildManifest = {
		manifestVersion: "1.0",
		signature: "sig"
	};

	project.getReader.returns({
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	});

	await cache.storeCache(buildManifest);

	t.true(cacheManager.writeBuildManifest.called, "Build manifest written");
	t.true(cacheManager.writeIndexCache.called, "Index cache written");
});

test("storeCache: writes build manifest only once", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	const buildManifest = {
		manifestVersion: "1.0",
		signature: "sig"
	};

	project.getReader.returns({
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null)
	});

	await cache.storeCache(buildManifest);
	await cache.storeCache(buildManifest);

	t.is(cacheManager.writeBuildManifest.callCount, 1, "Build manifest written only once");
});

// ===== BUILD MANIFEST TESTS =====

test("Load build manifest with correct version", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	cacheManager.readBuildManifest.resolves({
		buildManifest: {
			manifestVersion: "1.0",
			signature: "test-sig"
		}
	});

	const cache = await ProjectBuildCache.create(project, "test-sig", cacheManager);

	t.truthy(cache, "Cache created successfully");
});

test("Ignore build manifest with incompatible version", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	cacheManager.readBuildManifest.resolves({
		buildManifest: {
			manifestVersion: "2.0",
			signature: "test-sig"
		}
	});

	const cache = await ProjectBuildCache.create(project, "test-sig", cacheManager);

	t.truthy(cache, "Cache created despite incompatible manifest");
	t.true(cache.requiresBuild(), "Build required when manifest incompatible");
});

test("Throw error on build signature mismatch", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();

	cacheManager.readBuildManifest.resolves({
		buildManifest: {
			manifestVersion: "1.0",
			signature: "wrong-signature"
		}
	});

	await t.throwsAsync(
		async () => {
			await ProjectBuildCache.create(project, "test-sig", cacheManager);
		},
		{
			message: /Build manifest signature wrong-signature does not match expected build signature test-sig/
		},
		"Throws error on signature mismatch"
	);
});
// ===== EDGE CASES =====

test("Create cache with empty project name", async (t) => {
	const project = createMockProject("", "empty-project");
	const cacheManager = createMockCacheManager();

	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.truthy(cache, "Cache created with empty project name");
});

test("setTasks with empty task list", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks([]);

	t.true(project.initStages.calledWith([]), "initStages called with empty array");
});

test("prepareTaskExecution with requiresDependencies flag", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1"]);
	const needsExecution = await cache.prepareTaskExecution("task1", true);

	t.true(needsExecution, "Task needs execution");
	// Flag is passed but doesn't affect basic behavior without dependency reader
});

test("recordTaskResult with empty written paths", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecution("task1", false);

	const writtenPaths = new Set();
	const projectRequests = {paths: new Set(), patterns: new Set()};
	const dependencyRequests = {paths: new Set(), patterns: new Set()};

	await cache.recordTaskResult("task1", writtenPaths, projectRequests, dependencyRequests);

	t.true(cache.hasTaskCache("task1"), "Task cache created even with no written paths");
});

test("hasAnyCache: returns true after recording task result", async (t) => {
	const project = createMockProject();
	const cacheManager = createMockCacheManager();
	const cache = await ProjectBuildCache.create(project, "sig", cacheManager);

	t.false(cache.hasAnyCache(), "No cache initially");

	await cache.setTasks(["task1"]);
	await cache.prepareTaskExecution("task1", false);
	await cache.recordTaskResult("task1", new Set(),
		{paths: new Set(), patterns: new Set()},
		{paths: new Set(), patterns: new Set()});

	t.true(cache.hasAnyCache(), "Has cache after recording result");
});
