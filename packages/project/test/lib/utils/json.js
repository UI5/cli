import test from "ava";
import sinon from "sinon";
import {setLimit} from "./__helper__/limits.js";
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
	t.true(error instanceof SyntaxError, "Threw a SyntaxError");
	t.is(error.message, `The file "webapp/manifest.json" is empty.`,
		"Threw with the expected error message");
	t.is(error.code, "ERR_EMPTY_JSON", "Threw with the expected error code");
});

test("parseJSON: Throws for whitespace-only content", (t) => {
	const error = t.throws(() => parseJSON("  \n\t ", "webapp/manifest.json"));
	t.true(error instanceof SyntaxError, "Threw a SyntaxError");
	t.is(error.message, `The file "webapp/manifest.json" is empty.`,
		"Threw with the expected error message");
	t.is(error.code, "ERR_EMPTY_JSON", "Threw with the expected error code");
});

test("parseJSON: Throws ERR_INVALID_JSON for malformed JSON", (t) => {
	const error = t.throws(() => parseJSON("{bad json", "/some/file.json"));
	t.true(error instanceof SyntaxError, "Threw a SyntaxError");
	t.is(error.code, "ERR_INVALID_JSON", "Threw with the expected error code");
	t.true(error.message.startsWith(`Failed to parse "/some/file.json" as JSON:`),
		"Error message includes the file path and root cause");
});

test("parseJSON: null content is treated as valid JSON returning null", (t) => {
	// JSON.parse(null) succeeds — null is valid JSON — so no error is thrown
	const result = parseJSON(null, "/some/file.json");
	t.is(result, null, "JSON.parse(null) returns null without throwing");
});

test("parseJSON: Throws ERR_INVALID_JSON for undefined content", (t) => {
	const error = t.throws(() => parseJSON(undefined, "/some/file.json"));
	t.is(error.code, "ERR_INVALID_JSON", "Threw with the expected error code");
});


test.serial("parseJSON: checks depth before JSON.parse and preserves the limit code", (t) => {
	setLimit(t, "UI5_JSON_MAX_DEPTH", 2);
	const parse = sinon.spy(JSON, "parse");
	t.teardown(() => parse.restore());
	t.throws(() => parseJSON("{\"a\":[[]]}", "manifest.json"), {
		code: "ERR_CONFIG_TOO_DEEP",
		message: "Configuration file 'manifest.json' exceeds the maximum JSON nesting depth of 2"
	});
	t.false(parse.called);
	t.deepEqual(parseJSON("{\"a\":[]}", "manifest.json"), {a: []});
	t.is(parse.callCount, 1);
});
