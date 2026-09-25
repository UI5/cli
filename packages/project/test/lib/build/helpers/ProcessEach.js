import test from "ava";
import ProcessEach from "../../../../lib/build/helpers/ProcessEach.js";

function createResource(resourcePath, content = resourcePath) {
	return {
		getPath: () => resourcePath,
		getIntegrity: async () => `sha256-${content}`,
		getString: async () => content,
	};
}

function createWorkspace(initial = []) {
	const store = new Map(initial.map((res) => [res.getPath(), res]));
	return {
		getName: () => "workspace",
		byGlob: async () => [...store.values()],
		byPath: async (virPath) => store.get(virPath) ?? null,
		write: async (resource) => {
			store.set(resource.getPath(), resource);
		},
		store,
	};
}

function createDependencies(initial = []) {
	const store = new Map(initial.map((res) => [res.getPath(), res]));
	return {
		getName: () => "dependencies",
		byGlob: async () => [...store.values()],
		byPath: async (virPath) => store.get(virPath) ?? null,
	};
}

// An in-memory stand-in for the CAS-backed return value store the ProjectBuildCache provides. It keeps
// content by integrity so store() and a later restore() round-trip the exact bytes, exactly as the real
// SQLite CAS does across two builds.
function createReturnValueStore() {
	const cas = new Map();
	return {
		cas,
		store: async (resources) => Promise.all(resources.map(async (res) => {
			const integrity = await res.getIntegrity();
			cas.set(integrity, await res.getString());
			return {path: res.getPath(), integrity};
		})),
		restore: ({path, integrity}) => ({
			getPath: () => path,
			getIntegrity: async () => integrity,
			getString: async () => cas.get(integrity),
			restored: true,
		}),
	};
}

test("Full build runs every step and records reads, writes and requests", async (t) => {
	const workspace = createWorkspace();
	const dependencies = createDependencies([createResource("/dep/marker")]);
	const processEach = new ProcessEach({workspace, dependencies, taskUtil: {}});

	const keyA = createResource("/a.js");
	const keyB = createResource("/b.js");

	const results = await processEach.run([keyA, keyB], async (key, {workspace, dependencies}) => {
		await dependencies.byPath("/dep/marker");
		const out = createResource(`${key.getPath()}.out`);
		await workspace.write(out);
		return out;
	});

	t.is(results.length, 2, "One result per key");
	t.true(workspace.store.has("/a.js.out"), "First step's output was written");
	t.true(workspace.store.has("/b.js.out"), "Second step's output was written");

	const invocationData = processEach.getInvocationData();
	t.is(invocationData.size, 2, "Invocation data recorded per key");

	const requests = processEach.getResourceRequests();
	t.deepEqual(requests.dependencies.paths.sort(), ["/dep/marker", "/dep/marker"],
		"Dependency reads folded into the request set (once per step)");
});

test("Sequential mode makes a step's write visible to the next step", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	let secondStepSawFirstWrite = false;
	await processEach.run(["first", "second"], async (key, {workspace}) => {
		if (key === "first") {
			await workspace.write(createResource("/shared.js"));
		} else {
			secondStepSawFirstWrite = !!(await workspace.byPath("/shared.js"));
		}
	}, false);

	t.true(secondStepSawFirstWrite, "Second step read the first step's write");
});

test("Concurrent mode buffers writes and flushes them in key order", async (t) => {
	const workspace = createWorkspace();
	const writeOrder = [];
	const originalWrite = workspace.write;
	workspace.write = async (resource) => {
		writeOrder.push(resource.getPath());
		return originalWrite(resource);
	};
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	await processEach.run(["a", "b", "c"], async (key, {workspace}) => {
		// Reverse the natural completion order so the key-order flush is observable.
		if (key === "a") {
			await new Promise((resolve) => setTimeout(resolve, 15));
		}
		await workspace.write(createResource(`/${key}.out`));
	}, true);

	t.deepEqual(writeOrder, ["/a.out", "/b.out", "/c.out"],
		"Buffered writes flushed in key order regardless of completion order");
});

test("Concurrent steps writing the same path throw", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	await t.throwsAsync(processEach.run(["a", "b"], async (key, {workspace}) => {
		await workspace.write(createResource("/same.js"));
	}, true), {message: /concurrent steps must not write the same resource path \/same\.js/});
});

test("Delta build runs only steps whose reads intersect the changed paths", async (t) => {
	const workspace = createWorkspace();
	const dependencies = createDependencies();
	const previousInvocationData = new Map([
		["string:a", {reads: ["/in/a"], dependencyReads: [], writes: ["/out/a"]}],
		["string:b", {reads: ["/in/b"], dependencyReads: [], writes: ["/out/b"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({
		workspace, dependencies, taskUtil: {}, cacheInfo, previousInvocationData,
	});

	const ran = [];
	await processEach.run(["a", "b"], async (key) => {
		ran.push(key);
	});

	t.deepEqual(ran, ["a"], "Only the step whose recorded read changed re-ran");
});

test("Delta build runs a new key", async (t) => {
	const workspace = createWorkspace();
	const previousInvocationData = new Map([
		["string:a", {reads: ["/in/a"], dependencyReads: [], writes: ["/out/a"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	const ran = [];
	await processEach.run(["a", "new"], async (key) => {
		ran.push(key);
	});

	t.deepEqual(ran, ["new"], "Only the previously-unseen key ran");
});

test("Stale outputs cover removed keys and a re-run step's dropped write", async (t) => {
	const workspace = createWorkspace();
	const previousInvocationData = new Map([
		["string:a", {reads: ["/in/a"], dependencyReads: [], writes: ["/out/a1", "/out/a2"]}],
		["string:b", {reads: ["/in/b"], dependencyReads: [], writes: ["/out/b"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	// Only key "a" survives this build and, on re-run, writes only /out/a1 (dropping /out/a2). Key "b"
	// is gone entirely.
	await processEach.run(["a"], async (key, {workspace}) => {
		await workspace.write(createResource("/out/a1"));
	});

	t.deepEqual(processEach.getStaleOutputs().sort(), ["/out/a2", "/out/b"],
		"Dropped write of a re-run step and all outputs of a removed key are stale");
});

test("A resource key is identified by path and integrity", async (t) => {
	const workspace = createWorkspace();
	// Same path, changed content -> different integrity -> different key identity.
	const previousInvocationData = new Map([
		["resource:/x.js\u0000sha256-old", {reads: [], dependencyReads: [], writes: ["/x.js.out"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	const changedKey = createResource("/x.js", "new");
	const ran = [];
	await processEach.run([changedKey], async (key) => {
		ran.push(key.getPath());
	});

	t.deepEqual(ran, ["/x.js"], "Changed content yields a new key identity, so the step re-runs");
	t.deepEqual(processEach.getStaleOutputs(), ["/x.js.out"],
		"The previous integrity's output is stale (not re-written by the new key)");
});

test("Two resources with identical content are distinct keys", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	// Same content (same integrity), different paths: keying on integrity alone would collapse them
	// and lose one's output. Path plus integrity keeps them distinct.
	const one = createResource("/one/library.source.less", "identical");
	const two = createResource("/two/library.source.less", "identical");
	await processEach.run([one, two], async (key, {workspace}) => {
		await workspace.write(createResource(`${key.getPath()}.css`));
	});

	t.is(processEach.getInvocationData().size, 2, "Two same-content resources record two invocations");
	t.true(workspace.store.has("/one/library.source.less.css") && workspace.store.has("/two/library.source.less.css"),
		"Both outputs written");
});

test("Keys must be resources or strings", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	await t.throwsAsync(processEach.run([{notAKey: true}], async () => {}),
		{message: /keys must be resources or strings/});
});

test("Returned resources are handed back and stored in the CAS", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	const results = await processEach.run(["a", "b"], async (key, {workspace}) => {
		const out = createResource(`/out/${key}`, `content-${key}`);
		await workspace.write(out);
		return out;
	});

	t.is(results.length, 2, "One result per key");
	t.is(await results[0].getString(), "content-a", "First step's returned resource handed back");
	t.is(await results[1].getString(), "content-b", "Second step's returned resource handed back");
	t.deepEqual([...returnValueStore.cas.keys()].sort(), ["sha256-content-a", "sha256-content-b"],
		"Returned content stored in the CAS by integrity");

	const invocationData = processEach.getInvocationData();
	t.deepEqual(invocationData.get("string:a").returns,
		{isArray: false, items: [{path: "/out/a", integrity: "sha256-content-a"}]},
		"Single-resource return recorded as a non-array descriptor");
});

test("A step may return an array of resources", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	const results = await processEach.run(["a"], async (key) => {
		return [createResource(`/out/${key}.1`, "one"), createResource(`/out/${key}.2`, "two")];
	});

	t.is(results[0].length, 2, "Array return handed back as an array");
	t.deepEqual(await Promise.all(results[0].map((r) => r.getString())), ["one", "two"],
		"Both returned resources handed back in order");
	t.true(processEach.getInvocationData().get("string:a").returns.isArray,
		"Array return recorded as an array descriptor");
});

test("A step returning nothing has an undefined result and a null return descriptor", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	const results = await processEach.run(["a"], async () => {
		// Writes only, returns nothing.
	});

	t.is(results[0], undefined, "Result slot is undefined when a step returns nothing");
	t.is(processEach.getInvocationData().get("string:a").returns, null,
		"No return descriptor recorded for a step that returned nothing");
	t.is(returnValueStore.cas.size, 0, "Nothing stored in the CAS");
});

test("Returning a non-resource throws", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	await t.throwsAsync(processEach.run(["a"], async () => 42),
		{message: /may return only resources or an array of resources; got a number/});
	await t.throwsAsync(processEach.run(["a"], async () => [createResource("/ok"), {}]),
		{message: /array entry 1 is a plain object/});
});

test("A cached step's returned resource is rebuilt from the CAS without re-running", async (t) => {
	const returnValueStore = createReturnValueStore();

	// Build 1 (full build): every step runs and its return is stored in the CAS.
	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: {}, returnValueStore});
	await build1.run(["a", "b"], async (key) => createResource(`/out/${key}`, `content-${key}`));
	const previousInvocationData = build1.getInvocationData();

	// Build 2 (unchanged rebuild): no changed paths, so no step re-runs. Every result comes from the CAS.
	const ran = [];
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo, previousInvocationData, returnValueStore,
	});
	const results = await build2.run(["a", "b"], async (key) => {
		ran.push(key);
		return createResource(`/out/${key}`, `content-${key}`);
	});

	t.deepEqual(ran, [], "No step re-ran on the unchanged rebuild");
	t.is(await results[0].getString(), "content-a", "First result rebuilt from the CAS");
	t.is(await results[1].getString(), "content-b", "Second result rebuilt from the CAS");
	t.true(results[0].restored && results[1].restored, "Both results are the store's restored resources");
});

test("Delta build re-runs the changed step fresh and restores the unchanged step from the CAS", async (t) => {
	const returnValueStore = createReturnValueStore();

	// Build 1: record reads and returns for two string keys.
	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: {}, returnValueStore});
	await build1.run(["a", "b"], async (key, {workspace}) => {
		await workspace.byPath(`/in/${key}`); // recorded read, so a change to it re-runs this step
		return createResource(`/out/${key}`, `content-${key}`);
	});
	const previousInvocationData = build1.getInvocationData();

	// Build 2: only /in/a changed, so step "a" re-runs (fresh) and step "b" is restored from the CAS.
	const ran = [];
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo, previousInvocationData, returnValueStore,
	});
	const results = await build2.run(["a", "b"], async (key, {workspace}) => {
		ran.push(key);
		await workspace.byPath(`/in/${key}`);
		return createResource(`/out/${key}`, `fresh-${key}`);
	});

	t.deepEqual(ran, ["a"], "Only the step whose recorded read changed re-ran");
	t.is(await results[0].getString(), "fresh-a", "Re-run step's fresh return handed back");
	t.is(results[0].restored, undefined, "Re-run step's result is the fresh resource, not a restore");
	t.is(await results[1].getString(), "content-b", "Cached step's return rebuilt from the CAS");
	t.true(results[1].restored, "Cached step's result is the store's restored resource");
});

test("A resource written and returned at the same path is stored and restored independently", async (t) => {
	const returnValueStore = createReturnValueStore();

	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: {}, returnValueStore});
	await build1.run(["a"], async (key, {workspace}) => {
		const out = createResource(`/out/${key}`, `content-${key}`);
		await workspace.write(out);
		return out; // same path as the written output
	});
	const invocation = build1.getInvocationData().get("string:a");
	t.deepEqual(invocation.writes, ["/out/a"], "Output write recorded");
	t.is(invocation.returns.items[0].path, "/out/a", "Return descriptor recorded for the same path");

	// The return is rebuilt from the CAS on a cached rebuild, independent of the workspace output.
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo,
		previousInvocationData: build1.getInvocationData(), returnValueStore,
	});
	const results = await build2.run(["a"], async () => t.fail("Step must not re-run"));
	t.is(await results[0].getString(), "content-a", "Returned resource rebuilt from the CAS");
});

test("Restoring a cached return without a store throws a clear error", async (t) => {
	const previousInvocationData = new Map([
		["string:a", {
			reads: [], dependencyReads: [], writes: [],
			returns: {isArray: false, items: [{path: "/out/a", integrity: "sha256-x"}]},
		}],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo, previousInvocationData,
	});

	await t.throwsAsync(processEach.run(["a"], async () => {}),
		{message: /cannot restore a cached step's returned resources without a return value store/});
});
