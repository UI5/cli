import test from "ava";
import BundleWriter from "../../../../lib/lbt/bundle/BundleWriter.js";

test("Constructor", (t) => {
	const w = new BundleWriter();
	t.is(w.buf, "", "Buffer should be an empty string");
	t.deepEqual(w.segments, [], "Segments should be empty");
	t.is(w.currentSegment, null, "No initial current segment");
	t.is(w.currentSourceIndex, 0, "Source index is initially at 0");
	t.is(w.endsWithNewLine, true, "Initially endsWithNewLine is true as buffer is empty");
});

test("write", (t) => {
	const w = new BundleWriter();
	t.is(w.toString(), "", "Output should be initially empty");
	w.write("");
	t.is(w.toString(), "", "Output should still be empty when writing an empty string");
	w.write("foo");
	t.is(w.toString(), "foo");
	w.write("   ");
	t.is(w.toString(), "foo   ");
	w.write("bar");
	t.is(w.toString(), "foo   bar");
	w.write("");
	t.is(w.toString(), "foo   bar");
});

test("write (endsWithNewLine)", (t) => {
	const w = new BundleWriter();
	t.is(w.endsWithNewLine, true, "Initially endsWithNewLine is true as buffer is empty");

	w.write("");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after empty string");
	w.write("   ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing spaces only");
	w.write("\t\t\t");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing tabs only");
	w.write(" \t \t\t   ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing spaces and tabs only");

	w.write("foo");
	t.is(w.endsWithNewLine, false, "endsWithNewLine should be false after writing 'foo'");
	w.write("   ");
	t.is(w.endsWithNewLine, false, "endsWithNewLine should still be false after writing spaces only");
	w.write("\t\t\t");
	t.is(w.endsWithNewLine, false, "endsWithNewLine should still be false after writing tabs only");
	w.write(" \t \t\t   ");
	t.is(w.endsWithNewLine, false, "endsWithNewLine should still be false after writing spaces and tabs only");

	w.write("foo\n");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should be true after write with new-line");
	w.write("   ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing spaces only");
	w.write("\t\t\t");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing tabs only");
	w.write(" \t \t\t   ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing spaces and tabs only");

	w.write("foo\nbar");
	t.is(w.endsWithNewLine, false,
		"endsWithNewLine should be false after write that includes but not ends with new-line");

	w.write("foo\n \t    \t ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should be true after write with new-line and tabs/spaces");
	w.write("   ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing spaces only");
	w.write("\t\t\t");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing tabs only");
	w.write(" \t \t\t   ");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should still be true after writing spaces and tabs only");
});

test("writeln", (t) => {
	const w = new BundleWriter();
	t.is(w.toString(), "", "Output should be initially empty");
	w.writeln("");
	t.is(w.toString(), "\n", "Output should only contain a new-line");
	w.writeln("foo");
	t.is(w.toString(), "\nfoo\n");
	w.writeln("   ");
	t.is(w.toString(), "\nfoo\n   \n");
	w.writeln("bar");
	t.is(w.toString(), "\nfoo\n   \nbar\n");
	w.writeln("");
	t.is(w.toString(), "\nfoo\n   \nbar\n\n");
});

test("writeln (endsWithNewLine)", (t) => {
	const w = new BundleWriter();

	w.endsWithNewLine = false;

	w.writeln("");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should be true after writeln with empty string");

	w.endsWithNewLine = false;

	w.writeln("c");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should be true again after writeln with 'c'");
});

test("ensureNewLine", (t) => {
	const w = new BundleWriter();
	t.is(w.toString(), "", "Output should be initially empty");
	t.is(w.endsWithNewLine, true, "Initially endsWithNewLine is true as buffer is empty");

	w.ensureNewLine();
	t.is(w.toString(), "", "Output should still be empty as no new-line is needed");

	w.endsWithNewLine = false;

	w.ensureNewLine();
	t.is(w.toString(), "\n", "Output should contain a new-line as 'endsWithNewLine' was false");
	t.is(w.endsWithNewLine, true, "endsWithNewLine should be set to true");
});

test("toString", (t) => {
	const w = new BundleWriter();
	w.buf = "some string";
	t.is(w.toString(), "some string", "toString returns internal 'buf' property");
});

test("length", (t) => {
	const w = new BundleWriter();
	w.buf = "some string";
	t.is(w.length, "some string".length, "length returns internal 'buf' length");
});

test("startSegment / endSegment", (t) => {
	const w = new BundleWriter();

	const module1 = {test: 1};

	w.startSegment(module1);

	t.deepEqual(w.currentSegment, {module: {test: 1}, startIndex: 0});
	t.is(w.currentSegment.module, module1);
	t.is(w.currentSourceIndex, 0);
	t.deepEqual(w.segments, []);

	w.write("foo");

	t.deepEqual(w.currentSegment, {module: {test: 1}, startIndex: 0});
	t.is(w.currentSegment.module, module1);
	t.is(w.currentSourceIndex, 0);
	t.deepEqual(w.segments, []);

	const targetSize1 = w.endSegment();

	t.is(targetSize1, 3);
	t.is(w.currentSegment, null);
	t.is(w.currentSourceIndex, -1);
	t.deepEqual(w.segments, [{
		module: {test: 1},
		startIndex: 0,
		endIndex: 3
	}]);

	const module2 = {test: 2};

	w.startSegment(module2);

	t.deepEqual(w.currentSegment, {module: {test: 2}, startIndex: 3});
	t.is(w.currentSegment.module, module2);
	t.is(w.currentSourceIndex, 1);
	t.deepEqual(w.segments, [{
		module: {test: 1},
		startIndex: 0,
		endIndex: 3
	}]);

	w.write("bar!");

	t.deepEqual(w.currentSegment, {module: {test: 2}, startIndex: 3});
	t.is(w.currentSegment.module, module2);
	t.is(w.currentSourceIndex, 1);
	t.deepEqual(w.segments, [{
		module: {test: 1},
		startIndex: 0,
		endIndex: 3
	}]);

	const targetSize2 = w.endSegment();

	t.is(targetSize2, 4);
	t.is(w.currentSegment, null);
	t.is(w.currentSourceIndex, -1);
	t.deepEqual(w.segments, [{
		module: {test: 1},
		startIndex: 0,
		endIndex: 3
	}, {
		module: {test: 2},
		startIndex: 3,
		endIndex: 7
	}]);
});

test("startSegment (Error handling)", (t) => {
	const w = new BundleWriter();
	w.startSegment({});

	t.throws(() => {
		w.startSegment({});
	}, {
		message: "trying to start a segment while another segment is still open"
	});
});

test("endSegment (Error handling)", (t) => {
	const w = new BundleWriter();

	t.throws(() => {
		w.endSegment({});
	}, {
		message: "trying to end a segment while no segment is open"
	});
});
