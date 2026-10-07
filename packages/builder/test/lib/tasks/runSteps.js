import test from "ava";
import runSteps from "../../../lib/tasks/runSteps.js";

function createResource(resourcePath, content = resourcePath) {
	return {
		getPath: () => resourcePath,
		getIntegrity: async () => `sha256-${content}`,
		getString: async () => content,
	};
}

// Minimal in-memory workspace: byGlob/byPath/write plus getName so a BufferedWriter can wrap it. Write
// order and the trailing write arguments are recorded so the key-order flush and the argument handling are
// observable.
function createWorkspace(initial = []) {
	const store = new Map(initial.map((res) => [res.getPath(), res]));
	const writeOrder = [];
	const writeArgs = [];
	return {
		getName: () => "workspace",
		byGlob: async () => [...store.values()],
		byPath: async (virPath) => store.get(virPath) ?? null,
		write: async (resource, ...args) => {
			writeOrder.push(resource.getPath());
			writeArgs.push(args);
			store.set(resource.getPath(), resource);
		},
		store,
		writeOrder,
		writeArgs,
	};
}

test("Runs a scalar step and threads its return into a consumer via needs", async (t) => {
	const workspace = createWorkspace();
	let consumed;
	await runSteps((options) => [
		{name: "scan", run: async () => ({flag: options.flag})},
		{name: "use", needs: ["scan"], run: async ({needs, workspace}) => {
			consumed = needs.scan;
			await workspace.write(createResource("/out"));
		}},
	], {workspace, options: {flag: 42}});

	t.deepEqual(consumed, {flag: 42}, "The producer's return arrived as needs.scan");
	t.true(workspace.store.has("/out"), "The consumer's write persisted");
});

test("Fans out a map step's keys and writes each", async (t) => {
	const workspace = createWorkspace();
	const ran = [];
	await runSteps(() => [
		{name: "m", keys: async () => ["a", "b", "c"], each: async (key, {workspace}) => {
			ran.push(key);
			await workspace.write(createResource(`/out/${key}`));
		}},
	], {workspace});

	t.deepEqual(ran.sort(), ["a", "b", "c"], "each ran once per key");
	t.true(workspace.store.has("/out/a") && workspace.store.has("/out/b") && workspace.store.has("/out/c"),
		"Every key's write persisted");
});

test("A producer return reaches a map step's keys and each", async (t) => {
	const workspace = createWorkspace();
	const eachSaw = [];
	await runSteps(() => [
		{name: "scan", run: async () => ({wanted: ["x", "y"]})},
		{name: "build", needs: ["scan"], keys: async ({needs}) => needs.scan.wanted,
			each: async (key, {needs}) => {
				eachSaw.push([key, needs.scan.wanted.length]);
			}},
	], {workspace});

	t.deepEqual(eachSaw.sort(), [["x", 2], ["y", 2]], "each saw the producer return per key");
});

test("A concurrent map step flushes its writes in key order", async (t) => {
	const workspace = createWorkspace();
	await runSteps(() => [
		{name: "m", keys: async () => ["a", "b", "c"], each: async (key, {workspace}) => {
			// Reverse the natural completion order so the key-order flush is observable.
			if (key === "a") {
				await new Promise((resolve) => setTimeout(resolve, 15));
			}
			await workspace.write(createResource(`/${key}.out`));
		}},
	], {workspace});

	t.deepEqual(workspace.writeOrder, ["/a.out", "/b.out", "/c.out"],
		"Buffered writes flushed in key order regardless of completion order");
});

test("A sequential map step makes an earlier key's write visible to a later key", async (t) => {
	const workspace = createWorkspace();
	let secondSawFirst = false;
	await runSteps(() => [
		{name: "m", sequential: true, keys: async () => ["first", "second"], each: async (key, {workspace}) => {
			if (key === "first") {
				await workspace.write(createResource("/shared"));
			} else {
				secondSawFirst = !!(await workspace.byPath("/shared"));
			}
		}},
	], {workspace});

	t.true(secondSawFirst, "The second key read the first key's write");
});

test("Concurrent map-step keys writing the same path throw", async (t) => {
	const workspace = createWorkspace();
	const err = await t.throwsAsync(runSteps(() => [
		{name: "m", keys: async () => ["a", "b"], each: async (key, {workspace}) => {
			await workspace.write(createResource("/same"));
		}},
	], {workspace}));
	// The exact user-visible message, shared with the cached runner through @ui5/fs/internal/stepWriteBuffer.
	t.is(err.message,
		"Concurrent map-step keys must not write the same resource path /same. " +
		"Pass {sequential: true} if a later key must build on an earlier key's writes.",
		"The same-path guard surfaces the shared message verbatim");
});

test("A concurrent map step preserves each key's write arguments through the flush", async (t) => {
	const workspace = createWorkspace();
	await runSteps(() => [
		{name: "m", keys: async () => ["with", "without"], each: async (key, {workspace}) => {
			if (key === "with") {
				await workspace.write(createResource("/with"), {drain: true});
			} else {
				// No options: the override must not fabricate a defaulted options object for the flush.
				await workspace.write(createResource("/without"));
			}
		}},
	], {workspace});

	t.deepEqual(workspace.writeOrder, ["/with", "/without"], "Flushed in key order");
	t.deepEqual(workspace.writeArgs, [[{drain: true}], []],
		"A write with options replays its options; a write without options replays no extra argument");
});

test("A later step sees an earlier step's write", async (t) => {
	const workspace = createWorkspace();
	let laterSaw = false;
	await runSteps(() => [
		{name: "first", run: async ({workspace}) => {
			await workspace.write(createResource("/from-first"));
		}},
		{name: "second", run: async ({workspace}) => {
			laterSaw = !!(await workspace.byPath("/from-first"));
		}},
	], {workspace});

	t.true(laterSaw, "The second step read the first step's write");
});

test("taskUtil and dependencies are passed through to steps", async (t) => {
	const workspace = createWorkspace();
	const taskUtil = {marker: "taskUtil"};
	const dependencies = {marker: "dependencies"};
	let seen;
	await runSteps(() => [
		{name: "s", run: async (ctx) => {
			seen = {taskUtil: ctx.taskUtil, dependencies: ctx.dependencies};
		}},
	], {workspace, taskUtil, dependencies});

	t.is(seen.taskUtil, taskUtil, "taskUtil passed through");
	t.is(seen.dependencies, dependencies, "dependencies passed through");
});

test("An empty step list is a no-op", async (t) => {
	const workspace = createWorkspace();
	await runSteps(() => [], {workspace});
	t.is(workspace.store.size, 0, "Nothing written");
});
