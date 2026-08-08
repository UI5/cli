import test from "ava";
import {isAbortError, isFileNotFoundError} from "../../../../lib/build/helpers/abort.js";

test("isAbortError: recognizes abort error names", (t) => {
	t.true(isAbortError({name: "AbortBuildError"}));
	t.true(isAbortError({name: "SourceChangedDuringBuildError"}));
	t.true(isAbortError({name: "AbortError"}));
});

test("isAbortError: an aborted signal classifies any error as abort", (t) => {
	t.true(isAbortError(new Error("something else"), {aborted: true}));
});

test("isAbortError: a non-abort error with a non-aborted signal is not an abort", (t) => {
	t.false(isAbortError(new Error("boom")));
	t.false(isAbortError(new Error("boom"), {aborted: false}));
});

test("isFileNotFoundError: true only for ENOENT", (t) => {
	const enoent = new Error("ENOENT: no such file or directory, open '/gone.js'");
	enoent.code = "ENOENT";
	t.true(isFileNotFoundError(enoent));
});

test("isFileNotFoundError: false for other fs error codes", (t) => {
	const eacces = new Error("permission denied");
	eacces.code = "EACCES";
	t.false(isFileNotFoundError(eacces));
});

test("isFileNotFoundError: false for a message-only error without a code", (t) => {
	// The less compiler reports a missing import as a message string with no `code`, so it must
	// stay on the deterministic path rather than being retried forever.
	t.false(isFileNotFoundError(new Error("Could not find file at path '/foo.less'")));
});

test("isFileNotFoundError: false for null / undefined", (t) => {
	t.false(isFileNotFoundError(null));
	t.false(isFileNotFoundError(undefined));
});
