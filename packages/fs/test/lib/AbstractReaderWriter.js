const {test} = require("ava");
const AbstractReaderWriter = require("../../lib/AbstractReaderWriter");

test("AbstractReaderWriter: constructor throws an error", (t) => {
	const error = t.throws(() => {
		new AbstractReaderWriter();
	}, TypeError);

	t.is(error.message, "Class 'AbstractReaderWriter' is abstract");
});
