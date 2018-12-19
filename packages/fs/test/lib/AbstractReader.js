const {test} = require("ava");
const AbstractReader = require("../../lib/AbstractReader");

test("AbstractReader: constructor throws an error", (t) => {
	const error = t.throws(() => {
		new AbstractReader();
	}, TypeError);

	t.is(error.message, "Class 'AbstractReader' is abstract");
});
