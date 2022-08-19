const test = require("ava");
const sinon = require("sinon");
const Filter = require("../../../lib/readers/Filter");

test("_byGlob: Basic filter", async (t) => {
	const abstractReader = {
		_byGlob: sinon.stub().returns(Promise.resolve(["resource a", "resource b"]))
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Filter({
		reader: abstractReader,
		callback: function(resource) {
			if (resource === "resource a") {
				return false;
			}
			return true;
		}
	});

	const resources = await readerCollection._byGlob("anyPattern", {}, trace);
	t.deepEqual(resources, ["resource b"], "Correct resource in result");
});

test("_byPath: Negative filter", async (t) => {
	const abstractReader = {
		_byPath: sinon.stub().returns(Promise.resolve("resource a"))
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Filter({
		reader: abstractReader,
		callback: function(resource) {
			if (resource === "resource a") {
				return false;
			}
			return true;
		}
	});

	const resource = await readerCollection._byPath("anyPattern", {}, trace);
	t.is(resource, null, "Correct empty result");
});

test("_byPath: Positive filter", async (t) => {
	const abstractReader = {
		_byPath: sinon.stub().returns(Promise.resolve("resource b"))
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Filter({
		reader: abstractReader,
		callback: function(resource) {
			if (resource === "resource a") {
				return false;
			}
			return true;
		}
	});

	const resource = await readerCollection._byPath("anyPattern", {}, trace);
	t.is(resource, "resource b", "Correct resource in result");
});
