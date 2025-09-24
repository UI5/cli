import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import apiIndexGenerator from "../../../../lib/processors/jsdoc/apiIndexGenerator.js";

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

	const createResourceStub = sinon.stub()
		.onCall(0).returns("result resource A")
		.onCall(1).returns("result resource B")
		.onCall(2).returns("result resource C")
		.onCall(3).returns("result resource D");

	const apiIndexGenerator = await esmock("../../../../lib/processors/jsdoc/apiIndexGenerator.js", {
		"../../../../lib/processors/jsdoc/lib/createIndexFiles.js": createApiIndexStub,
		"@ui5/fs/resourceFactory": {
			createResource: createResourceStub
		}
	});

	const res = await apiIndexGenerator({
		versionInfoPath: "/some/path/sap-ui-version.json",
		testResourcesRootPath: "/some/test-resources/path",
		targetApiIndexPath: "/some/path/api-index.json",
		targetApiIndexDeprecatedPath: "/some/path/api-index-deprecated.json",
		targetApiIndexExperimentalPath: "/some/path/api-index-experimental.json",
		targetApiIndexSincePath: "/some/path/api-index-since.json",
		fs: "custom fs"
	});

	t.is(res.length, 4, "Returned one resource");
	t.is(res[0], "result resource A", "Returned correct resource");
	t.is(res[1], "result resource B", "Returned correct resource");
	t.is(res[2], "result resource C", "Returned correct resource");
	t.is(res[3], "result resource D", "Returned correct resource");

	t.is(createApiIndexStub.callCount, 1, "createIndexFiles called once");
	t.is(createApiIndexStub.getCall(0).args[0], "/some/path/sap-ui-version.json",
		"createIndexFiles called with correct argument #1");
	t.is(createApiIndexStub.getCall(0).args[1], "/some/test-resources/path",
		"createIndexFiles called with correct argument #2");
	t.is(createApiIndexStub.getCall(0).args[2], "/some/path/api-index.json",
		"createIndexFiles called with correct argument #3");
	t.is(createApiIndexStub.getCall(0).args[3], "/some/path/api-index-deprecated.json",
		"createIndexFiles called with correct argument #4");
	t.is(createApiIndexStub.getCall(0).args[4], "/some/path/api-index-experimental.json",
		"createIndexFiles called with correct argument #5");
	t.is(createApiIndexStub.getCall(0).args[5], "/some/path/api-index-since.json",
		"createIndexFiles called with correct argument #6");
	t.deepEqual(createApiIndexStub.getCall(0).args[6], {
		fs: "custom fs",
		returnOutputFiles: true
	}, "createIndexFiles called with correct argument #7");

	t.is(createResourceStub.callCount, 4, "createResource called once");
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
});

test("apiIndexGenerator missing parameters", async (t) => {
	const error = await t.throwsAsync(apiIndexGenerator());
	t.is(error.message, "[apiIndexGenerator]: One or more mandatory parameters not provided",
		"Correct error message thrown");
});
