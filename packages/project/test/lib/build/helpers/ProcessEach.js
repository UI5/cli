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

// An in-memory stand-in for the ProjectBuildContext's taskUtil. ProcessEach wraps this in a real
// per-step MonitoredTaskUtil, so these methods are what the step's non-resource-input and tag recording
// observes. `env` backs getEnv; tags are stored by path so setTag/getTag/clearTag round-trip.
function createTaskUtil({env = {}} = {}) {
	const tags = new Map();
	return {
		getEnv: (name) => env[name],
		getTime: (granularity) => `time-${granularity}`,
		isRootProject: () => true,
		setTag: (resource, tag, value = true) => {
			const path = resource.getPath();
			if (!tags.has(path)) {
				tags.set(path, new Map());
			}
			tags.get(path).set(tag, value);
		},
		getTag: (resource, tag) => tags.get(resource.getPath())?.get(tag),
		clearTag: (resource, tag) => tags.get(resource.getPath())?.delete(tag),
		tags,
	};
}

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

// Most tests exercise a single step group. GROUP names it, `inv` reaches that group's per-key map, and
// `prev` wraps a flat [keyId, entry] list as the nested per-group previousInvocationData the driver loads.
const GROUP = "g";
const inv = (processEach) => processEach.getInvocationData().get(GROUP);
const prev = (entries) => new Map([[GROUP, new Map(entries)]]);

test("Full build runs every step and records reads, writes and requests", async (t) => {
	const workspace = createWorkspace();
	const dependencies = createDependencies([createResource("/dep/marker")]);
	const processEach = new ProcessEach({workspace, dependencies, taskUtil: {}});

	const keyA = createResource("/a.js");
	const keyB = createResource("/b.js");

	const results = await processEach.run(GROUP, [keyA, keyB], async (key, {workspace, dependencies}) => {
		await dependencies.byPath("/dep/marker");
		const out = createResource(`${key.getPath()}.out`);
		await workspace.write(out);
		return out;
	});

	t.is(results.length, 2, "One result per key");
	t.true(workspace.store.has("/a.js.out"), "First step's output was written");
	t.true(workspace.store.has("/b.js.out"), "Second step's output was written");

	t.is(inv(processEach).size, 2, "Invocation data recorded per key");

	const requests = processEach.getResourceRequests();
	t.deepEqual(requests.dependencies.paths.sort(), ["/dep/marker", "/dep/marker"],
		"Dependency reads folded into the request set (once per step)");
});

test("Sequential mode makes a step's write visible to the next step", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	let secondStepSawFirstWrite = false;
	await processEach.run(GROUP, ["first", "second"], async (key, {workspace}) => {
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

	await processEach.run(GROUP, ["a", "b", "c"], async (key, {workspace}) => {
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

	await t.throwsAsync(processEach.run(GROUP, ["a", "b"], async (key, {workspace}) => {
		await workspace.write(createResource("/same.js"));
	}, true), {message: /concurrent steps must not write the same resource path \/same\.js/});
});

test("The group argument must be a non-empty string", async (t) => {
	const processEach = new ProcessEach({workspace: createWorkspace(), taskUtil: {}});

	await t.throwsAsync(processEach.run(undefined, ["a"], async () => {}),
		{message: /first argument must be a non-empty string naming the step group/});
	await t.throwsAsync(processEach.run("", ["a"], async () => {}),
		{message: /first argument must be a non-empty string naming the step group/});
});

test("Running the same group twice for one task throws", async (t) => {
	const processEach = new ProcessEach({workspace: createWorkspace(), taskUtil: {}});

	await processEach.run("dup", ["a"], async () => {});
	await t.throwsAsync(processEach.run("dup", ["b"], async () => {}),
		{message: /group "dup" was already run for this task; each call must use a distinct group/});
});

test("Two groups record their per-key data under their own group name", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	await processEach.run("js", ["a.js"], async (key, {workspace}) => {
		await workspace.write(createResource(`/out/${key}`));
	});
	await processEach.run("css", ["a.css", "b.css"], async (key, {workspace}) => {
		await workspace.write(createResource(`/out/${key}`));
	});

	const data = processEach.getInvocationData();
	t.deepEqual([...data.keys()].sort(), ["css", "js"], "Each group is recorded under its own name");
	t.is(data.get("js").size, 1, "The js group recorded one key");
	t.is(data.get("css").size, 2, "The css group recorded two keys");
});

test("getResourceRequests and getInputRecording fold across all groups", async (t) => {
	const workspace = createWorkspace();
	const dependencies = createDependencies([createResource("/dep/m1"), createResource("/dep/m2")]);
	const processEach = new ProcessEach({
		workspace, dependencies, taskUtil: createTaskUtil({env: {A: "1", B: "2"}}),
	});

	await processEach.run("g1", ["a"], async (key, {dependencies, taskUtil}) => {
		await dependencies.byPath("/dep/m1");
		taskUtil.getEnv("A");
	});
	await processEach.run("g2", ["b"], async (key, {dependencies, taskUtil}) => {
		await dependencies.byPath("/dep/m2");
		taskUtil.getEnv("B");
	});

	t.deepEqual(processEach.getResourceRequests().dependencies.paths.sort(), ["/dep/m1", "/dep/m2"],
		"Dependency reads from both groups are folded into the request set");
	t.deepEqual(processEach.getInputRecording().sort((x, y) => x.name.localeCompare(y.name)), [
		{type: "env", name: "A", value: "1"},
		{type: "env", name: "B", value: "2"},
	], "Non-resource inputs from both groups are folded into the input recording");
});

test("Delta build runs only steps whose reads intersect the changed paths", async (t) => {
	const workspace = createWorkspace();
	const dependencies = createDependencies();
	const previousInvocationData = prev([
		["string:a", {reads: ["/in/a"], dependencyReads: [], writes: ["/out/a"]}],
		["string:b", {reads: ["/in/b"], dependencyReads: [], writes: ["/out/b"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({
		workspace, dependencies, taskUtil: {}, cacheInfo, previousInvocationData,
	});

	const ran = [];
	await processEach.run(GROUP, ["a", "b"], async (key) => {
		ran.push(key);
	});

	t.deepEqual(ran, ["a"], "Only the step whose recorded read changed re-ran");
});

test("Delta build runs a new key", async (t) => {
	const workspace = createWorkspace();
	const previousInvocationData = prev([
		["string:a", {reads: ["/in/a"], dependencyReads: [], writes: ["/out/a"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	const ran = [];
	await processEach.run(GROUP, ["a", "new"], async (key) => {
		ran.push(key);
	});

	t.deepEqual(ran, ["new"], "Only the previously-unseen key ran");
});

test("Stale outputs cover removed keys and a re-run step's dropped write", async (t) => {
	const workspace = createWorkspace();
	const previousInvocationData = prev([
		["string:a", {reads: ["/in/a"], dependencyReads: [], writes: ["/out/a1", "/out/a2"]}],
		["string:b", {reads: ["/in/b"], dependencyReads: [], writes: ["/out/b"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	// Only key "a" survives this build and, on re-run, writes only /out/a1 (dropping /out/a2). Key "b"
	// is gone entirely.
	await processEach.run(GROUP, ["a"], async (key, {workspace}) => {
		await workspace.write(createResource("/out/a1"));
	});

	t.deepEqual(processEach.getStaleOutputs().sort(), ["/out/a2", "/out/b"],
		"Dropped write of a re-run step and all outputs of a removed key are stale");
});

test("An output a group stopped producing is not stale if another group now produces it", async (t) => {
	const workspace = createWorkspace();
	// Previous build: group "a" produced /shared and /only-a for key "k"; group "b" produced nothing.
	const previousInvocationData = new Map([
		["a", new Map([["string:k", {reads: [], dependencyReads: [], writes: ["/shared", "/only-a"]}]])],
		["b", new Map()],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	// This build: group "a" no longer has key "k", so its two outputs would be stale; group "b" now
	// produces /shared. /shared must be rescued across groups, /only-a stays stale.
	await processEach.run("a", [], async () => {});
	await processEach.run("b", ["x"], async (key, {workspace}) => {
		await workspace.write(createResource("/shared"));
	});

	t.deepEqual(processEach.getStaleOutputs(), ["/only-a"],
		"A path another group now produces is rescued; the truly-dropped path stays stale");
});

test("A resource key is identified by path and integrity", async (t) => {
	const workspace = createWorkspace();
	// Same path, changed content -> different integrity -> different key identity.
	const previousInvocationData = prev([
		["resource:/x.js\u0000sha256-old", {reads: [], dependencyReads: [], writes: ["/x.js.out"]}],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({workspace, taskUtil: {}, cacheInfo, previousInvocationData});

	const changedKey = createResource("/x.js", "new");
	const ran = [];
	await processEach.run(GROUP, [changedKey], async (key) => {
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
	await processEach.run(GROUP, [one, two], async (key, {workspace}) => {
		await workspace.write(createResource(`${key.getPath()}.css`));
	});

	t.is(inv(processEach).size, 2, "Two same-content resources record two invocations");
	t.true(workspace.store.has("/one/library.source.less.css") && workspace.store.has("/two/library.source.less.css"),
		"Both outputs written");
});

test("Keys must be resources or strings", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: {}});

	await t.throwsAsync(processEach.run(GROUP, [{notAKey: true}], async () => {}),
		{message: /keys must be resources or strings/});
});

test("Returned resources are handed back and stored in the CAS", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	const results = await processEach.run(GROUP, ["a", "b"], async (key, {workspace}) => {
		const out = createResource(`/out/${key}`, `content-${key}`);
		await workspace.write(out);
		return out;
	});

	t.is(results.length, 2, "One result per key");
	t.is(await results[0].getString(), "content-a", "First step's returned resource handed back");
	t.is(await results[1].getString(), "content-b", "Second step's returned resource handed back");
	t.deepEqual([...returnValueStore.cas.keys()].sort(), ["sha256-content-a", "sha256-content-b"],
		"Returned content stored in the CAS by integrity");

	t.deepEqual(inv(processEach).get("string:a").returns,
		{isArray: false, items: [{path: "/out/a", integrity: "sha256-content-a"}]},
		"Single-resource return recorded as a non-array descriptor");
});

test("A step may return an array of resources", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	const results = await processEach.run(GROUP, ["a"], async (key) => {
		return [createResource(`/out/${key}.1`, "one"), createResource(`/out/${key}.2`, "two")];
	});

	t.is(results[0].length, 2, "Array return handed back as an array");
	t.deepEqual(await Promise.all(results[0].map((r) => r.getString())), ["one", "two"],
		"Both returned resources handed back in order");
	t.true(inv(processEach).get("string:a").returns.isArray,
		"Array return recorded as an array descriptor");
});

test("A step returning nothing has an undefined result and a null return descriptor", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	const results = await processEach.run(GROUP, ["a"], async () => {
		// Writes only, returns nothing.
	});

	t.is(results[0], undefined, "Result slot is undefined when a step returns nothing");
	t.is(inv(processEach).get("string:a").returns, null,
		"No return descriptor recorded for a step that returned nothing");
	t.is(returnValueStore.cas.size, 0, "Nothing stored in the CAS");
});

test("Returning a non-resource throws", async (t) => {
	const workspace = createWorkspace();
	const returnValueStore = createReturnValueStore();
	const processEach = new ProcessEach({workspace, taskUtil: {}, returnValueStore});

	await t.throwsAsync(processEach.run(GROUP, ["a"], async () => 42),
		{message: /may return only resources or an array of resources; got a number/});
	await t.throwsAsync(processEach.run("g2", ["a"], async () => [createResource("/ok"), {}]),
		{message: /array entry 1 is a plain object/});
});

test("A cached step's returned resource is rebuilt from the CAS without re-running", async (t) => {
	const returnValueStore = createReturnValueStore();

	// Build 1 (full build): every step runs and its return is stored in the CAS.
	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: {}, returnValueStore});
	await build1.run(GROUP, ["a", "b"], async (key) => createResource(`/out/${key}`, `content-${key}`));
	const previousInvocationData = build1.getInvocationData();

	// Build 2 (unchanged rebuild): no changed paths, so no step re-runs. Every result comes from the CAS.
	const ran = [];
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo, previousInvocationData, returnValueStore,
	});
	const results = await build2.run(GROUP, ["a", "b"], async (key) => {
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
	await build1.run(GROUP, ["a", "b"], async (key, {workspace}) => {
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
	const results = await build2.run(GROUP, ["a", "b"], async (key, {workspace}) => {
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
	await build1.run(GROUP, ["a"], async (key, {workspace}) => {
		const out = createResource(`/out/${key}`, `content-${key}`);
		await workspace.write(out);
		return out; // same path as the written output
	});
	const invocation = inv(build1).get("string:a");
	t.deepEqual(invocation.writes, ["/out/a"], "Output write recorded");
	t.is(invocation.returns.items[0].path, "/out/a", "Return descriptor recorded for the same path");

	// The return is rebuilt from the CAS on a cached rebuild, independent of the workspace output.
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo,
		previousInvocationData: build1.getInvocationData(), returnValueStore,
	});
	const results = await build2.run(GROUP, ["a"], async () => t.fail("Step must not re-run"));
	t.is(await results[0].getString(), "content-a", "Returned resource rebuilt from the CAS");
});

test("Restoring a cached return without a store throws a clear error", async (t) => {
	const previousInvocationData = prev([
		["string:a", {
			reads: [], dependencyReads: [], writes: [],
			returns: {isArray: false, items: [{path: "/out/a", integrity: "sha256-x"}]},
		}],
	]);
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const processEach = new ProcessEach({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo, previousInvocationData,
	});

	await t.throwsAsync(processEach.run(GROUP, ["a"], async () => {}),
		{message: /cannot restore a cached step's returned resources without a return value store/});
});

test("The per-step taskUtil records a step's non-resource inputs and tag operations", async (t) => {
	const workspace = createWorkspace();
	const processEach = new ProcessEach({workspace, taskUtil: createTaskUtil({env: {MODE: "dev"}})});

	await processEach.run(GROUP, ["a"], async (key, {taskUtil}) => {
		taskUtil.getEnv("MODE");
		taskUtil.setTag(createResource("/out/a"), "ui5:IsBundle", true);
	});

	const entry = inv(processEach).get("string:a");
	t.deepEqual(entry.inputs, [{type: "env", name: "MODE", value: "dev"}],
		"The step's getEnv read is attributed to the step");
	t.deepEqual(entry.tagOperations, [{op: "set", path: "/out/a", tag: "ui5:IsBundle", value: true}],
		"The step's setTag is attributed to the step");
});

test("Delta build re-runs only the step whose recorded non-resource input changed", async (t) => {
	const env = {A: "1", B: "1"};
	const resolveInputValue = (type, name) => (type === "env" ? env[name] : undefined);

	// Build 1: step "a" reads env A, step "b" reads env B.
	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: createTaskUtil({env})});
	await build1.run(GROUP, ["a", "b"], async (key, {taskUtil}) => {
		taskUtil.getEnv(key.toUpperCase());
	});
	const previousInvocationData = build1.getInvocationData();

	// Build 2: only env A changed. Neither step's resource reads changed, so selection turns on the
	// re-resolved input value alone.
	env.A = "2";
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: createTaskUtil({env}),
		cacheInfo, previousInvocationData, resolveInputValue,
	});
	const ran = [];
	await build2.run(GROUP, ["a", "b"], async (key, {taskUtil}) => {
		ran.push(key);
		taskUtil.getEnv(key.toUpperCase());
	});

	t.deepEqual(ran, ["a"], "Only the step whose env input changed re-ran");
});

test("A restored step replays its recorded tag operations, a re-run step's are not replayed", async (t) => {
	// Build 1: each step reads its input and tags its output.
	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: createTaskUtil()});
	await build1.run(GROUP, ["a", "b"], async (key, {workspace, taskUtil}) => {
		await workspace.byPath(`/in/${key}`);
		taskUtil.setTag(createResource(`/out/${key}`), "ui5:IsBundle", true);
	});
	const previousInvocationData = build1.getInvocationData();

	// Build 2: /in/a changed, so step "a" re-runs and step "b" is restored. Only the restored step's tag
	// operation is replayed; the re-run step's tag reaches the collection through its live setTag.
	const replayed = [];
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: createTaskUtil(),
		cacheInfo, previousInvocationData,
		applyTagOperations: (ops) => replayed.push(...ops),
	});
	const ran = [];
	await build2.run(GROUP, ["a", "b"], async (key, {workspace, taskUtil}) => {
		ran.push(key);
		await workspace.byPath(`/in/${key}`);
		taskUtil.setTag(createResource(`/out/${key}`), "ui5:IsBundle", true);
	});

	t.deepEqual(ran, ["a"], "Only the changed step re-ran");
	t.deepEqual(replayed, [{op: "set", path: "/out/b", tag: "ui5:IsBundle", value: true}],
		"The restored step's tag operation was replayed; the re-run step's was not");
});

test("getInputRecording unions every step's inputs, including cached steps on a delta build", async (t) => {
	const env = {A: "1", B: "1"};
	const resolveInputValue = (type, name) => (type === "env" ? env[name] : undefined);

	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: createTaskUtil({env})});
	await build1.run(GROUP, ["a", "b"], async (key, {taskUtil}) => {
		taskUtil.getEnv(key.toUpperCase());
	});
	const previousInvocationData = build1.getInvocationData();

	// Only env A changes, so step "b" is restored (never re-run) this build. Its input must still be in
	// the folded union, so the re-keyed stage signature keeps tracking it.
	env.A = "2";
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: createTaskUtil({env}),
		cacheInfo, previousInvocationData, resolveInputValue,
	});
	await build2.run(GROUP, ["a", "b"], async (key, {taskUtil}) => {
		taskUtil.getEnv(key.toUpperCase());
	});

	t.deepEqual(build2.getInputRecording().sort((x, y) => x.name.localeCompare(y.name)), [
		{type: "env", name: "A", value: "2"},
		{type: "env", name: "B", value: "1"},
	], "The re-run step's fresh input and the cached step's persisted input are both folded in");
});

test("Without a resolver, a changed non-resource input cannot re-run a step", async (t) => {
	const build1 = new ProcessEach({workspace: createWorkspace(), taskUtil: createTaskUtil({env: {A: "1"}})});
	await build1.run(GROUP, ["a"], async (key, {taskUtil}) => {
		taskUtil.getEnv("A");
	});
	const previousInvocationData = build1.getInvocationData();

	// No resolveInputValue (standalone use): the input cannot be re-derived, so selection falls back to
	// resource reads alone and the step stays cached.
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new ProcessEach({
		workspace: createWorkspace(), taskUtil: createTaskUtil({env: {A: "2"}}),
		cacheInfo, previousInvocationData,
	});
	const ran = [];
	await build2.run(GROUP, ["a"], async (key) => {
		ran.push(key);
	});

	t.deepEqual(ran, [], "Without a resolver the step stays cached despite the changed input");
});
