import test from "ava";
import TaskInputSet, {normalizeInputValue} from "../../../../../lib/build/cache/index/TaskInputSet.js";

test("normalizeInputValue: passes strings through", (t) => {
	t.is(normalizeInputValue("value"), "value");
	t.is(normalizeInputValue(""), "");
});

test("normalizeInputValue: maps undefined and null to undefined", (t) => {
	t.is(normalizeInputValue(undefined), undefined);
	t.is(normalizeInputValue(null), undefined);
});

test("normalizeInputValue: stringifies primitives", (t) => {
	t.is(normalizeInputValue(true), "true");
	t.is(normalizeInputValue(false), "false");
	t.is(normalizeInputValue(42), "42");
});

test("normalizeInputValue: serializes objects with sorted keys", (t) => {
	// Key order must not matter: both objects normalize to the same string.
	t.is(
		normalizeInputValue({b: 1, a: 2}),
		normalizeInputValue({a: 2, b: 1}),
		"objects with the same entries in different key order normalize equally");
	t.is(normalizeInputValue({a: 2, b: 1}), `{"a":2,"b":1}`);
});

test("normalizeInputValue: keeps array order", (t) => {
	t.is(normalizeInputValue(["b", "a"]), `["b","a"]`);
	t.not(normalizeInputValue(["a", "b"]), normalizeInputValue(["b", "a"]));
});

test("isEmpty: true for no entries, false once entries exist", (t) => {
	t.true(new TaskInputSet().isEmpty());
	t.false(new TaskInputSet([{type: "env", name: "FOO", value: "bar"}]).isEmpty());
});

test("getEntries: returns entries sorted by type then name", (t) => {
	const set = new TaskInputSet([
		{type: "env", name: "B", value: "2"},
		{type: "env", name: "A", value: "1"},
		{type: "isRootProject", name: "", value: "true"},
	]);
	t.deepEqual(set.getEntries(), [
		{type: "env", name: "A", value: "1"},
		{type: "env", name: "B", value: "2"},
		{type: "isRootProject", name: "", value: "true"},
	]);
});

test("constructor: deduplicates by type+name, last value wins", (t) => {
	const set = new TaskInputSet([
		{type: "env", name: "FOO", value: "first"},
		{type: "env", name: "FOO", value: "second"},
	]);
	t.deepEqual(set.getEntries(), [{type: "env", name: "FOO", value: "second"}]);
});

test("getSignature: stable across entry order, sensitive to values", (t) => {
	const a = new TaskInputSet([
		{type: "env", name: "A", value: "1"},
		{type: "env", name: "B", value: "2"},
	]);
	const b = new TaskInputSet([
		{type: "env", name: "B", value: "2"},
		{type: "env", name: "A", value: "1"},
	]);
	t.is(a.getSignature(), b.getSignature(), "entry order does not affect the signature");

	const changed = new TaskInputSet([
		{type: "env", name: "A", value: "1"},
		{type: "env", name: "B", value: "changed"},
	]);
	t.not(a.getSignature(), changed.getSignature(), "a changed value changes the signature");
});

test("getSignature: empty set is a stable, fixed digest", (t) => {
	t.is(new TaskInputSet().getSignature(), new TaskInputSet().getSignature());
	t.not(new TaskInputSet().getSignature(),
		new TaskInputSet([{type: "env", name: "FOO", value: "bar"}]).getSignature());
});

test("getSignature: unset value does not collide with empty string", (t) => {
	const unset = new TaskInputSet([{type: "env", name: "FOO", value: undefined}]);
	const empty = new TaskInputSet([{type: "env", name: "FOO", value: ""}]);
	t.not(unset.getSignature(), empty.getSignature());
});

test("getSignatureWithCurrentValues: resolver re-derives values", (t) => {
	// Recorded values are irrelevant here; only the resolver output feeds the signature.
	const set = new TaskInputSet([
		{type: "project.getVersion", name: "sap.ui.core", value: "1.120.0"},
	]);
	const recorded = set.getSignature();

	const sameValue = set.getSignatureWithCurrentValues(() => "1.120.0");
	t.is(sameValue, recorded, "resolving to the recorded value reproduces the recorded signature");

	const bumped = set.getSignatureWithCurrentValues(() => "2.0.0");
	t.not(bumped, recorded, "resolving to a new value changes the signature");
});

test("getSignatureWithCurrentValues: default resolver reads process.env for env inputs", (t) => {
	const set = new TaskInputSet([{type: "env", name: "UI5_TASK_INPUT_SET_TEST", value: undefined}]);
	t.teardown(() => {
		delete process.env.UI5_TASK_INPUT_SET_TEST;
	});

	delete process.env.UI5_TASK_INPUT_SET_TEST;
	const unsetSig = set.getSignatureWithCurrentValues();

	process.env.UI5_TASK_INPUT_SET_TEST = "now-set";
	const setSig = set.getSignatureWithCurrentValues();

	t.not(unsetSig, setSig, "changing the environment changes the default-resolved signature");
});

test("toCacheObject/fromCache: round-trips entry names and types, drops values", (t) => {
	const set = new TaskInputSet([
		{type: "env", name: "FOO", value: "bar"},
		{type: "project.getVersion", name: "sap.ui.core", value: "1.120.0"},
	]);
	const cacheObject = set.toCacheObject();
	t.is(cacheObject.version, 1);
	t.deepEqual(cacheObject.entries, [
		{type: "env", name: "FOO"},
		{type: "project.getVersion", name: "sap.ui.core"},
	], "values are not persisted");

	const restored = TaskInputSet.fromCache(cacheObject);
	t.deepEqual(restored.getEntries(), [
		{type: "env", name: "FOO", value: undefined},
		{type: "project.getVersion", name: "sap.ui.core", value: undefined},
	], "restored entries carry no value");
});

test("fromCache: null or undefined yields an empty set", (t) => {
	t.true(TaskInputSet.fromCache(null).isEmpty());
	t.true(TaskInputSet.fromCache(undefined).isEmpty());
});

test("fromCache: unsupported version throws", (t) => {
	t.throws(() => TaskInputSet.fromCache({version: 2, entries: []}), {
		message: "Unsupported TaskInputSet version: 2",
	});
});
