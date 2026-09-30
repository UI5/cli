import test from "ava";
import StepRunner from "../../../../lib/build/helpers/StepRunner.js";

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

// --- Step-factory API (runSteps) ---

test("runSteps runs a scalar step once and records its single unit", async (t) => {
	const workspace = createWorkspace();
	const runner = new StepRunner({
		workspace, taskUtil: {}, steps: [
			{name: "s", run: async ({workspace}) => {
				await workspace.write(createResource("/out"));
			}},
		],
	});

	await runner.runSteps();

	t.true(workspace.store.has("/out"), "Scalar step's write persisted");
	t.is(runner.getInvocationData().get("s").size, 1, "Scalar step recorded one implicit unit");
});

test("runSteps runs a map step's each once per enumerated key", async (t) => {
	const workspace = createWorkspace();
	const ran = [];
	const runner = new StepRunner({
		workspace, taskUtil: {}, steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				ran.push(key);
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});

	await runner.runSteps();

	t.deepEqual(ran.sort(), ["a", "b"], "each ran once per key");
	t.is(runner.getInvocationData().get("m").size, 2, "Map step recorded one unit per key");
	t.true(workspace.store.has("/out/a") && workspace.store.has("/out/b"), "Both keys' writes persisted");
});

test("A step must be either scalar or map", async (t) => {
	const runner = new StepRunner({workspace: createWorkspace(), taskUtil: {}, steps: [{name: "bad"}]});
	await t.throwsAsync(runner.runSteps(),
		{message: /Step 'bad' must be either a scalar step .* or a map step/});

	const both = new StepRunner({
		workspace: createWorkspace(), taskUtil: {},
		steps: [{name: "bad", run: async () => {}, keys: async () => [], each: async () => {}}],
	});
	await t.throwsAsync(both.runSteps(),
		{message: /Step 'bad' must be either a scalar step .* or a map step/});
});

test("A step's needs may only reference an earlier step", async (t) => {
	const runner = new StepRunner({
		workspace: createWorkspace(), taskUtil: {},
		steps: [{name: "a", needs: ["later"], run: async () => {}}, {name: "later", run: async () => {}}],
	});
	await t.throwsAsync(runner.runSteps(),
		{message: /Step 'a' needs 'later', which is not an earlier step/});
});

test("A scalar producer's serializable return is injected into a consumer via needs", async (t) => {
	let seen;
	const runner = new StepRunner({
		workspace: createWorkspace(), taskUtil: {}, steps: [
			{name: "scan", run: async () => ({hasThemes: true})},
			{name: "use", needs: ["scan"], run: async ({needs}) => {
				seen = needs.scan;
			}},
		],
	});

	await runner.runSteps();

	t.deepEqual(seen, {hasThemes: true}, "The producer's return arrived as needs.scan");
});

test("A producer return reaches a map step's keys and each via needs", async (t) => {
	const workspace = createWorkspace();
	const keysSaw = [];
	const eachSaw = [];
	const runner = new StepRunner({
		workspace, taskUtil: {}, steps: [
			{name: "scan", run: async () => ({wanted: ["x", "y"]})},
			{name: "build", needs: ["scan"], keys: async ({needs}) => {
				keysSaw.push(needs.scan);
				return needs.scan.wanted;
			}, each: async (key, {needs}) => {
				eachSaw.push([key, needs.scan.wanted.length]);
			}},
		],
	});

	await runner.runSteps();

	t.deepEqual(keysSaw, [{wanted: ["x", "y"]}], "keys saw the producer return");
	t.deepEqual(eachSaw.sort(), [["x", 2], ["y", 2]], "each saw the producer return per key");
});

test("A resource return is injected into a consumer and stored in the CAS", async (t) => {
	const returnValueStore = createReturnValueStore();
	let consumed;
	const runner = new StepRunner({
		workspace: createWorkspace(), taskUtil: {}, returnValueStore, steps: [
			{name: "make", run: async () => createResource("/made", "made-content")},
			{name: "use", needs: ["make"], run: async ({needs}) => {
				consumed = await needs.make.getString();
			}},
		],
	});

	await runner.runSteps();

	t.is(consumed, "made-content", "The producer's returned resource arrived as needs.make");
	t.deepEqual([...returnValueStore.cas.keys()], ["sha256-made-content"],
		"The returned resource's content was stored in the CAS");
});

test("Delta build re-runs only the map key whose recorded read changed", async (t) => {
	const steps = () => [
		{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
			await workspace.byPath(`/in/${key}`); // recorded read
			await workspace.write(createResource(`/out/${key}`));
		}},
	];
	const build1 = new StepRunner({workspace: createWorkspace(), taskUtil: {}, steps: steps()});
	await build1.runSteps();

	const ran = [];
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const build2 = new StepRunner({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo,
		previousInvocationData: build1.getInvocationData(),
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				ran.push(key);
				await workspace.byPath(`/in/${key}`);
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build2.runSteps();

	t.deepEqual(ran, ["a"], "Only the key whose recorded read changed re-ran");
});

test("Delta build re-runs a consumer when its producer's return changed", async (t) => {
	const stepsFor = (ran) => [
		{name: "scan", run: async ({workspace}) => {
			const res = await workspace.byPath("/in");
			return {v: res ? await res.getString() : "none"};
		}},
		{name: "use", needs: ["scan"], run: async ({needs, workspace}) => {
			ran.push("use");
			await workspace.write(createResource("/use.out", JSON.stringify(needs.scan)));
		}},
	];

	const ws1 = createWorkspace([createResource("/in", "old")]);
	const build1 = new StepRunner({workspace: ws1, taskUtil: {}, steps: stepsFor([])});
	await build1.runSteps();

	const ran = [];
	const ws2 = createWorkspace([createResource("/in", "new")]);
	const cacheInfo = {changedProjectResourcePaths: ["/in"], changedDependencyResourcePaths: []};
	const build2 = new StepRunner({
		workspace: ws2, taskUtil: {}, cacheInfo,
		previousInvocationData: build1.getInvocationData(), steps: stepsFor(ran),
	});
	await build2.runSteps();

	t.deepEqual(ran, ["use"], "The consumer re-ran because the producer's return changed");
});

test("Delta build keeps a consumer cached when its producer is restored unchanged", async (t) => {
	const stepsFor = (ran) => [
		{name: "scan", run: async ({workspace}) => {
			const res = await workspace.byPath("/in");
			ran.push("scan");
			return {v: res ? await res.getString() : "none"};
		}},
		{name: "use", needs: ["scan"], run: async ({needs, workspace}) => {
			ran.push("use");
			await workspace.write(createResource("/use.out", JSON.stringify(needs.scan)));
		}},
	];

	const build1 = new StepRunner({
		workspace: createWorkspace([createResource("/in", "v")]), taskUtil: {}, steps: stepsFor([]),
	});
	await build1.runSteps();

	const ran = [];
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new StepRunner({
		workspace: createWorkspace([createResource("/in", "v")]), taskUtil: {}, cacheInfo,
		previousInvocationData: build1.getInvocationData(), steps: stepsFor(ran),
	});
	await build2.runSteps();

	t.deepEqual(ran, [], "Neither the restored producer nor its consumer re-ran");
});

test("A map step honors sequential so a later key reads an earlier key's write", async (t) => {
	const workspace = createWorkspace();
	let secondSawFirst = false;
	const runner = new StepRunner({
		workspace, taskUtil: {}, steps: [
			{name: "m", sequential: true, keys: async () => ["first", "second"], each: async (key, {workspace}) => {
				if (key === "first") {
					await workspace.write(createResource("/shared"));
				} else {
					secondSawFirst = !!(await workspace.byPath("/shared"));
				}
			}},
		],
	});

	await runner.runSteps();

	t.true(secondSawFirst, "Sequential map step made the first key's write visible to the second");
});

test("A later step sees an earlier step's write", async (t) => {
	const workspace = createWorkspace();
	let laterSaw = false;
	const runner = new StepRunner({
		workspace, taskUtil: {}, steps: [
			{name: "first", run: async ({workspace}) => {
				await workspace.write(createResource("/from-first"));
			}},
			{name: "second", run: async ({workspace}) => {
				laterSaw = !!(await workspace.byPath("/from-first"));
			}},
		],
	});

	await runner.runSteps();

	t.true(laterSaw, "The second step read the first step's write through the stage");
});

test("A removed map key's output is reported stale", async (t) => {
	const build1 = new StepRunner({
		workspace: createWorkspace(), taskUtil: {}, steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build1.runSteps();

	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = new StepRunner({
		workspace: createWorkspace(), taskUtil: {}, cacheInfo,
		previousInvocationData: build1.getInvocationData(), steps: [
			{name: "m", keys: async () => ["a"], each: async (key, {workspace}) => {
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build2.runSteps();

	t.deepEqual(build2.getStaleOutputs(), ["/out/b"], "The dropped key's output is stale");
});

test("runSteps over an empty step list does nothing", async (t) => {
	const runner = new StepRunner({workspace: createWorkspace(), taskUtil: {}, steps: []});
	await runner.runSteps();
	t.is(runner.getInvocationData().size, 0, "No invocation data recorded");
	t.deepEqual(runner.getStaleOutputs(), [], "No stale outputs");
});

test("options passed to the runner reaches each step's context", async (t) => {
	let seenScalar;
	let seenEach;
	const runner = new StepRunner({
		workspace: createWorkspace(), taskUtil: {}, options: {pattern: "/**/*.js"}, steps: [
			{name: "s", run: async ({options}) => {
				seenScalar = options;
			}},
			{name: "m", keys: async ({options}) => [options.pattern], each: async (key, {options}) => {
				seenEach = options;
			}},
		],
	});

	await runner.runSteps();

	t.deepEqual(seenScalar, {pattern: "/**/*.js"}, "Scalar step received the task options");
	t.deepEqual(seenEach, {pattern: "/**/*.js"}, "Map step received the task options");
});
