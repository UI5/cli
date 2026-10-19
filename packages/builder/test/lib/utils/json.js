import test from "ava";
import parseJSON from "../../../lib/utils/json.js";

test("parseJSON: Parses valid JSON content", (t) => {
	const result = parseJSON(`{"foo": "bar"}`, "/some/file.json");
	t.deepEqual(result, {foo: "bar"}, "Returned the parsed object");
});

test("parseJSON: Parses an empty JSON object", (t) => {
	const result = parseJSON("{}", "/some/file.json");
	t.deepEqual(result, {}, "An empty JSON object is valid and parsed correctly");
});

test("parseJSON: Throws for empty content", (t) => {
	const error = t.throws(() => parseJSON("", "webapp/manifest.json"));
	t.is(error.message, `The file "webapp/manifest.json" is empty.`,
		"Threw with the expected error message");
	t.is(error.code, "ERR_EMPTY_JSON", "Threw with the expected error code");
});

test("parseJSON: Throws for whitespace-only content", (t) => {
	const error = t.throws(() => parseJSON("  \n\t ", "webapp/manifest.json"));
	t.is(error.message, `The file "webapp/manifest.json" is empty.`,
		"Threw with the expected error message");
	t.is(error.code, "ERR_EMPTY_JSON", "Threw with the expected error code");
});

test("parseJSON: Throws native error for non-empty invalid JSON", (t) => {
	const error = t.throws(() => parseJSON("no json", "/some/file.json"));
	t.not(error.code, "ERR_EMPTY_JSON",
		"Invalid (but non-empty) JSON is not reported as an empty file");
	t.true(error instanceof SyntaxError, "Threw the native JSON.parse SyntaxError");
});
