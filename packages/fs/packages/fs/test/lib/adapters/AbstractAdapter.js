import test from "ava";
import AbstractAdapter from "../../../lib/adapters/AbstractAdapter.js";
import {createResource} from "../../../lib/resourceFactory.js";

class MyAbstractAdapter extends AbstractAdapter { }

test("Missing paramter: virBasePath", (t) => {
	t.throws(() => {
		new MyAbstractAdapter({});
	}, {
		message: "Unable to create adapter: Missing parameter 'virBasePath'"
	}, "Threw with expected error message");
});

test("virBasePath must be absolute", (t) => {
	t.throws(() => {
		new MyAbstractAdapter({
			virBasePath: "foo"
		});
	}, {
		message: "Unable to create adapter: Virtual base path must be absolute but is 'foo'"
	}, "Threw with expected error message");
});

test("virBasePath must end with a slash", (t) => {
	t.throws(() => {
		new MyAbstractAdapter({
			virBasePath: "/foo"
		});
	}, {
		message: "Unable to create adapter: Virtual base path must end with a slash but is '/foo'"
	}, "Threw with expected error message");
});

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

test("_assignProjectToResource: Resource is already assigned to another project than provided in the adapter", (t) => {
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

	const error = t.throws(() => writer._assignProjectToResource(resource));
	t.is(error.message,
		"Unable to write resource associated with project test.lib into adapter of project test.lib1: /test.js");
});

test("_isPathHandled", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.true(writer._isPathHandled("/dest2/writer/test.js"), "Returned expected result");
	t.true(writer._isPathHandled("/dest2/writer/"), "Returned expected result");
	t.true(writer._isPathHandled("/dest2/writer"), "Returned expected result");
	t.false(writer._isPathHandled("/dest2/write"), "Returned expected result");
	t.false(writer._isPathHandled("/dest2/writerisimo"), "Returned expected result");
	t.false(writer._isPathHandled(""), "Returned expected result");
});
test("_resolveVirtualPathToBase (read mode)", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.is(writer._resolveVirtualPathToBase("/dest2/writer/test.js"), "test.js", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer/../writer/test.js"), "test.js", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer"), "", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer/"), "", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/../../dest2/writer/test.js"), "test.js", "Returned expected path");
});

test("_resolveVirtualPathToBase (read mode): Path does not starting with path configured in the adapter", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.is(writer._resolveVirtualPathToBase("/dest2/tmp/test.js"), null, "Returned null");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer/../reader/"), null, "Returned null");
	t.is(writer._resolveVirtualPathToBase("/dest2/write"), null, "Returned null");
	t.is(writer._resolveVirtualPathToBase("/..//write"), null, "Returned null");
});

test("_resolveVirtualPathToBase (read mode): Path Must be absolute", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.throws(() => writer._resolveVirtualPathToBase("./dest2/write"), {
		message:
			`Failed to resolve virtual path './dest2/write': Path must be absolute`
	}, "Threw with expected error message");
});

test("_resolveVirtualPathToBase (write mode)", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.is(writer._resolveVirtualPathToBase("/dest2/writer/test.js", true), "test.js", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer/../writer/test.js", true), "test.js",
		"Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer", true), "", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/dest2/writer/", true), "", "Returned expected path");
	t.is(writer._resolveVirtualPathToBase("/../../dest2/writer/test.js", true), "test.js", "Returned expected path");
});

test("_resolveVirtualPathToBase (write mode): Path does not starting with path configured in the adapter", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.throws(() => writer._resolveVirtualPathToBase("/dest2/tmp/test.js", true), {
		message:
			`Failed to write resource with virtual path '/dest2/tmp/test.js': ` +
			`Path must start with the configured virtual base path of the adapter. Base path: '/dest2/writer/'`
	}, "Threw with expected error message");

	t.throws(() => writer._resolveVirtualPathToBase("/dest2/writer/../reader", true), {
		message:
			`Failed to write resource with virtual path '/dest2/writer/../reader': ` +
			`Path must start with the configured virtual base path of the adapter. Base path: '/dest2/writer/'`
	}, "Threw with expected error message");

	t.throws(() => writer._resolveVirtualPathToBase("/dest2/write", true), {
		message:
			`Failed to write resource with virtual path '/dest2/write': ` +
			`Path must start with the configured virtual base path of the adapter. Base path: '/dest2/writer/'`
	}, "Threw with expected error message");

	t.throws(() => writer._resolveVirtualPathToBase("/..//write", true), {
		message:
			`Failed to write resource with virtual path '/..//write': ` +
			`Path must start with the configured virtual base path of the adapter. Base path: '/dest2/writer/'`
	}, "Threw with expected error message");
});

test("_resolveVirtualPathToBase (write mode): Path Must be absolute", (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/dest2/writer/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.throws(() => writer._resolveVirtualPathToBase("./dest2/write", true), {
		message:
			`Failed to resolve virtual path './dest2/write': Path must be absolute`
	}, "Threw with expected error message");
});

test("_normalizePattern", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/*/{src,test}/**"), [
		"src/**",
		"test/**"
	], "Returned expected patterns");
});

test("_normalizePattern: Match base directory", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/*"), [""],
		"Returned an empty pattern since the input pattern matches the base directory only");
});

test("_normalizePattern: Match sub-directory", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/path/*"), ["*"],
		"Returned expected patterns");
});

test("_normalizePattern: Match all", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/**/*"), ["**/*"],
		"Returned expected patterns");
});

test("_normalizePattern: Relative path segment above virtual root directory", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/path/../../*"), [],
		"Returned no pattern");
});

test("_normalizePattern: Relative path segment resolving to base directory", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/*/../*"), [""],
		"Returned an empty pattern since the input pattern matches the base directory only");
});

test("_normalizePattern: Relative path segment", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/path/../*"), [""],
		"Returned an empty pattern since the input pattern matches the base directory only");
});

test("_normalizePattern: Relative path segment within base directory, matching all", async (t) => {
	const writer = new MyAbstractAdapter({
		virBasePath: "/path/",
		project: {
			getName: () => "test.lib1",
			getVersion: () => "2.0.0"
		}
	});

	t.deepEqual(await writer._normalizePattern("/path/path2/../**/*"), ["**/*"],
		"Returned expected patterns");
});
