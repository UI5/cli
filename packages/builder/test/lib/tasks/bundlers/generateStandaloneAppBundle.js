const test = require("ava");
const chai = require("chai");
chai.use(require("chai-fs"));
const sinon = require("sinon");
const mock = require("mock-require");

let generateStandaloneAppBundle = require("../../../../lib/tasks/bundlers/generateStandaloneAppBundle");

test.beforeEach((t) => {
	// Stubbing processors/bundlers/moduleBundler
	t.context.moduleBundlerStub = sinon.stub();
	t.context.moduleBundlerStub.resolves(["I am a resource"]);
	mock("../../../../lib/processors/bundlers/moduleBundler", t.context.moduleBundlerStub);

	// Re-require tested module
	generateStandaloneAppBundle = mock.reRequire("../../../../lib/tasks/bundlers/generateStandaloneAppBundle");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

function createDummyResource(id) {
	return {
		getPath: function() {
			return "ponyPath" + id;
		}
	};
}

test.serial("execute module bundler and write results", async (t) => {
	let dummyResourceId = 0;
	const dummyReaderWriter = {
		_byGlob: async function() {
			return [createDummyResource(dummyResourceId++), createDummyResource(dummyResourceId++)];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		options: {
			projectName: "some.project.name",
			namespace: "some/project/namespace"
		}
	};
	await generateStandaloneAppBundle(params);

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2, "moduleBundler should be called once");

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.deepEqual(resources.length, 4, "moduleBundler got supplied with 4 resources");
	t.deepEqual(options.bundleDefinition.sections[0].filters, [
		"jquery.sap.global.js"
	], "Correct filter in first bundle definition section");
	t.deepEqual(options.bundleDefinition.sections[1].filters, [
		"some/project/namespace/",
		"some/project/namespace/**/manifest.json",
		"some/project/namespace/changes/changes-bundle.json",
		"some/project/namespace/changes/flexibility-bundle.json",
		"!some/project/namespace/test/",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
	t.deepEqual(options.bundleDefinition.defaultFileTypes, [
		".js",
		".control.xml",
		".fragment.html",
		".fragment.json",
		".fragment.xml",
		".view.html",
		".view.json",
		".view.xml",
		".properties"
	], "Correct default file types in bundle definition");
});

test.serial("execute module bundler and write results without namespace", async (t) => {
	let dummyResourceId = 0;
	const dummyReaderWriter = {
		_byGlob: async function() {
			return [createDummyResource(dummyResourceId++), createDummyResource(dummyResourceId++)];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		options: {
			projectName: "some.project.name"
		}
	};
	await generateStandaloneAppBundle(params);

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2, "moduleBundler should be called once");

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.deepEqual(resources.length, 4, "moduleBundler got supplied with 4 resources");
	t.deepEqual(options.bundleDefinition.sections[0].filters, [
		"jquery.sap.global.js"
	], "Correct filter in first bundle definition section");
	t.deepEqual(options.bundleDefinition.sections[1].filters, [
		"/",
		"/**/manifest.json",
		"/changes/changes-bundle.json",
		"/changes/flexibility-bundle.json",
		"!/test/",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});


test.serial("execute module bundler and write results in evo mode", async (t) => {
	let dummyResourceId = 0;

	const ui5LoaderDummyResource = {
		getPath: function() {
			return "/resources/ui5loader.js"; // Triggers evo mode
		}
	};
	const dummyReaderWriter = {
		_byGlob: async function() {
			if (dummyResourceId === 0) {
				return [ui5LoaderDummyResource, createDummyResource(dummyResourceId++)];
			}
			return [createDummyResource(dummyResourceId++), createDummyResource(dummyResourceId++)];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		options: {
			projectName: "some.project.name",
			namespace: "some/project/namespace"
		}
	};
	await generateStandaloneAppBundle(params);

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2, "moduleBundler should be called once");

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.deepEqual(resources.length, 4, "moduleBundler got supplied with 4 resources");
	t.deepEqual(options.bundleDefinition.sections[0].filters, [
		"ui5loader-autoconfig.js"
	], "Evo mode active - Correct filter in first bundle definition section");
	t.deepEqual(options.bundleDefinition.sections[1].filters, [
		"some/project/namespace/",
		"some/project/namespace/**/manifest.json",
		"some/project/namespace/changes/changes-bundle.json",
		"some/project/namespace/changes/flexibility-bundle.json",
		"!some/project/namespace/test/",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});
