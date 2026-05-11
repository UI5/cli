import test from "ava";
import CacheMode from "../../../../lib/ui5Framework/maven/CacheMode.js";

test("CacheMode: exports Default, Force, Off", (t) => {
	t.is(CacheMode.Default, "Default");
	t.is(CacheMode.Force, "Force");
	t.is(CacheMode.Off, "Off");
});

test("CacheMode: has exactly three properties", (t) => {
	t.deepEqual(Object.keys(CacheMode).sort(), ["Default", "Force", "Off"]);
});
