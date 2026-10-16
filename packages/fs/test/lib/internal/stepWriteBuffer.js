import test from "ava";
import {assertDistinctWrite, flushWriteBuffer} from "../../../lib/internal/stepWriteBuffer.js";

// The exact user-visible message. Both step runners surface this verbatim, so pin it here as the single
// definition: a change to the shared message must update this assertion deliberately.
const SAME_PATH_MESSAGE =
	"Concurrent map step 'compile' in task 'buildResources' tried to write '/a.out' for invocations " +
	"'/resources/first.js' and " +
	"'/resources/second.js'. No two invocations may write to the same path.";

test("assertDistinctWrite passes for an empty buffer", (t) => {
	t.notThrows(() => assertDistinctWrite(new Map(), "/a.out", 0));
});

test("assertDistinctWrite passes when the same unit overwrites its own buffered path", (t) => {
	const buffer = new Map([["/a.out", {resource: {}, args: [], index: 2}]]);
	t.notThrows(() => assertDistinctWrite(buffer, "/a.out", 2),
		"A unit may overwrite a path it buffered itself");
});

test("assertDistinctWrite throws the exact message when a different unit writes the same path", (t) => {
	const buffer = new Map([["/a.out", {
		resource: {},
		args: [],
		index: 0,
		inputName: "/resources/first.js",
	}]]);
	const err = t.throws(() => assertDistinctWrite(
		buffer, "/a.out", 1, "/resources/second.js", "compile", "buildResources"));
	t.is(err.message, SAME_PATH_MESSAGE, "The user-visible message has one definition");
});

test("assertDistinctWrite identifies non-resource invocations by position", (t) => {
	const buffer = new Map([["/a.out", {resource: {}, args: [], index: 0}]]);
	const err = t.throws(() => assertDistinctWrite(buffer, "/a.out", 1, undefined, "compile"));
	t.is(err.message,
		"Concurrent map step 'compile' tried to write '/a.out' for invocations #1 and #2. " +
		"No two invocations may write to the same path.");
});

test("flushWriteBuffer replays writes in key order regardless of insertion order", async (t) => {
	const written = [];
	const workspace = {write: async (resource, ...args) => written.push({path: resource.getPath(), args})};
	const resource = (path) => ({getPath: () => path});
	// Insert out of key order: index 2, then 0, then 1.
	const buffer = new Map([
		["/c", {resource: resource("/c"), args: [{drain: true}], index: 2}],
		["/a", {resource: resource("/a"), args: [], index: 0}],
		["/b", {resource: resource("/b"), args: [{readOnly: true}], index: 1}],
	]);

	await flushWriteBuffer(buffer, workspace);

	t.deepEqual(written.map(({path}) => path), ["/a", "/b", "/c"],
		"Flushed sorted by index, not by insertion order");
	t.deepEqual(written.map(({args}) => args), [[], [{readOnly: true}], [{drain: true}]],
		"Each entry's args are replayed verbatim via write(resource, ...args)");
});

test("flushWriteBuffer on an empty buffer is a no-op", async (t) => {
	let called = false;
	await flushWriteBuffer(new Map(), {write: async () => {
		called = true;
	}});
	t.false(called, "Nothing written for an empty buffer");
});
