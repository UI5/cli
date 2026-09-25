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
