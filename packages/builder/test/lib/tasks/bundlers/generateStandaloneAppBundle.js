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

test.serial("execute module bundler and write results", async (t) => {
	const dummyResource = {
		getPath: function() {
			return "ponyPath";
		}
	};
	const dummyReaderWriter = {
		byGlob: async function() {
			return [dummyResource, dummyResource];
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
		"!some/project/namespace/test/",
		"!some/project/namespace/*.html",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});

test.serial("execute module bundler and write results without namespace", async (t) => {
	const dummyResource = {
		getPath: function() {
			return "ponyPath";
		}
	};
	const dummyReaderWriter = {
		byGlob: async function() {
			return [dummyResource, dummyResource];
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
		"!/test/",
		"!/*.html",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});


test.serial("execute module bundler and write results in evo mode", async (t) => {
	const dummyResource = {
		getPath: function() {
			return "/resources/ui5loader.js"; // Triggers evo mode
		}
	};
	const dummyReaderWriter = {
		byGlob: async function() {
			return [dummyResource, dummyResource];
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
		"!some/project/namespace/test/",
		"!some/project/namespace/*.html",
		"sap/ui/core/Core.js"
	], "Correct filter in second bundle definition section");
});
