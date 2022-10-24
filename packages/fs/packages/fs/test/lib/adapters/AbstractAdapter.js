import test from "ava";
import AbstractAdapter from "../../../lib/adapters/AbstractAdapter.js";

class MyAbstractAdapter extends AbstractAdapter {}

test("_migrateResource", async (t) => {
	const resource = {
		_path: "/test.js"
	};

	const writer = new MyAbstractAdapter({
		virBasePath: "/"
	});

	const migratedResource = await writer._migrateResource(resource);

	t.is(migratedResource.getPath(), "/test.js");
});
