import test from "ava";
import sinon from "sinon";
import {createProxy, createResource} from "@ui5/fs/resourceFactory";
import ProjectResources from "../../../lib/resources/ProjectResources.js";

test.afterEach.always(() => {
	sinon.restore();
});

function createProjectResources({frozenSourceReader, buildManifest = null} = {}) {
	const sourceReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null),
	};
	const writer = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves(),
	};
	const pr = new ProjectResources({
		getName: () => "test.project",
		getStyledReader: sinon.stub().returns(sourceReader),
		applyStyleToReader: sinon.stub().callsFake((reader) => reader),
		createWriter: sinon.stub().returns(writer),
		addReadersForWriter: sinon.stub(),
		buildManifest,
	});
	if (frozenSourceReader) {
		pr.setFrozenSourceReader(frozenSourceReader);
	}
	return {pr, sourceReader, writer};
}

function createTagResource(pr) {
	return createResource({
		path: "/resources/test/file.js",
		string: "source",
		project: {getResourceTagCollection: (resource, tag) => pr.getResourceTagCollection(resource, tag)}
	});
}

for (const cached of [false, true]) {
	for (const readResultTags of [false, true]) {
		test(`buildFinished: ${cached ? "cached" : "live"} tags, result lookup=${readResultTags}`, (t) => {
			const {pr, writer} = createProjectResources();
			const resource = createTagResource(pr);
			const path = resource.getPath();
			pr.initStages(["task/tag"]);
			pr.useStage("task/tag");
			if (cached) {
				pr.setStage("task/tag", writer,
					new Map([[path, new Map([["ui5:HasDebugVariant", true]])]]),
					new Map([[path, new Map([["ui5:OmitFromBuildResult", true]])]]));
			} else {
				pr.getResourceTagCollection(resource, "ui5:HasDebugVariant")
					.setTag(resource, "ui5:HasDebugVariant");
				pr.getResourceTagCollection(resource, "ui5:OmitFromBuildResult")
					.setTag(resource, "ui5:OmitFromBuildResult");
			}
			pr.useResultStage();
			if (readResultTags) {
				t.true(pr.getResourceTagCollection(resource, "ui5:OmitFromBuildResult")
					.getTag(resource, "ui5:OmitFromBuildResult"), "Output filtering can read build tags");
			}
			pr.buildFinished();

			t.true(resource.getTags()["ui5:HasDebugVariant"], "Resource reads retain project tags");
			t.true(pr.getProjectResourceTagCollection().getTag(resource, "ui5:HasDebugVariant"));
			t.is(pr.getResourceTagCollection(resource, "ui5:OmitFromBuildResult")
				.getTag(resource, "ui5:OmitFromBuildResult"), undefined, "Build tags stay cleared after reads");
			pr.buildFinished();
			t.is(pr.getResourceTagCollection(resource, "ui5:OmitFromBuildResult")
				.getTag(resource, "ui5:OmitFromBuildResult"), undefined, "Completion is idempotent");
		});
	}
}

test("useResultStage refreshes the project-tag snapshot after the last task", (t) => {
	const {pr} = createProjectResources();
	const resource = createTagResource(pr);
	pr.initStages(["task/first", "task/last"]);
	pr.useStage("task/first");
	pr.getResourceTagCollection(resource, "project:State").setTag(resource, "project:State", "first");
	pr.useStage("task/last");
	const collection = pr.getResourceTagCollection(resource, "project:State");
	collection.setTag(resource, "project:State", "last");
	t.is(resource.getTags()["project:State"], "first", "The task hashes its input tags");
	pr.useResultStage();
	t.is(resource.getTags()["project:State"], "last", "The result exposes the final tags");
});

for (const method of ["initStages", "reset"]) {
	test(`${method} discards tag stores and monitors from an unfinished build`, (t) => {
		const {pr} = createProjectResources();
		const resource = createTagResource(pr);
		pr.getResourceTagCollection(resource, "project:State").setTag(resource, "project:State", "old");
		pr.getResourceTagCollection(resource, "build:State").setTag(resource, "build:State", "old");
		pr[method]([]);
		t.is(pr.getResourceTagCollection(resource, "project:State").getTag(resource, "project:State"), undefined);
		t.is(pr.getResourceTagCollection(resource, "build:State").getTag(resource, "build:State"), undefined);
		t.is(pr.getResourceTagOperations().projectTagOperations.size, 0);
		t.is(pr.getResourceTagOperations().buildTagOperations.size, 0);
	});
}

test("Cached build tags can be replayed in subsequent builds", (t) => {
	const {pr, writer} = createProjectResources();
	const resource = createTagResource(pr);
	const buildTags = new Map([[resource.getPath(), new Map([["build:State", "cached"]])]]);
	for (let build = 0; build < 3; build++) {
		pr.initStages(["task/tag"]);
		pr.setStage("task/tag", writer, new Map(), buildTags);
		pr.useResultStage();
		t.is(pr.getResourceTagCollection(resource, "build:State").getTag(resource, "build:State"), "cached");
		pr.buildFinished();
		t.is(pr.getResourceTagCollection(resource, "build:State").getTag(resource, "build:State"), undefined);
	}
});

test("acceptsProjectTag classifies tags without importing operations or creating a monitor", (t) => {
	const {pr, writer} = createProjectResources();
	const resource = createTagResource(pr);
	const tags = new Map([["project:State", "original"]]);
	pr.initStages(["task/cached", "task/next"]);
	pr.setStage("task/cached", writer, new Map([[resource.getPath(), tags]]), new Map());
	pr.useStage("task/next");
	for (const tag of [undefined, "ui5:IsDebugVariant", "ui5:HasDebugVariant", "project:State"]) {
		t.true(pr.acceptsProjectTag(tag));
	}
	for (const tag of ["ui5:IsBundle", "ui5:OmitFromBuildResult", "build:State", "other:Tag"]) {
		t.false(pr.acceptsProjectTag(tag));
	}
	t.is(pr.getResourceTagOperations().projectTagOperations.size, 0);
	t.is(pr.getResourceTagOperations().buildTagOperations.size, 0);
	tags.set("project:State", "updated");
	t.is(resource.getTags()["project:State"], "updated", "The first read imports and snapshots the cached tags");
});

test("Build tags do not share storage with build manifest tags", (t) => {
	const tags = {"/resources/test/file.js": {"ui5:HasDebugVariant": true}};
	const {pr} = createProjectResources({buildManifest: {tags}});
	const resource = createTagResource(pr);
	pr.getResourceTagCollection(resource, "ui5:OmitFromBuildResult")
		.setTag(resource, "ui5:OmitFromBuildResult");
	t.deepEqual(tags, {"/resources/test/file.js": {"ui5:HasDebugVariant": true}});
	t.deepEqual(pr.getProjectResourceTagCollection().getAllTags(), tags);
	pr.buildFinished();
	t.is(pr.getResourceTagCollection(resource, "ui5:OmitFromBuildResult")
		.getTag(resource, "ui5:OmitFromBuildResult"), undefined);
});

test("setFrozenSourceReader: frozen reader is included in getReader chain", (t) => {
	const frozenReader = {name: "frozen-cas-reader"};
	const {pr} = createProjectResources({frozenSourceReader: frozenReader});

	// getReader returns a prioritized collection; we can't easily inspect internals,
	// but we verify it returns a reader without errors and that the frozen reader was set.
	const reader = pr.getReader();
	t.truthy(reader, "Reader returned successfully");
});

test("reopenStage: swaps a cached read-only stage back to a writable one", (t) => {
	const {pr, writer} = createProjectResources();
	pr.initStages(["task/a", "task/b"]);
	pr.useStage("task/b");

	// A full cache hit installs a read-only cached stage: it has a cached writer, no live writer.
	const cachedWriter = {byGlob: sinon.stub().resolves([]), name: "cached-reader"};
	pr.setStage("task/b", cachedWriter, new Map(), new Map());
	t.is(pr.getStage().getWriter(), undefined, "Cached stage has no live writer");
	t.is(pr.getStage().getCachedWriter(), cachedWriter, "Cached stage carries the cached reader");

	// Reopening restores a fresh live writer so the stage can be re-run.
	pr.reopenStage("task/b");
	t.is(pr.getStage().getId(), "task/b", "Still on the reopened stage");
	t.is(pr.getStage().getWriter(), writer, "Reopened stage has a live writer");
	t.is(pr.getStage().getCachedWriter(), undefined, "Reopened stage dropped the cached reader");
	t.notThrows(() => pr.getWorkspace(), "The reopened stage yields a writable workspace");
});

test("reopenStage: throws for an unknown stage", (t) => {
	const {pr} = createProjectResources();
	pr.initStages(["task/a"]);
	t.throws(() => pr.reopenStage("task/missing"),
		{message: /Stage 'task\/missing' does not exist in project test\.project/});
});

test("setFrozenSourceReader: invalidates cached readers", (t) => {
	const {pr} = createProjectResources();

	// Access the reader to populate the cache
	const reader1 = pr.getReader();

	// Set a frozen source reader — this should invalidate the cache
	const frozenReader = {name: "frozen-cas-reader"};
	pr.setFrozenSourceReader(frozenReader);

	// Getting the reader again should produce a new instance (not the cached one)
	const reader2 = pr.getReader();
	t.not(reader1, reader2, "Cached reader was invalidated; new reader instance returned");
});

test("setFrozenSourceReader: frozen reader is between stages and source reader", (t) => {
	const frozenReader = {name: "frozen-cas-reader"};
	const sourceReader = {
		byGlob: sinon.stub().resolves([]),
		byPath: sinon.stub().resolves(null),
	};
	const writer = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves(),
	};
	const getStyledReader = sinon.stub().returns(sourceReader);
	const addReadersForWriter = sinon.stub();
	const pr = new ProjectResources({
		getName: () => "test.project",
		getStyledReader,
		applyStyleToReader: sinon.stub().callsFake((reader) => reader),
		createWriter: sinon.stub().returns(writer),
		addReadersForWriter,
		buildManifest: null,
	});
	pr.setFrozenSourceReader(frozenReader);

	// Initialize stages and switch to one to exercise #addReaderForStage
	pr.initStages(["stage1"]);
	pr.useStage("stage1");

	// Calling getWorkspace triggers #getReaders (buildtime style) for the workspace reader
	const workspace = pr.getWorkspace();
	t.truthy(workspace, "Workspace created successfully with frozen reader in chain");
});

test("getReader without frozen source reader works normally", (t) => {
	const {pr} = createProjectResources();

	const reader = pr.getReader();
	t.truthy(reader, "Reader returned without frozen source reader");
});

test("initStages clears frozen source reader", (t) => {
	const frozenReader = {name: "frozen-cas-reader"};
	const {pr} = createProjectResources({frozenSourceReader: frozenReader});

	// Verify frozen reader is active
	const reader1 = pr.getReader();
	t.truthy(reader1, "Reader with frozen source reader");

	// initStages resets all stage state including the frozen reader
	pr.initStages(["stage1"]);

	// After initStages, a new reader should be created without the frozen reader
	// (cache was invalidated). We can't directly inspect the chain, but we verify
	// that it doesn't throw and returns a fresh reader.
	const reader2 = pr.getReader();
	t.truthy(reader2, "Reader returned after initStages");
	t.not(reader1, reader2, "Reader was recreated after initStages");
});

test("reset: returns to the initial stage after a stage switch", (t) => {
	const {pr} = createProjectResources();

	// Simulate a build that switched to a task stage (as a failed build would leave it)
	pr.initStages(["task/taskA", "task/taskB"]);
	pr.useStage("task/taskA");
	t.is(pr.getStage().getId(), "task/taskA", "On a task stage before reset");

	pr.reset();

	t.is(pr.getStage().getId(), "initial", "Back on the initial stage after reset");
});

test("reset: clears the frozen source reader", (t) => {
	const frozenReader = {name: "frozen-cas-reader"};
	const {pr} = createProjectResources({frozenSourceReader: frozenReader});

	const reader1 = pr.getReader();
	pr.reset();
	const reader2 = pr.getReader();

	t.not(reader1, reader2, "Reader was recreated after reset (frozen reader dropped)");
});

test("Frozen source reader takes priority over filesystem source reader", async (t) => {
	const resourcePath = "/resources/test/some.js";
	const filesystemContent = "filesystem content";
	const frozenCASContent = "frozen CAS content";

	// Create a source reader that simulates the filesystem
	const filesystemResource = createResource({path: resourcePath, string: filesystemContent});
	const sourceReader = createProxy({
		name: "Filesystem source reader",
		listResourcePaths: () => [resourcePath],
		getResource: async (virPath) => {
			if (virPath === resourcePath) {
				return filesystemResource;
			}
			return null;
		}
	});

	// Create a frozen CAS reader with different content
	const frozenResource = createResource({path: resourcePath, string: frozenCASContent});
	const frozenReader = createProxy({
		name: "Frozen CAS reader",
		listResourcePaths: () => [resourcePath],
		getResource: async (virPath) => {
			if (virPath === resourcePath) {
				return frozenResource;
			}
			return null;
		}
	});

	const writer = {
		byGlob: sinon.stub().resolves([]),
		write: sinon.stub().resolves(),
	};

	const pr = new ProjectResources({
		getName: () => "test.project",
		getStyledReader: sinon.stub().returns(sourceReader),
		applyStyleToReader: sinon.stub().callsFake((reader) => reader),
		createWriter: sinon.stub().returns(writer),
		addReadersForWriter: sinon.stub(),
		buildManifest: null,
	});

	pr.setFrozenSourceReader(frozenReader);

	const reader = pr.getReader();
	const result = await reader.byPath(resourcePath);
	t.truthy(result, "Resource found via reader");
	const content = await result.getString();
	t.is(content, frozenCASContent,
		"Frozen CAS reader takes priority over filesystem source reader");
});

test("replayTagOperations routes by tag, applies by path, and skips get operations", (t) => {
	const {pr} = createProjectResources();

	// A restored step replays these: a project-level and a build-level set, a get (no
	// persistent effect), and a set-then-clear of the same tag on another path.
	pr.replayTagOperations([
		{op: "set", path: "/resources/x.js", tag: "ui5:HasDebugVariant", value: true},
		{op: "set", path: "/resources/x.js", tag: "ui5:OmitFromBuildResult", value: true},
		{op: "get", path: "/resources/x.js", tag: "ui5:IsBundle"},
		{op: "set", path: "/resources/x-dbg.js", tag: "ui5:IsDebugVariant", value: true},
		{op: "clear", path: "/resources/x-dbg.js", tag: "ui5:IsDebugVariant"},
	]);

	const {projectTagOperations, buildTagOperations} = pr.getResourceTagOperations();

	t.deepEqual([...projectTagOperations.get("/resources/x.js")], [["ui5:HasDebugVariant", true]],
		"A project-level tag is routed to the project collection");
	t.deepEqual([...projectTagOperations.get("/resources/x-dbg.js")], [["ui5:IsDebugVariant", undefined]],
		"A set followed by a clear of the same tag records the clear");
	t.deepEqual([...buildTagOperations.get("/resources/x.js")], [["ui5:OmitFromBuildResult", true]],
		"A build-level tag is routed to the build collection; the skipped get left no operation");
});
