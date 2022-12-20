import test from "ava";
import AbstractAdapter from "../../../lib/adapters/AbstractAdapter.js";
import {createResource} from "../../../lib/resourceFactory.js";

class MyAbstractAdapter extends AbstractAdapter { }

test("_migrateResource", async (t) => {
	// Any JS object which might be a kind of resource
	const resource = {
		_path: "/test.js"
	};

	const writer = new MyAbstractAdapter({
		virBasePath: "/"
	});

	const migratedResource = await writer._migrateResource(resource);

	t.is(migratedResource.getPath(), "/test.js");
});

test("Write resource with another project than provided in the adapter", (t) => {
	const resource = createResource({
		path: "/test.js",
		project: {
			getName: () => "test.lib",
			getVersion: () => "2.0.0"
		}
	});

	const writer = new MyAbstractAdapter({
		virBasePath: "/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	const error = t.throws(() => writer._write(resource));
	t.is(error.message,
		"Unable to write resource associated with project test.lib into adapter of project test.lib1: /test.js");
});

test("Create a resource with a path not starting with path configured in the adapter", (t) => {
	const resource = createResource({
		path: "/dest2/tmp/test.js",
		string: "MyContent"
	});

	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	const error = t.throws(() => writer._write(resource));
	t.is(error.message,
		"The path of the resource '/dest2/tmp/test.js' does not start with the configured " +
			"virtual base path of the adapter '/dest2/writer/'");
});
