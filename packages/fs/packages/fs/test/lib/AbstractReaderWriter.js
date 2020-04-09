const test = require("ava");
const AbstractReaderWriter = require("../../lib/AbstractReaderWriter");

test("AbstractReaderWriter: constructor throws an error", (t) => {
	t.throws(() => {
		new AbstractReaderWriter();
	}, {
		instanceOf: TypeError,
		message: "Class 'AbstractReaderWriter' is abstract"
	});
});
