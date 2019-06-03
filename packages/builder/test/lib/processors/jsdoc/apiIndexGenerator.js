const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const apiIndexGenerator = require("../../../../lib/processors/jsdoc/apiIndexGenerator");

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("apiIndexGenerator", async (t) => {
	const createApiIndexStub = sinon.stub().resolves({
		"/some/path/api-index.json": "resource content A",
		"/some/path/api-index-deprecated.json": "resource content B",
		"/some/path/api-index-experimental.json": "resource content C",
		"/some/path/api-index-since.json": "resource content D"
	});
	mock("../../../../lib/processors/jsdoc/lib/create-api-index", createApiIndexStub);
	const createResourceStub = sinon.stub(require("@ui5/fs").resourceFactory, "createResource")
		.onCall(0).returns("result resource A")
		.onCall(1).returns("result resource B")
		.onCall(2).returns("result resource C")
		.onCall(3).returns("result resource D");

	const apiIndexGenerator = mock.reRequire("../../../../lib/processors/jsdoc/apiIndexGenerator");

	const res = await apiIndexGenerator({
		versionInfoPath: "/some/path/sap-ui-version.json",
		testResourcesRootPath: "/some/test-resources/path",
		targetApiIndexPath: "/some/path/api-index.json",
		targetApiIndexDeprecatedPath: "/some/path/api-index-deprecated.json",
		targetApiIndexExperimentalPath: "/some/path/api-index-experimental.json",
		targetApiIndexSincePath: "/some/path/api-index-since.json",
		fs: "custom fs"
	});

	t.deepEqual(res.length, 4, "Returned one resource");
	t.deepEqual(res[0], "result resource A", "Returned correct resource");
	t.deepEqual(res[1], "result resource B", "Returned correct resource");
	t.deepEqual(res[2], "result resource C", "Returned correct resource");
	t.deepEqual(res[3], "result resource D", "Returned correct resource");

	t.deepEqual(createApiIndexStub.callCount, 1, "create-api-index called once");
	t.deepEqual(createApiIndexStub.getCall(0).args[0], "/some/path/sap-ui-version.json",
		"create-api-index called with correct argument #1");
	t.deepEqual(createApiIndexStub.getCall(0).args[1], "/some/test-resources/path",
		"create-api-index called with correct argument #2");
	t.deepEqual(createApiIndexStub.getCall(0).args[2], "/some/path/api-index.json",
		"create-api-index called with correct argument #3");
	t.deepEqual(createApiIndexStub.getCall(0).args[3], "/some/path/api-index-deprecated.json",
		"create-api-index called with correct argument #4");
	t.deepEqual(createApiIndexStub.getCall(0).args[4], "/some/path/api-index-experimental.json",
		"create-api-index called with correct argument #5");
	t.deepEqual(createApiIndexStub.getCall(0).args[5], "/some/path/api-index-since.json",
		"create-api-index called with correct argument #6");
	t.deepEqual(createApiIndexStub.getCall(0).args[6], {
		fs: "custom fs",
		returnOutputFiles: true
	}, "create-api-index called with correct argument #7");

	t.deepEqual(createResourceStub.callCount, 4, "createResource called once");
	t.deepEqual(createResourceStub.getCall(0).args[0], {
		path: "/some/path/api-index.json",
		string: "resource content A"
	}, "createResource called with correct arguments for resource 1");
	t.deepEqual(createResourceStub.getCall(1).args[0], {
		path: "/some/path/api-index-deprecated.json",
		string: "resource content B"
	}, "createResource called with correct arguments for resource 2");
	t.deepEqual(createResourceStub.getCall(2).args[0], {
		path: "/some/path/api-index-experimental.json",
		string: "resource content C"
	}, "createResource called with correct arguments for resource 3");
	t.deepEqual(createResourceStub.getCall(3).args[0], {
		path: "/some/path/api-index-since.json",
		string: "resource content D"
	}, "createResource called with correct arguments for resource 4");

	mock.stop("../../../../lib/processors/jsdoc/lib/create-api-index");
});

test("apiIndexGenerator missing parameters", async (t) => {
	const error = await t.throwsAsync(apiIndexGenerator());
	t.deepEqual(error.message, "[apiIndexGenerator]: One or more mandatory parameters not provided",
		"Correct error message thrown");
});
