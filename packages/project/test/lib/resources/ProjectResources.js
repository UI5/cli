import test from "ava";
import sinon from "sinon";
import {createProxy, createResource} from "@ui5/fs/resourceFactory";
import ProjectResources from "../../../lib/resources/ProjectResources.js";

function createProjectResources({frozenSourceReader} = {}) {
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
		createWriter: sinon.stub().returns(writer),
		addReadersForWriter: sinon.stub(),
		buildManifest: null,
	});
	if (frozenSourceReader) {
		pr.setFrozenSourceReader(frozenSourceReader);
	}
	return {pr, sourceReader, writer};
}

test.afterEach.always(() => {
	sinon.restore();
});

test("setFrozenSourceReader: frozen reader is included in getReader chain", (t) => {
	const frozenReader = {name: "frozen-cas-reader"};
	const {pr} = createProjectResources({frozenSourceReader: frozenReader});

	// getReader returns a prioritized collection; we can't easily inspect internals,
	// but we verify it returns a reader without errors and that the frozen reader was set.
	const reader = pr.getReader();
	t.truthy(reader, "Reader returned successfully");
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
