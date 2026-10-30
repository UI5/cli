import test from "ava";
import sinon from "sinon";
import {
	assertMaxBytes, assertJsonDepth, assertCollectionSize, readResourceString,
	getConfigLimits, getManifestMaxBytes, getJsonMaxDepth
} from "../../../lib/utils/limits.js";
import {setLimit} from "./__helper__/limits.js";

test.serial("Default limits and lazy environment overrides", (t) => {
	for (const name of ["UI5_CONFIG_MAX_BYTES", "UI5_CONFIG_MAX_DEPTH", "UI5_CONFIG_MAX_COLLECTION",
		"UI5_MANIFEST_MAX_BYTES", "UI5_JSON_MAX_DEPTH"]) {
		setLimit(t, name, undefined);
	}
	t.deepEqual(getConfigLimits(), {bytes: 1048576, depth: 100, collection: 10000});
	t.is(getManifestMaxBytes(), 4194304);
	t.is(getJsonMaxDepth(), 100);
	process.env.UI5_CONFIG_MAX_BYTES = "12";
	process.env.UI5_CONFIG_MAX_DEPTH = "3";
	process.env.UI5_CONFIG_MAX_COLLECTION = "4";
	process.env.UI5_MANIFEST_MAX_BYTES = "56";
	process.env.UI5_JSON_MAX_DEPTH = "7";
	t.deepEqual(getConfigLimits(), {bytes: 12, depth: 3, collection: 4});
	t.is(getManifestMaxBytes(), 56);
	t.is(getJsonMaxDepth(), 7);
});

for (const value of ["", " ", "0", "-1", "1.5", "NaN", "Infinity", "12bytes", "1e3", "9007199254740992"]) {
	test.serial(`Reject invalid limit ${JSON.stringify(value)}`, (t) => {
		setLimit(t, "UI5_JSON_MAX_DEPTH", value);
		t.throws(() => getJsonMaxDepth(), {
			code: "ERR_CONFIG_INVALID_LIMIT",
			message: `Invalid UI5_JSON_MAX_DEPTH: expected a positive safe integer, received '${value}'`
		});
	});
}

test("Byte limit includes its boundary", (t) => {
	const options = {input: "ui5.yaml", limit: 10};
	t.notThrows(() => assertMaxBytes(0, options));
	t.notThrows(() => assertMaxBytes(10, options));
	t.throws(() => assertMaxBytes(11, options), {
		code: "ERR_CONFIG_TOO_LARGE",
		message: "Configuration file 'ui5.yaml' exceeds the maximum size of 10 bytes (11 bytes)"
	});
});

test("Resource byte check runs before content access", async (t) => {
	const getString = sinon.stub().resolves("hello");
	const resource = {getSize: async () => 5, getString};
	await t.throwsAsync(readResourceString(resource, {input: "manifest.json", limit: 4}), {
		code: "ERR_CONFIG_TOO_LARGE"
	});
	t.false(getString.called);
	t.is(await readResourceString(resource, {input: "manifest.json", limit: 5}), "hello");
});

test("JSON depth counts objects and arrays with an inclusive boundary", (t) => {
	const options = {input: "manifest.json", limit: 2};
	for (const value of ["{\"a\":[]}", "[[1]]", "{\"a\":{}}", "[]", "null", "\"text\""]) {
		t.notThrows(() => assertJsonDepth(value, options));
	}
	for (const value of ["{\"a\":[{}]}", "[[[]]]", "[".repeat(20000) + "0" + "]".repeat(20000)]) {
		t.throws(() => assertJsonDepth(value, options), {
			code: "ERR_CONFIG_TOO_DEEP",
			message: "Configuration file 'manifest.json' exceeds the maximum JSON nesting depth of 2"
		});
	}
});

test("JSON depth skips quoted brackets, escaped quotes and backslashes", (t) => {
	const options = {input: "manifest.json", limit: 1};
	for (const text of ["]]]]", "[[{{", "\"", "\\", "\\\"[[", "\\\\", "a\"}b"]) {
		t.notThrows(() => assertJsonDepth(JSON.stringify({a: text}), options));
	}
	const nested = JSON.stringify({a: String.fromCharCode(92), b: []});
	t.throws(() => assertJsonDepth(nested, options), {code: "ERR_CONFIG_TOO_DEEP"});
});

test("Collection limit checks nested arrays and free-form objects", (t) => {
	const options = {input: "ui5.yaml", limit: 2};
	t.notThrows(() => assertCollectionSize({a: [null, {x: 1, y: 2}], b: false}, options));
	for (const [value, detail] of [
		[{customConfiguration: {wide: [1, 2, 3]}}, "3 array entries"],
		[{customConfiguration: {a: 1, b: 2, c: 3}}, "3 object properties"]
	]) {
		t.throws(() => assertCollectionSize(value, options), {
			code: "ERR_CONFIG_COLLECTION_TOO_LARGE",
			message: `Configuration file 'ui5.yaml' exceeds the maximum collection size of 2 (${detail})`
		});
	}
});

test("Collection walk handles deep structures and shared or cyclic references", (t) => {
	let value = {};
	for (let i = 0; i < 20000; i++) {
		value = {next: value};
	}
	t.notThrows(() => assertCollectionSize(value, {input: "ui5.yaml", limit: 2}));
	const shared = [value];
	shared.push(shared);
	t.notThrows(() => assertCollectionSize([shared, shared], {input: "ui5.yaml", limit: 2}));
});
