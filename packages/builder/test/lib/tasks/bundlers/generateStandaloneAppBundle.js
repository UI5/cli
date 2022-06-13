const test = require("ava");
const chai = require("chai");
chai.use(require("chai-fs"));
const sinon = require("sinon");
const mock = require("mock-require");

let generateStandaloneAppBundle = require("../../../../lib/tasks/bundlers/generateStandaloneAppBundle");

test.beforeEach((t) => {
	// Stubbing processors/bundlers/moduleBundler
	t.context.moduleBundlerStub = sinon.stub();
	t.context.moduleBundlerStub.resolves([{bundle: "I am a resource", sourceMap: "I am a source map"}]);
	mock("../../../../lib/processors/bundlers/moduleBundler", t.context.moduleBundlerStub);

	t.context.taskUtil = {
		getTag: sinon.stub().returns(false),
		setTag: sinon.stub(),
		clearTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		}
	};

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
			return "/resources/ponyPath" + id;
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

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2);

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

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2);

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

	t.deepEqual(t.context.moduleBundlerStub.callCount, 2);

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

test.serial.only("execute module bundler with taskUtil", async (t) => {
	const {taskUtil} = t.context;

	const dummyResource1 = createDummyResource("1.js");
	const dummyResource2 = createDummyResource("2-dbg.js");
	const dummyResource3 = createDummyResource("3.js");
	const dummyResource4 = createDummyResource("4-dbg.js");

	taskUtil.getTag.withArgs(dummyResource1, taskUtil.STANDARD_TAGS.HasDebugVariant).returns(true);
	taskUtil.getTag.withArgs(dummyResource2, taskUtil.STANDARD_TAGS.IsDebugVariant).returns(true);

	const ui5LoaderDummyResource = {
		getPath: function() {
			return "/resources/ui5loader.js"; // Triggers evo mode
		}
	};
	const dummyReaderWriter = {
		_byGlob: async function() {
			return [
				ui5LoaderDummyResource,
				dummyResource1,
				dummyResource2,
				dummyResource3,
				dummyResource4,
			];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		taskUtil,
		options: {
			projectName: "some.project.name",
			namespace: "some/project/namespace"
		}
	};
	await generateStandaloneAppBundle(params);

	t.is(t.context.moduleBundlerStub.callCount, 2);

	t.is(t.context.moduleBundlerStub.getCall(0).args.length, 1);
	t.deepEqual(t.context.moduleBundlerStub.getCall(0).args[0].options, {
		bundleDefinition: {
			defaultFileTypes: [
				".js",
				".control.xml",
				".fragment.html",
				".fragment.json",
				".fragment.xml",
				".view.html",
				".view.json",
				".view.xml",
				".properties",
			],
			name: "sap-ui-custom.js",
			sections: [
				{
					declareModules: false,
					filters: [
						"ui5loader-autoconfig.js",
					],
					mode: "raw",
					resolve: true,
					sort: true,
				},
				{
					filters: [
						"some/project/namespace/",
						"some/project/namespace/**/manifest.json",
						"some/project/namespace/changes/changes-bundle.json",
						"some/project/namespace/changes/flexibility-bundle.json",
						"!some/project/namespace/test/",
						"sap/ui/core/Core.js",
					],
					mode: "preload",
					renderer: true,
					resolve: true,
					resolveConditional: true,
				},
				{
					filters: [
						"sap/ui/core/Core.js",
					],
					mode: "require",
				},
			],
		}
	});

	t.is(t.context.moduleBundlerStub.getCall(1).args.length, 1);
	t.deepEqual(t.context.moduleBundlerStub.getCall(1).args[0].options, {
		bundleDefinition: {
			defaultFileTypes: [
				".js",
				".control.xml",
				".fragment.html",
				".fragment.json",
				".fragment.xml",
				".view.html",
				".view.json",
				".view.xml",
				".properties",
			],
			name: "sap-ui-custom-dbg.js",
			sections: [
				{
					declareModules: false,
					filters: [
						"ui5loader-autoconfig.js",
					],
					mode: "raw",
					resolve: true,
					sort: true,
				},
				{
					filters: [
						"sap/ui/core/Core.js",
					],
					mode: "require",
				},
			],
		},
		bundleOptions: {
			optimize: false
		},
		moduleNameMapping: {
			"/resources/ponyPath2-dbg.js": "ponyPath2.js"
		}
	});
});

test.serial("Error: Failed to resolve non-debug name", async (t) => {
	// NOTE: This scenario is not expected to happen as the "minify" task sets the IsDebugVariant tag
	// only for resources that adhere to the debug file name pattern

	const {taskUtil} = t.context;
	const dummyResource1 = createDummyResource("1.js");
	taskUtil.getTag.withArgs(dummyResource1.getPath(), taskUtil.STANDARD_TAGS.IsDebugVariant).returns(true);

	const dummyReaderWriter = {
		_byGlob: async function() {
			return [
				dummyResource1,
			];
		},
		write: function() {}
	};
	sinon.stub(dummyReaderWriter, "write").resolves();
	const params = {
		workspace: dummyReaderWriter,
		dependencies: dummyReaderWriter,
		taskUtil,
		options: {
			projectName: "some.project.name",
			namespace: "some/project/namespace"
		}
	};

	await t.throwsAsync(generateStandaloneAppBundle(params), {
		message: "Failed to resolve non-debug name for /resources/ponyPath1.js"
	});
});
