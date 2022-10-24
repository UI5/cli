import test from "ava";
import moduleDefinition from "../../../../lib/build/definitions/module.js";

test("Standard build", (t) => {
	const tasks = moduleDefinition({});
	t.is(tasks.size, 0, "No tasks returned");
});
