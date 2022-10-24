import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import chai from "chai";
import chaiFS from "chai-fs";
chai.use(chaiFS);
import generateManifestBundle from "../../../../lib/tasks/bundlers/generateManifestBundle.js";

test.serial("generateManifestBundle", async (t) => {
	const byGlobStub = sinon.stub().resolves(["some resource", "some other resource"]);
	const writeStub = sinon.stub().resolves();
	const workspace = {
		byGlob: byGlobStub,
		write: writeStub
	};
	const manifestBundlerStub = sinon.stub().resolves(["some new resource", "some other new resource"]);
	const generateManifestBundle = await esmock("../../../../lib/tasks/bundlers/generateManifestBundle.js", {
		"../../../../lib/processors/bundlers/manifestBundler": manifestBundlerStub
	});

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
});

test.serial("generateManifestBundle with no resources", async (t) => {
	const byGlobStub = sinon.stub().resolves([]);
	const workspace = {
		byGlob: byGlobStub
	};

	const manifestBundlerStub = sinon.stub().resolves([]);
	const generateManifestBundle = await esmock("../../../../lib/tasks/bundlers/generateManifestBundle.js", {
		"../../../../lib/processors/bundlers/manifestBundler": manifestBundlerStub
	});

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
});

test("generateManifestBundle with missing parameters", async (t) => {
	const error = await t.throwsAsync(generateManifestBundle({}));
	t.is(error.message, "[generateManifestBundle]: One or more mandatory options not provided",
		"Rejected with correct error message");
});
