import test from "ava";
import AbstractReaderWriter from "../../lib/AbstractReaderWriter.js";

test("AbstractReaderWriter: constructor throws an error", (t) => {
	t.throws(() => {
		new AbstractReaderWriter();
	}, {
		instanceOf: TypeError,
		message: "Class 'AbstractReaderWriter' is abstract"
	});
});

test("Incomplete AbstractReaderWriter subclass: Abstract functions throw error", (t) => {
	class Dummy extends AbstractReaderWriter {}

	const instance = new Dummy();

	t.throws(() => {
		instance._write();
	}, {
		instanceOf: Error,
		message: "Not implemented"
	});
});

