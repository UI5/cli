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

// Drives a StepRunner with in-memory per-stage hooks, mirroring what the TaskRunner wires around a real
// build cache. The harness owns the fakes so tests can inspect what each
// stage recorded (its per-key invocationData, folded reads/inputs, stale outputs) without the StepRunner
// exposing task-level fold accessors anymore.
//
// - prepareStage(step): returns the stage's cache verdict. Defaults to false (full run) for every step;
//   pass `cacheVerdicts` to return `true` (fully cached) or a delta cacheInfo object for named steps.
// - getPreviousInvocationData(step): returns the step's previous per-key data from `previousData`.
// - createStageContext(): fresh recording context around a shared workspace/dependencies/taskUtil.
// - recordStage(step, outcome): captures the outcome under `recorded[step]` and returns the stage's
//   written paths (the union of its keys' writes), which runSteps aggregates.
function makeDriver({
	steps, options, workspace = createWorkspace(), dependencies, taskUtil = {}, returnValueStore,
	resolveInputValue, applyTagOperations, signal, cacheVerdicts = {}, previousData = new Map(),
}) {
	const recorded = new Map();
	const runner = new StepRunner({
		steps,
		options,
		returnValueStore,
		resolveInputValue,
		applyTagOperations,
		signal,
		prepareStage: async (step) => (step in cacheVerdicts ? cacheVerdicts[step] : false),
		getPreviousInvocationData: (step) => previousData.get(step),
		createStageContext: () => ({workspace, dependencies, taskUtil, monitoredTaskUtil: taskUtil}),
		recordStage: async (step, outcome) => {
			recorded.set(step, outcome);
			const written = new Set();
			for (const data of outcome.invocationData.values()) {
				(data.writes ?? []).forEach((path) => written.add(path));
			}
			return [...written];
		},
	});
	return {runner, recorded, workspace};
}

// The per-key invocation data a stage recorded this build (the map keyed by keyId), for the assertions
// that previously inspected runner.getInvocationData().get(step).
function invocationDataOf(recorded, step) {
	return recorded.get(step)?.invocationData;
}

// --- Step-factory API (runSteps) ---

test("runSteps runs a scalar step once and records its single unit", async (t) => {
	const {runner, recorded, workspace} = makeDriver({
		steps: [
			{name: "s", run: async ({workspace}) => {
				await workspace.write(createResource("/out"));
			}},
		],
	});

	await runner.runSteps();

	t.true(workspace.store.has("/out"), "Scalar step's write persisted");
	t.is(invocationDataOf(recorded, "s").size, 1, "Scalar step recorded one implicit unit");
});

test("runSteps runs a map step's each once per enumerated key", async (t) => {
	const ran = [];
	const {runner, recorded, workspace} = makeDriver({
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				ran.push(key);
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});

	await runner.runSteps();

	t.deepEqual(ran.sort(), ["a", "b"], "each ran once per key");
	t.is(invocationDataOf(recorded, "m").size, 2, "Map step recorded one unit per key");
	t.true(workspace.store.has("/out/a") && workspace.store.has("/out/b"), "Both keys' writes persisted");
});

test("A step must be either scalar or map", async (t) => {
	const {runner} = makeDriver({steps: [{name: "bad"}]});
	await t.throwsAsync(runner.runSteps(),
		{message: /Step 'bad' must be either a scalar step .* or a map step/});

	const {runner: both} = makeDriver({
		steps: [{name: "bad", run: async () => {}, keys: async () => [], each: async () => {}}],
	});
	await t.throwsAsync(both.runSteps(),
		{message: /Step 'bad' must be either a scalar step .* or a map step/});
});

test("A step's needs may only reference an earlier step", async (t) => {
	const {runner} = makeDriver({
		steps: [{name: "a", needs: ["later"], run: async () => {}}, {name: "later", run: async () => {}}],
	});
	await t.throwsAsync(runner.runSteps(),
		{message: /Step 'a' needs 'later', which is not an earlier step/});
});

test("A scalar producer's serializable return is injected into a consumer via needs", async (t) => {
	let seen;
	const {runner} = makeDriver({
		steps: [
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
	const keysSaw = [];
	const eachSaw = [];
	const {runner} = makeDriver({
		steps: [
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
	const {runner} = makeDriver({
		returnValueStore,
		steps: [
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
	const build1 = makeDriver({
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				await workspace.byPath(`/in/${key}`); // recorded read
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build1.runner.runSteps();

	const ran = [];
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		cacheVerdicts: {m: cacheInfo},
		previousData: new Map([["m", invocationDataOf(build1.recorded, "m")]]),
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				ran.push(key);
				await workspace.byPath(`/in/${key}`);
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build2.runner.runSteps();

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

	const build1 = makeDriver({
		workspace: createWorkspace([createResource("/in", "old")]), steps: stepsFor([]),
	});
	await build1.runner.runSteps();

	const ran = [];
	// scan re-runs because its recorded read /in changed, so its return advances; use re-runs because the
	// producer return it consumed changed.
	const cacheInfo = {changedProjectResourcePaths: ["/in"], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		workspace: createWorkspace([createResource("/in", "new")]),
		cacheVerdicts: {scan: cacheInfo, use: cacheInfo},
		previousData: new Map([
			["scan", invocationDataOf(build1.recorded, "scan")],
			["use", invocationDataOf(build1.recorded, "use")],
		]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

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

	const build1 = makeDriver({
		workspace: createWorkspace([createResource("/in", "v")]), steps: stepsFor([]),
	});
	await build1.runner.runSteps();

	const ran = [];
	// scan is fully cached (verdict true), so it restores its return unchanged; use is a delta with no
	// changed paths, so it stays cached because the producer return did not change.
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		workspace: createWorkspace([createResource("/in", "v")]),
		cacheVerdicts: {scan: true, use: cacheInfo},
		previousData: new Map([
			["scan", invocationDataOf(build1.recorded, "scan")],
			["use", invocationDataOf(build1.recorded, "use")],
		]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

	t.deepEqual(ran, [], "Neither the restored producer nor its consumer re-ran");
});

test("A map step honors sequential so a later key reads an earlier key's write", async (t) => {
	let secondSawFirst = false;
	const {runner} = makeDriver({
		steps: [
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
	// The stages share one workspace here (the harness's single fake); in the real pipeline a later
	// stage reads an earlier stage's writer through the prioritized reader stack.
	let laterSaw = false;
	const {runner} = makeDriver({
		steps: [
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
	const build1 = makeDriver({
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build1.runner.runSteps();

	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		cacheVerdicts: {m: cacheInfo},
		previousData: new Map([["m", invocationDataOf(build1.recorded, "m")]]),
		steps: [
			{name: "m", keys: async () => ["a"], each: async (key, {workspace}) => {
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build2.runner.runSteps();

	t.deepEqual(build2.recorded.get("m").staleOutputs, ["/out/b"], "The dropped key's output is stale");
});

test("runSteps over an empty step list does nothing", async (t) => {
	// An empty step list still drives the task's single stage (prepareStage/recordStage with undefined),
	// so the empty stage caches; nothing is recorded per key.
	const {runner, recorded} = makeDriver({steps: []});
	const {anyStepExecuted} = await runner.runSteps();
	t.true(anyStepExecuted, "An empty step list ran its stage (nothing cached to skip)");
	t.is(invocationDataOf(recorded, undefined).size, 0, "No per-key invocation data recorded");
	t.deepEqual(recorded.get(undefined).staleOutputs, [], "No stale outputs");
});

test("An empty step list served from cache reports the task as skipped", async (t) => {
	const {runner, recorded} = makeDriver({steps: [], cacheVerdicts: {undefined: true}});
	const {anyStepExecuted} = await runner.runSteps();
	t.false(anyStepExecuted, "A fully-cached empty stage counts as skipped");
	t.is(recorded.size, 0, "Nothing recorded when the empty stage is served from cache");
});

test("options passed to the runner reaches each step's context", async (t) => {
	let seenScalar;
	let seenEach;
	const {runner} = makeDriver({
		options: {pattern: "/**/*.js"},
		steps: [
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
