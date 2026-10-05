import test from "ava";
import StepRunner from "../../../../lib/build/helpers/StepRunner.js";

function createResource(resourcePath, content = resourcePath) {
	return {
		getPath: () => resourcePath,
		getIntegrity: async () => `sha256-${content}`,
		getString: async () => content,
	};
}

// A filesystem-backed resource as the project source reader yields it: lastModified and a statically-known
// size are present (so #keyId's cheap tier applies and never reads content), while getIntegrity() would read
// and hash the content. getIntegrity throws here so a test proves the cheap tier did NOT fall through to it.
function createFsResource(resourcePath, {content = resourcePath, lastModified = 1000, size} = {}) {
	return {
		getPath: () => resourcePath,
		getLastModified: () => lastModified,
		hasSize: () => true,
		getSize: async () => size ?? content.length,
		getIntegrity: async () => {
			throw new Error(`getIntegrity() must not be called for ${resourcePath} on the cheap key tier`);
		},
		getString: async () => content,
	};
}

// A memory-backed or generated resource: no lastModified, so #keyId falls back to the integrity tier. The
// Memory adapter and resources produced by a task carry no filesystem stat, matching this shape.
function createMemoryResource(resourcePath, content = resourcePath) {
	return {
		getPath: () => resourcePath,
		getLastModified: () => undefined,
		hasSize: () => true,
		getSize: async () => content.length,
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
	notifyStepExecution,
}) {
	const recorded = new Map();
	const runner = new StepRunner({
		steps,
		options,
		returnValueStore,
		resolveInputValue,
		applyTagOperations,
		signal,
		notifyStepExecution,
		prepareStage: async (step) => (step in cacheVerdicts ? cacheVerdicts[step] : false),
		getPreviousInvocationData: (step) => previousData.get(step),
		// Mirrors the TaskRunner hook: reopens the stage with a live writer and demotes the full hit to a
		// full re-run. The harness workspace is always writable, so reopening is a no-op here.
		reopenStage: async () => false,
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

test("Delta build keeps a map consumer cached when its producer is restored unchanged", async (t) => {
	// A scalar step always re-runs on a delta verdict (a single implicit unit cannot be pruned), so the
	// delta-path "keep the consumer cached when its producer is unchanged" behavior is exercised through a
	// map consumer: its one key stays cached because the producer return it consumed did not change.
	const stepsFor = (ran) => [
		{name: "scan", run: async ({workspace}) => {
			const res = await workspace.byPath("/in");
			ran.push("scan");
			return {v: res ? await res.getString() : "none"};
		}},
		{name: "use", needs: ["scan"], keys: async () => ["k"],
			each: async (key, {needs, workspace}) => {
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
	// changed paths, so its key stays cached because the producer return did not change.
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

	t.deepEqual(ran, [], "Neither the restored producer nor its cached map consumer re-ran");
});

test("Delta build re-runs a scalar step whose glob gains a newly matching file", async (t) => {
	// A scalar step globs for themes. On build 1 the workspace has none, so the step records no reads and
	// returns hasThemes:false. On build 2 a file matching the glob is added. The recorder stores resolved
	// paths, not the glob pattern, so the added file is in no previous read and the per-unit reads delta
	// cannot select the step. A scalar step is a single implicit unit, so it must re-run on any delta
	// verdict rather than serve its stale cached return.
	const stepsFor = (ran) => [
		{name: "scan", run: async ({workspace}) => {
			ran.push("scan");
			const matches = await workspace.byGlob("/themes/**/library.source.less");
			return {hasThemes: matches.length > 0};
		}},
	];

	const build1 = makeDriver({workspace: createWorkspace([]), steps: stepsFor([])});
	await build1.runner.runSteps();
	t.deepEqual(
		[...invocationDataOf(build1.recorded, "scan").values()][0].reads, [],
		"Build 1 recorded no reads because the glob matched nothing");

	const ran = [];
	// The stage signature changed (the stage monitor recorded the glob), so prepareStage returns a delta
	// verdict. The added path intersects none of scan's recorded (empty) reads.
	const cacheInfo = {
		changedProjectResourcePaths: ["/themes/my_theme/library.source.less"],
		changedDependencyResourcePaths: [],
	};
	const build2 = makeDriver({
		workspace: createWorkspace([createResource("/themes/my_theme/library.source.less")]),
		cacheVerdicts: {scan: cacheInfo},
		previousData: new Map([["scan", invocationDataOf(build1.recorded, "scan")]]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

	t.deepEqual(ran, ["scan"], "The scalar step re-ran on the delta despite no recorded read changing");
});

test("Delta build re-runs a scalar step whose glob loses its last matching file", async (t) => {
	// The removal direction: build 1 globs one matching file (recorded as a read), build 2 removes it. The
	// removed path intersects the recorded read, so the reads delta alone would already re-run the step;
	// this locks that a scalar step still re-runs when its only matching file is deleted.
	const stepsFor = (ran) => [
		{name: "scan", run: async ({workspace}) => {
			ran.push("scan");
			const matches = await workspace.byGlob("/themes/**/library.source.less");
			return {hasThemes: matches.length > 0};
		}},
	];

	const build1 = makeDriver({
		workspace: createWorkspace([createResource("/themes/my_theme/library.source.less")]),
		steps: stepsFor([]),
	});
	await build1.runner.runSteps();

	const ran = [];
	const cacheInfo = {
		changedProjectResourcePaths: ["/themes/my_theme/library.source.less"],
		changedDependencyResourcePaths: [],
	};
	const build2 = makeDriver({
		workspace: createWorkspace([]),
		cacheVerdicts: {scan: cacheInfo},
		previousData: new Map([["scan", invocationDataOf(build1.recorded, "scan")]]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

	t.deepEqual(ran, ["scan"], "The scalar step re-ran when its last matching file was removed");
});

test("Full stage-cache hit re-runs a consumer when its producer's return changed", async (t) => {
	// A consumer that reads no resources has a constant stage signature, so its stage is a full cache hit
	// (verdict true) even when a producer it needs re-ran with a changed return. The needs return is
	// excluded from the stage signature, so nothing in the stage lookup catches the change; the full-hit
	// path must check needs itself and re-run rather than serve stale cached output.
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
	// scan re-runs on a delta because its recorded read /in changed, advancing its return signature.
	// use's own stage signature is unchanged (it reads nothing), so its verdict is a full hit (true).
	const cacheInfo = {changedProjectResourcePaths: ["/in"], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		workspace: createWorkspace([createResource("/in", "new")]),
		cacheVerdicts: {scan: cacheInfo, use: true},
		previousData: new Map([
			["scan", invocationDataOf(build1.recorded, "scan")],
			["use", invocationDataOf(build1.recorded, "use")],
		]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

	t.deepEqual(ran, ["use"],
		"The consumer re-ran despite a full stage-cache hit because the producer's return changed");
	t.is(build2.workspace.store.get("/use.out") &&
		await build2.workspace.store.get("/use.out").getString(), JSON.stringify({v: "new"}),
	"The re-run consumer wrote the fresh producer return, not stale output");
});

test("Full stage-cache hit stays cached when the producer's return is unchanged", async (t) => {
	// The complement of the previous test: a full-hit consumer whose producer restored unchanged must
	// NOT re-run, so the fast path is preserved for the common case.
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
		workspace: createWorkspace([createResource("/in", "v")]), steps: stepsFor([]),
	});
	await build1.runner.runSteps();

	const ran = [];
	// scan restores unchanged (full hit, no change), use is a full hit too. The producer return did not
	// change, so use stays cached.
	const build2 = makeDriver({
		workspace: createWorkspace([createResource("/in", "v")]),
		cacheVerdicts: {scan: true, use: true},
		previousData: new Map([
			["scan", invocationDataOf(build1.recorded, "scan")],
			["use", invocationDataOf(build1.recorded, "use")],
		]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

	t.deepEqual(ran, [], "A full-hit consumer stays cached when its producer's return is unchanged");
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

test("A re-run key's dropped output is stale while a cached key's output is kept", async (t) => {
	const stepsFor = (paths) => [
		{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
			await workspace.byPath(`/in/${key}`); // recorded read
			for (const path of paths[key]) {
				await workspace.write(createResource(path));
			}
		}},
	];

	const build1 = makeDriver({steps: stepsFor({a: ["/out/a", "/out/a.extra"], b: ["/out/b"]})});
	await build1.runner.runSteps();

	// Only key 'a' re-runs, and it writes one path less than before. Key 'b' is served from cache, so its
	// output must survive even though this build never wrote it.
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		cacheVerdicts: {m: cacheInfo},
		previousData: new Map([["m", invocationDataOf(build1.recorded, "m")]]),
		steps: stepsFor({a: ["/out/a"], b: ["/out/b"]}),
	});
	await build2.runner.runSteps();

	t.deepEqual(build2.recorded.get("m").staleOutputs, ["/out/a.extra"],
		"Only the path the re-run key stopped writing is stale");
});

test("A removed key's output stays when a cached key still writes it", async (t) => {
	const stepsFor = (keys) => [
		{name: "m", sequential: true, keys: async () => keys, each: async (key, {workspace}) => {
			await workspace.write(createResource("/out/shared", "shared"));
			await workspace.write(createResource(`/out/${key}`));
		}},
	];

	const build1 = makeDriver({steps: stepsFor(["a", "b"])});
	await build1.runner.runSteps();

	// Key 'b' is gone and key 'a' is served from cache, so '/out/shared' is written by nobody this build.
	// It is still owned by the cached key, so dropping key 'b' must not take it down.
	const cacheInfo = {changedProjectResourcePaths: [], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		cacheVerdicts: {m: cacheInfo},
		previousData: new Map([["m", invocationDataOf(build1.recorded, "m")]]),
		steps: stepsFor(["a"]),
	});
	await build2.runner.runSteps();

	t.deepEqual(build2.recorded.get("m").staleOutputs, ["/out/b"],
		"Only the removed key's exclusive output is stale");
});

// --- Key identity (#keyId) ---

test("Key identity is stable across builds for an unchanged resource and uses the cheap tier", async (t) => {
	// The same filesystem-backed resource (same lastModified + size) on two builds. getIntegrity throws, so
	// the build only completes if #keyId used the lastModified + size tier and never read the content.
	const stepsFor = () => [
		{name: "m", keys: async ({workspace}) => workspace.byGlob(), each: async () => {}},
	];

	const build1 = makeDriver({
		workspace: createWorkspace([createFsResource("/in/a", {lastModified: 1000, size: 3})]),
		steps: stepsFor(),
	});
	await build1.runner.runSteps();
	const keyId1 = [...invocationDataOf(build1.recorded, "m").keys()];

	const build2 = makeDriver({
		workspace: createWorkspace([createFsResource("/in/a", {lastModified: 1000, size: 3})]),
		steps: stepsFor(),
	});
	await build2.runner.runSteps();
	const keyId2 = [...invocationDataOf(build2.recorded, "m").keys()];

	t.deepEqual(keyId2, keyId1, "An unchanged resource keeps the same key identity across builds");
});

test("Key identity changes when a resource's content changes", async (t) => {
	// A content edit moves lastModified (and here size), so the cheap tier yields a new key identity.
	const stepsFor = () => [
		{name: "m", keys: async ({workspace}) => workspace.byGlob(), each: async () => {}},
	];

	const build1 = makeDriver({
		workspace: createWorkspace([createFsResource("/in/a", {content: "old", lastModified: 1000, size: 3})]),
		steps: stepsFor(),
	});
	await build1.runner.runSteps();
	const [keyId1] = [...invocationDataOf(build1.recorded, "m").keys()];

	const build2 = makeDriver({
		workspace: createWorkspace([createFsResource("/in/a", {content: "newer", lastModified: 2000, size: 5})]),
		steps: stepsFor(),
	});
	await build2.runner.runSteps();
	const [keyId2] = [...invocationDataOf(build2.recorded, "m").keys()];

	t.not(keyId2, keyId1, "A changed resource yields a different key identity");
});

test("A content change drops the previous output rather than serving it stale", async (t) => {
	// The property the integrity hash guaranteed, now carried by lastModified + size: when a key resource's
	// content changes, its key identity changes, so the old key disappears and its output is dropped as stale,
	// while the unit re-runs under the new key producing fresh output. A stale (not re-run, not dropped) key
	// would keep serving the old output. The output path is derived from the content so the drop is observable:
	// the old key wrote /out/old, the re-run writes /out/new, and /out/old must be reported stale.
	const stepsFor = (ran) => [
		{name: "m", keys: async ({workspace}) => workspace.byGlob(), each: async (key, {workspace}) => {
			const content = await key.getString();
			ran?.push(content);
			await workspace.write(createResource(`/out/${content}`));
		}},
	];

	const build1 = makeDriver({
		workspace: createWorkspace([createFsResource("/in/a", {content: "old", lastModified: 1000, size: 3})]),
		steps: stepsFor(),
	});
	await build1.runner.runSteps();
	const previous = invocationDataOf(build1.recorded, "m");

	// A delta build whose changed-path verdict does NOT list /in/a: the re-run is driven solely by the new key
	// identity, exactly the case the integrity hash existed to cover (a mtime-moving edit the stage's own
	// changed-path delta did not surface, e.g. because no unit recorded a read of /in/a).
	const ran = [];
	const build2 = makeDriver({
		workspace: createWorkspace([createFsResource("/in/a", {content: "new", lastModified: 2000, size: 3})]),
		cacheVerdicts: {m: {changedProjectResourcePaths: [], changedDependencyResourcePaths: []}},
		previousData: new Map([["m", previous]]),
		steps: stepsFor(ran),
	});
	await build2.runner.runSteps();

	t.deepEqual(ran, ["new"], "The changed-content key re-ran");
	t.true(build2.workspace.store.has("/out/new"), "The re-run produced fresh output");
	t.deepEqual(build2.recorded.get("m").staleOutputs, ["/out/old"],
		"The previous key's output is dropped as stale, not served from cache");
});

test("Key identity falls back to integrity when lastModified is missing", async (t) => {
	// A memory-backed or generated resource has no lastModified, so #keyId uses the integrity tier. Identity
	// is still stable for identical content and changes with content.
	const stepsFor = () => [
		{name: "m", keys: async ({workspace}) => workspace.byGlob(), each: async () => {}},
	];

	const build1 = makeDriver({
		workspace: createWorkspace([createMemoryResource("/mem/a", "same")]), steps: stepsFor(),
	});
	await build1.runner.runSteps();
	const [stable1] = [...invocationDataOf(build1.recorded, "m").keys()];

	const build2 = makeDriver({
		workspace: createWorkspace([createMemoryResource("/mem/a", "same")]), steps: stepsFor(),
	});
	await build2.runner.runSteps();
	const [stable2] = [...invocationDataOf(build2.recorded, "m").keys()];

	t.is(stable2, stable1, "A memory resource with unchanged content keeps its integrity-tier key identity");

	const build3 = makeDriver({
		workspace: createWorkspace([createMemoryResource("/mem/a", "changed")]), steps: stepsFor(),
	});
	await build3.runner.runSteps();
	const [changed3] = [...invocationDataOf(build3.recorded, "m").keys()];

	t.not(changed3, stable1, "A memory resource's changed content yields a different integrity-tier key");
});

test("A filesystem key and a memory key never collide on the same path", async (t) => {
	// The tier prefixes (m/s vs i) keep a stat-tiered key distinct from an integrity-tiered key for the same
	// path, so a resource that changes provenance between builds is treated as new rather than aliasing.
	const stepsFor = (resource) => [
		{name: "m", keys: async () => [resource], each: async () => {}},
	];

	const fsBuild = makeDriver({steps: stepsFor(createFsResource("/x", {lastModified: 1000, size: 3}))});
	await fsBuild.runner.runSteps();
	const [fsKey] = [...invocationDataOf(fsBuild.recorded, "m").keys()];

	const memBuild = makeDriver({steps: stepsFor(createMemoryResource("/x", "abc"))});
	await memBuild.runner.runSteps();
	const [memKey] = [...invocationDataOf(memBuild.recorded, "m").keys()];

	t.not(fsKey, memKey, "A stat-tiered key and an integrity-tiered key for the same path differ");
});

test("A step's needs is frozen, so one unit cannot leak into its siblings", async (t) => {
	const seen = [];
	let keysError;
	let eachError;
	const {runner} = makeDriver({
		steps: [
			{name: "produce", run: async () => ({v: "original"})},
			{name: "consume", needs: ["produce"], keys: async ({needs}) => {
				keysError = t.throws(() => {
					needs.produce = {v: "from keys"};
				}, {instanceOf: TypeError});
				return ["a", "b"];
			}, sequential: true, each: async (key, {needs}) => {
				seen.push([key, needs.produce.v]);
				eachError ??= t.throws(() => {
					needs.produce = {v: `from ${key}`};
				}, {instanceOf: TypeError});
			}},
		],
	});

	await runner.runSteps();

	t.truthy(keysError, "Assigning to needs from the keys enumerator throws");
	t.truthy(eachError, "Assigning to needs from a unit throws");
	t.deepEqual(seen, [["a", "original"], ["b", "original"]],
		"Every unit sees the producer's return, unaffected by its siblings");
});

test("notifyStepExecution fires before the first executing step does any work", async (t) => {
	const order = [];
	const {runner} = makeDriver({
		notifyStepExecution: (isDifferentialBuild) => order.push(`notify:${isDifferentialBuild}`),
		steps: [
			{name: "s1", run: async () => {
				order.push("s1");
			}},
			{name: "s2", run: async () => {
				order.push("s2");
			}},
		],
	});

	await runner.runSteps();

	t.deepEqual(order, ["notify:false", "s1", "s2"],
		"The task is announced once, before the first step runs");
});

test("notifyStepExecution reports the first executing stage's delta verdict", async (t) => {
	const build1 = makeDriver({
		steps: [
			{name: "s1", run: async ({workspace}) => {
				await workspace.write(createResource("/out/1"));
			}},
			{name: "s2", run: async ({workspace}) => {
				await workspace.byPath("/in");
				await workspace.write(createResource("/out/2"));
			}},
		],
	});
	await build1.runner.runSteps();

	const notified = [];
	const build2 = makeDriver({
		notifyStepExecution: (isDifferentialBuild) => notified.push(isDifferentialBuild),
		// s1 is served from cache entirely, so the first stage that executes is the delta stage s2.
		cacheVerdicts: {
			s1: true,
			s2: {changedProjectResourcePaths: ["/in"], changedDependencyResourcePaths: []},
		},
		previousData: new Map([["s2", invocationDataOf(build1.recorded, "s2")]]),
		steps: [
			{name: "s1", run: async ({workspace}) => {
				await workspace.write(createResource("/out/1"));
			}},
			{name: "s2", run: async ({workspace}) => {
				await workspace.byPath("/in");
				await workspace.write(createResource("/out/2"));
			}},
		],
	});
	await build2.runner.runSteps();

	t.deepEqual(notified, [true], "Reported once, as a differential build");
});

test("notifyStepExecution is not called when every step is served from cache", async (t) => {
	let notified = 0;
	const {runner} = makeDriver({
		notifyStepExecution: () => notified++,
		cacheVerdicts: {s1: true, s2: true},
		steps: [
			{name: "s1", run: async () => undefined},
			{name: "s2", run: async () => undefined},
		],
	});

	const {anyStepExecuted} = await runner.runSteps();

	t.false(anyStepExecuted, "A fully cached task counts as skipped");
	t.is(notified, 0, "A skipped task is never announced as running");
});

test("The stage fold deduplicates reads shared across keys", async (t) => {
	// Two keys each read the same shared path plus one of their own. The recorder stores resolved paths, so a
	// path read by both keys would otherwise appear once per key in the fold. The fold must collapse it: the
	// request graph keys on a Set, so a duplicated path is wasted work (an inflated recording the TaskRunner
	// concatenates and the request-key set rebuilds), never a signature difference.
	const {runner, recorded} = makeDriver({
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace, dependencies}) => {
				await workspace.byPath("/shared"); // read by every key
				await workspace.byPath(`/in/${key}`); // read by this key only
				await dependencies.byPath("/dep/shared"); // dependency read by every key
			}},
		],
		dependencies: {
			getName: () => "dependencies",
			byPath: async () => null,
			byGlob: async () => [],
		},
	});

	await runner.runSteps();

	const {foldedReads} = recorded.get("m");
	t.deepEqual(foldedReads.project.paths.slice().sort(), ["/in/a", "/in/b", "/shared"],
		"Each project path appears exactly once, across the union of both keys' reads");
	t.deepEqual(foldedReads.dependencies.paths, ["/dep/shared"],
		"The shared dependency read is folded once, not once per key");
	t.is(foldedReads.project.paths.length, new Set(foldedReads.project.paths).size,
		"The folded project paths carry no duplicates");
});

test("Deduplicating the fold does not change the set of reads it represents", async (t) => {
	// The signature downstream is a function of the SET of folded paths (the request graph dedups anyway), so
	// deduplication must preserve that set exactly: every path any key read is present, and nothing else is.
	// Compare the deduplicated fold against the union assembled by hand from the per-key invocation data.
	const {runner, recorded} = makeDriver({
		steps: [
			{name: "m", keys: async () => ["a", "b", "c"], each: async (key, {workspace}) => {
				await workspace.byPath("/common"); // all three keys
				await workspace.byPath(key === "c" ? "/common" : `/in/${key}`); // c reads /common twice
			}},
		],
	});

	await runner.runSteps();

	const invocationData = invocationDataOf(recorded, "m");
	const expected = new Set();
	for (const data of invocationData.values()) {
		for (const path of data.reads) {
			expected.add(path);
		}
	}
	const {foldedReads} = recorded.get("m");
	t.deepEqual(new Set(foldedReads.project.paths), expected,
		"The deduplicated fold represents exactly the union of every key's reads");
	t.is(foldedReads.project.paths.length, expected.size, "with one entry per unique path");
});

test("A cached key's read, unseen by the stage monitor, stays in the stage fold on a delta build", async (t) => {
	// The property the fold exists to preserve: on a delta build only the re-run keys read through the
	// stage-level monitored readers, so a key served from cache contributes nothing the monitor sees. Its
	// recorded read must still key the stage, or the next build looks the stage up under a signature missing
	// that read and never finds it. The fold recovers it from the stage's complete per-key invocation data.
	//
	// Removing #foldStageKeys (so recordStage receives no foldedReads) makes this fail: foldedReads.project
	// would not carry /in/b, the cached key's read.
	const build1 = makeDriver({
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				await workspace.byPath(`/in/${key}`); // each key reads its own input
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build1.runner.runSteps();

	// A delta that re-runs only key 'a' (its input changed). Key 'b' is served from cache: it does not run, so
	// the stage monitor never observes its read of /in/b.
	const cacheInfo = {changedProjectResourcePaths: ["/in/a"], changedDependencyResourcePaths: []};
	const build2 = makeDriver({
		cacheVerdicts: {m: cacheInfo},
		previousData: new Map([["m", invocationDataOf(build1.recorded, "m")]]),
		steps: [
			{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
				await workspace.byPath(`/in/${key}`);
				await workspace.write(createResource(`/out/${key}`));
			}},
		],
	});
	await build2.runner.runSteps();

	const {foldedReads} = build2.recorded.get("m");
	t.true(foldedReads.project.paths.includes("/in/b"),
		"The cached key's read is folded into the stage's reads, though the monitor never saw it this build");
	t.true(foldedReads.project.paths.includes("/in/a"),
		"The re-run key's read is folded in too");
});

