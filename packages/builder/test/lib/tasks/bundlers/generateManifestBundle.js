const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const chai = require("chai");
chai.use(require("chai-fs"));
const generateManifestBundle = require("../../../../lib/tasks/bundlers/generateManifestBundle");

test.serial("generateManifestBundle", async (t) => {
	const byGlobStub = sinon.stub().resolves(["some resource", "some other resource"]);
	const writeStub = sinon.stub().resolves();
	const workspace = {
		byGlob: byGlobStub,
		write: writeStub
	};

	const manifestBundlerStub = sinon.stub().resolves(["some new resource", "some other new resource"]);
	mock("../../../../lib/processors/bundlers/manifestBundler", manifestBundlerStub);
	const generateManifestBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateManifestBundle");


	await generateManifestBundle({
		workspace,
		options: {
			projectName: "some project",
			namespace: "some/project"
		}
	});
	t.is(byGlobStub.callCount, 1, "workspace.byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "/resources/some/project/**/{manifest.json,*.properties}",
		"workspace.byGlob got called with the correct arguments");

	t.is(manifestBundlerStub.callCount, 1, "manifestBundler got called once");
	t.deepEqual(manifestBundlerStub.getCall(0).args[0], {
		resources: ["some resource", "some other resource"],
		options: {
			descriptor: "manifest.json",
			propertiesExtension: ".properties",
			bundleName: "manifest-bundle.zip",
			namespace: "some/project"
		}
	}, "manifestBundler got called with the correct arguments");

	t.is(writeStub.callCount, 2, "workspace.write got called twice");
	t.is(writeStub.getCall(0).args[0], "some new resource",
		"workspace.write got called with the correct arguments");
	t.is(writeStub.getCall(1).args[0], "some other new resource",
		"workspace.write got called with the correct arguments");

	mock.stop("../../../../lib/processors/bundlers/manifestBundler");
});

test.serial("generateManifestBundle with no resources", async (t) => {
	const byGlobStub = sinon.stub().resolves([]);
	const workspace = {
		byGlob: byGlobStub
	};

	const manifestBundlerStub = sinon.stub().resolves([]);
	mock("../../../../lib/processors/bundlers/manifestBundler", manifestBundlerStub);
	const generateManifestBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateManifestBundle");


	await generateManifestBundle({
		workspace,
		options: {
			projectName: "some project",
			namespace: "some/project"
		}
	});
	t.is(byGlobStub.callCount, 1, "workspace.byGlob got called once");
	t.is(byGlobStub.getCall(0).args[0], "/resources/some/project/**/{manifest.json,*.properties}",
		"workspace.byGlob got called with the correct arguments");

	t.is(manifestBundlerStub.callCount, 0, "manifestBundler not called");

	mock.stop("../../../../lib/processors/bundlers/manifestBundler");
});

test("generateManifestBundle with missing parameters", async (t) => {
	const error = await t.throwsAsync(generateManifestBundle({}));
	t.is(error.message, "[generateManifestBundle]: One or more mandatory options not provided",
		"Rejected with correct error message");
});
