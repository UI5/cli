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
	class Stub extends AbstractReaderWriter {}

	const instance = new Stub();

	t.throws(() => {
		instance._write();
	}, {
		instanceOf: Error,
		message: "Not implemented"
	});
});

test("AbstractReaderWriter: getName with name", (t) => {
	class Stub extends AbstractReaderWriter {}

	const instance = new Stub("myName");
	t.is(instance.getName(), "myName");
});

test("AbstractReaderWriter: getName without name", (t) => {
	class Stub extends AbstractReaderWriter {}

	const instance = new Stub();
	t.is(instance.getName(), "<unnamed Stub Reader/Writer>");
});

test("AbstractReaderWriter: write delegates to _write", async (t) => {
	class Stub extends AbstractReaderWriter {
		_write(resource, options) {
			return Promise.resolve({resource, options});
		}
	}

	const instance = new Stub("myWriter");
	const resource = {path: "/test.js"};
	const result = await instance.write(resource, {drain: true});

	t.deepEqual(result, {resource, options: {drain: true}});
});

test("AbstractReaderWriter: write uses default options", async (t) => {
	class Stub extends AbstractReaderWriter {
		_write(resource, options) {
			return Promise.resolve(options);
		}
	}

	const instance = new Stub("myWriter");
	const result = await instance.write({});

	t.deepEqual(result, {drain: false, readOnly: false});
});
