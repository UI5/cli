import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	// Stubbing processors/bundlers/moduleBundler
	t.context.moduleBundlerStub = sinon.stub();
	t.context.moduleBundlerStub.resolves([{bundle: "I am a resource", sourceMap: "I am a source map"}]);

	t.context.createFilterReaderStub = sinon.stub().callsFake((params) => {
		return params.reader;
	});
	t.context.taskUtil = {
		getTag: sinon.stub().returns(false),
		setTag: sinon.stub(),
		clearTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "<HasDebugVariant>",
			IsDebugVariant: "<IsDebugVariant>",
			OmitFromBuildResult: "<OmitFromBuildResult>"
		},
		resourceFactory: {
			createFilterReader: t.context.createFilterReaderStub
		}
	};
	t.context.generateStandaloneAppBundle =
		await esmock("../../../../lib/tasks/bundlers/generateStandaloneAppBundle.js", {
			"../../../../lib/processors/bundlers/moduleBundler.js": t.context.moduleBundlerStub
		});
});

test.afterEach.always((t) => {
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
	const {generateStandaloneAppBundle} = t.context;
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

	t.is(t.context.moduleBundlerStub.callCount, 2);

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.is(resources.length, 4, "moduleBundler got supplied with 4 resources");
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
	const {generateStandaloneAppBundle} = t.context;
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

	t.is(t.context.moduleBundlerStub.callCount, 2);

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.is(resources.length, 4, "moduleBundler got supplied with 4 resources");
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
	const {generateStandaloneAppBundle} = t.context;
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

	t.is(t.context.moduleBundlerStub.callCount, 2);

	const {resources, options} = t.context.moduleBundlerStub.getCall(0).args[0];
	t.is(resources.length, 4, "moduleBundler got supplied with 4 resources");
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

test.serial("execute module bundler with taskUtil", async (t) => {
	const {generateStandaloneAppBundle, taskUtil, createFilterReaderStub, moduleBundlerStub} = t.context;

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

	t.is(taskUtil.getTag.callCount, 5, "TaskUtil#getTag got called six times");

	t.is(createFilterReaderStub.callCount, 2, "Two filter readers have been created");
	t.is(createFilterReaderStub.getCall(0).args[0].reader.getName(),
		"generateStandaloneAppBundle - prioritize workspace over dependencies: some.project.name",
		"Correct reader argument on first createFilterReader call");

	taskUtil.getTag.reset();
	// Execute first filter-reader callback and test side effect on taskUtil
	const filterReaderCallbackRes1 = createFilterReaderStub.getCall(0).args[0].callback("resource");
	t.is(taskUtil.getTag.callCount, 1, "TaskUtil#getTag got called once by callback");
	t.deepEqual(taskUtil.getTag.getCall(0).args, ["resource", "<IsDebugVariant>"],
		"TaskUtil getTag got called with correct argument");
	t.is(filterReaderCallbackRes1, true, "First filter-reader callback returned expected value");

	t.is(createFilterReaderStub.getCall(1).args[0].reader.getName(),
		"generateStandaloneAppBundle - prioritize workspace over dependencies: some.project.name",
		"Correct reader argument on first createFilterReader call");

	taskUtil.getTag.reset();
	// Execute second filter-callback and test side effect on taskUtil
	const filterReaderCallbackRes2 = createFilterReaderStub.getCall(1).args[0].callback("resource");
	t.is(taskUtil.getTag.callCount, 1, "TaskUtil#getTag got called once by callback");
	t.deepEqual(taskUtil.getTag.getCall(0).args, ["resource", "<HasDebugVariant>"],
		"TaskUtil getTag got called with correct argument");
	t.is(filterReaderCallbackRes2, true, "First filter-reader callback returned expected value");


	t.is(moduleBundlerStub.callCount, 2);

	t.is(moduleBundlerStub.getCall(0).args.length, 1);
	t.deepEqual(moduleBundlerStub.getCall(0).args[0].options, {
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

	t.is(moduleBundlerStub.getCall(1).args.length, 1);
	t.deepEqual(moduleBundlerStub.getCall(1).args[0].options, {
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
	const {generateStandaloneAppBundle, taskUtil} = t.context;
	const dummyResource1 = createDummyResource("1.js");
	taskUtil.getTag.withArgs(dummyResource1, taskUtil.STANDARD_TAGS.IsDebugVariant).returns(true);

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
