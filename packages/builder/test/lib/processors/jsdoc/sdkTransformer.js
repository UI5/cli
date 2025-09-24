import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import sdkTransformer from "../../../../lib/processors/jsdoc/sdkTransformer.js";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.transformApiJsonStub = sinon.stub().resolves("api.json content");

	t.context.createResourceStub = sinon.stub().returns("result resource");

	t.context.sdkTransformer = await esmock("../../../../lib/processors/jsdoc/sdkTransformer.js", {
		"../../../../lib/processors/jsdoc/lib/transformApiJson.js": t.context.transformApiJsonStub,
		"@ui5/fs/resourceFactory": {
			createResource: t.context.createResourceStub
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("sdkTransformer", async (t) => {
	const {sdkTransformer, transformApiJsonStub, createResourceStub} = t.context;

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

	t.is(res.length, 1, "Returned one resource");
	t.is(res[0], "result resource", "Returned one resource");

	t.is(transformApiJsonStub.callCount, 1, "generateJsdocConfig called once");
	t.is(transformApiJsonStub.getCall(0).args[0], "/some/path/api.json",
		"transform-apijson-for-sdk called with correct argument #1");
	t.is(transformApiJsonStub.getCall(0).args[1], "/ignore/this/path/resource/will/be/returned",
		"transform-apijson-for-sdk called with correct argument #2");
	t.is(transformApiJsonStub.getCall(0).args[2], "/some/path/.library",
		"transform-apijson-for-sdk called with correct argument #3");
	t.deepEqual(transformApiJsonStub.getCall(0).args[3], [
		"/some/path/x/api.json",
		"/some/path/y/api.json"
	], "transform-apijson-for-sdk called with correct argument #4");
	t.is(transformApiJsonStub.getCall(0).args[4], "",
		"transform-apijson-for-sdk called with correct argument #5");
	t.deepEqual(transformApiJsonStub.getCall(0).args[5], {
		fs: "custom fs",
		returnOutputFiles: true
	}, "transform-apijson-for-sdk called with correct argument #6");

	t.is(createResourceStub.callCount, 1, "createResource called once");
	t.deepEqual(createResourceStub.getCall(0).args[0], {
		path: "/some/other/path/api.json",
		string: "api.json content"
	}, "createResource called with correct arguments");
});

test("sdkTransformer missing parameters", async (t) => {
	const error = await t.throwsAsync(sdkTransformer());
	t.is(error.message, "[sdkTransformer]: One or more mandatory parameters not provided",
		"Correct error message thrown");
});
