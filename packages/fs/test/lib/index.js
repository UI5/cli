const test = require("ava");
const index = require("../../index");

test("index.js exports all expected modules", (t) => {
	t.truthy(index.adapters.AbstractAdapter, "Module exported");
	t.truthy(index.adapters.FileSystem, "Module exported");
	t.truthy(index.adapters.Memory, "Module exported");

	t.truthy(index.AbstractReader, "Module exported");
	t.truthy(index.AbstractReaderWriter, "Module exported");
	t.truthy(index.DuplexCollection, "Module exported");
	t.truthy(index.fsInterface, "Module exported");
	t.truthy(index.ReaderCollection, "Module exported");
	t.truthy(index.ReaderCollectionPrioritized, "Module exported");
	t.truthy(index.Resource, "Module exported");
	t.truthy(index.ResourceTagCollection, "Module exported");
	t.truthy(index.resourceFactory, "Module exported");
});
