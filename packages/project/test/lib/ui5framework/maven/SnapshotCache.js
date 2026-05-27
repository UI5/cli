import test from "ava";
import SnapshotCache from "../../../../lib/ui5Framework/maven/SnapshotCache.js";

test("SnapshotCache: exports Default, Force, Off", (t) => {
	t.is(SnapshotCache.Default, "Default");
	t.is(SnapshotCache.Force, "Force");
	t.is(SnapshotCache.Off, "Off");
});

test("SnapshotCache: has exactly three properties", (t) => {
	t.deepEqual(Object.keys(SnapshotCache).sort(), ["Default", "Force", "Off"]);
});
