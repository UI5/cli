import test from "ava";
import ProjectBuilderOutputStyle from "../../../../lib/build/helpers/ProjectBuilderOutputStyle.js";

test("ProjectBuilderOutputStyle: exports Default, Flat, Namespace", (t) => {
	t.is(ProjectBuilderOutputStyle.Default, "Default");
	t.is(ProjectBuilderOutputStyle.Flat, "Flat");
	t.is(ProjectBuilderOutputStyle.Namespace, "Namespace");
});

test("ProjectBuilderOutputStyle: has exactly three properties", (t) => {
	t.deepEqual(Object.keys(ProjectBuilderOutputStyle).sort(), ["Default", "Flat", "Namespace"]);
});
