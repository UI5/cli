const test = require("ava");
const AbstractReader = require("../../lib/AbstractReader");

test("AbstractReader: constructor throws an error", (t) => {
	t.throws(() => {
		new AbstractReader();
	}, {
		instanceOf: TypeError,
		message: "Class 'AbstractReader' is abstract"
	});
});
