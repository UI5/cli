const test = require("ava");

const moduleDefinition = require("../../../../lib/build/definitions/module");

test("Standard build", (t) => {
	const tasks = moduleDefinition({});
	t.is(tasks.size, 0, "No tasks returned");
});
