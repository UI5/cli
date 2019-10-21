const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");
const sdkTransformer = require("../../../../lib/processors/jsdoc/sdkTransformer");

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("sdkTransformer", async (t) => {
	const transformerStub = sinon.stub().resolves("api.json content");
	mock("../../../../lib/processors/jsdoc/lib/transformApiJson", transformerStub);
	const createResourceStub = sinon.stub(require("@ui5/fs").resourceFactory, "createResource")
		.returns("result resource");

	const sdkTransformer = mock.reRequire("../../../../lib/processors/jsdoc/sdkTransformer");

	const res = await sdkTransformer({
		apiJsonPath: "/some/path/api.json",
		dotLibraryPath: "/some/path/.library",
		targetApiJsonPath: "/some/other/path/api.json",
		dependencyApiJsonPaths: [
			"/some/path/x/api.json",
			"/some/path/y/api.json"
		],
		fs: "custom fs"
	});

	t.deepEqual(res.length, 1, "Returned one resource");
	t.deepEqual(res[0], "result resource", "Returned one resource");

	t.deepEqual(transformerStub.callCount, 1, "generateJsdocConfig called once");
	t.deepEqual(transformerStub.getCall(0).args[0], "/some/path/api.json",
		"transform-apijson-for-sdk called with correct argument #1");
	t.deepEqual(transformerStub.getCall(0).args[1], "/ignore/this/path/resource/will/be/returned",
		"transform-apijson-for-sdk called with correct argument #2");
	t.deepEqual(transformerStub.getCall(0).args[2], "/some/path/.library",
		"transform-apijson-for-sdk called with correct argument #3");
	t.deepEqual(transformerStub.getCall(0).args[3], [
		"/some/path/x/api.json",
		"/some/path/y/api.json"
	], "transform-apijson-for-sdk called with correct argument #4");
	t.deepEqual(transformerStub.getCall(0).args[4], {
		fs: "custom fs",
		returnOutputFiles: true
	}, "transform-apijson-for-sdk called with correct argument #5");

	t.deepEqual(createResourceStub.callCount, 1, "createResource called once");
	t.deepEqual(createResourceStub.getCall(0).args[0], {
		path: "/some/other/path/api.json",
		string: "api.json content"
	}, "createResource called with correct arguments");

	mock.stop("../../../../lib/processors/jsdoc/lib/transformApiJson");
});

test("sdkTransformer missing parameters", async (t) => {
	const error = await t.throwsAsync(sdkTransformer());
	t.deepEqual(error.message, "[sdkTransformer]: One or more mandatory parameters not provided",
		"Correct error message thrown");
});
