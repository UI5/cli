import test from "ava";
import sinon from "sinon";
import Transformer from "../../../lib/readers/Transformer.js";

function getDummyResource(name) {
	return {
		name, // arbitrary attribute to change
		getPath: function() {
			return `/resources/${name}`;
		},
		clone: function() {
			return getDummyResource(name);
		}
	};
}

test("_byGlob: Basic transformation", async (t) => {
	const resourceA = getDummyResource("resource.a");
	const resourceB = getDummyResource("resource.b");
	const abstractReader = {
		_byGlob: sinon.stub().returns(Promise.resolve([resourceA, resourceB]))
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Transformer({
		reader: abstractReader,
		callback: async function(resourcePath, getResource) {
			if (resourcePath === "/resources/resource.a") {
				const resource = await getResource();
				resource.name = "transformed resource.a";
				await getResource(); // additional call should not lead to additional clone
			}
		}
	});

	const resources = await readerCollection._byGlob("anyPattern", {}, trace);
	t.is(resources.length, 2, "Still two resources in result set");
	t.is(resources[0].name, "transformed resource.a", "resource.a has been transformed in result");
	t.is(resources[1].name, "resource.b", "resource.b has not been transformed");
	t.is(resources[1], resourceB, "resource.b instance has not been cloned");
	t.is(resourceA.name, "resource.a", "Original resource.a has not been transformed");
});

test("_byPath: Basic transformation", async (t) => {
	const resourceA = getDummyResource("resource.a");
	const abstractReader = {
		_byPath: sinon.stub().returns(resourceA)
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Transformer({
		reader: abstractReader,
		callback: async function(resourcePath, getResource) {
			const resource = await getResource();
			resource.name = "transformed resource.a";

			await getResource(); // additional call should not lead to additional clone
		}
	});

	const resource = await readerCollection._byPath("anyPattern", {}, trace);

	t.is(resource.name, "transformed resource.a", "resource.a has been transformed in result");
	t.is(resourceA.name, "resource.a", "Original resource.a has not been transformed");
});

test("_byPath: No transformation", async (t) => {
	const resourceB = getDummyResource("resource.b");
	const abstractReader = {
		_byPath: sinon.stub().returns(resourceB)
	};
	const trace = {
		collection: sinon.spy()
	};
	const readerCollection = new Transformer({
		reader: abstractReader,
		callback: async function(resourcePath, getResource) {
			return;
		}
	});

	const resource = await readerCollection._byPath("anyPattern", {}, trace);
	t.is(resource.name, "resource.b", "Correct resource in result");
	t.is(resource, resourceB, "resource.b instance has not been cloned");
});
