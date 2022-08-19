const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");


const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;

function createWorkspace() {
	return resourceFactory.createAdapter({
		virBasePath: "/",
		project: {
			metadata: {
				name: "test.lib"
			},
			version: "2.0.0",
			dependencies: [
				{
					metadata: {
						name: "sap.ui.core"
					},
					version: "1.0.0"
				}
			]
		}
	});
}

function createDependencies() {
	return {
		byGlob: sinon.stub().resolves([])
	};
}

test.beforeEach((t) => {
	t.context.resourceListCreatorStub = sinon.stub();
	t.context.resourceListCreatorStub.returns(Promise.resolve([]));
	mock("../../../lib/processors/resourceListCreator", t.context.resourceListCreatorStub);

	t.context.generateResourcesJson = mock.reRequire("../../../lib/tasks/generateResourcesJson");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("Missing 'dependencies' parameter", async (t) => {
	const {generateResourcesJson} = t.context;

	await t.throwsAsync(generateResourcesJson({
		workspace: createWorkspace(),
		options: {
			projectName: "sap.ui.core"
		}
	}), {
		// Not passing dependencies should result into a TypeError
		name: "TypeError"
	});
});

test.serial("empty resources (sap.ui.core)", async (t) => {
	const {generateResourcesJson, resourceListCreatorStub} = t.context;

	const result = await generateResourcesJson({
		workspace: createWorkspace(),
		dependencies: createDependencies(),
		options: {
			projectName: "sap.ui.core"
		}
	});
	t.is(result, undefined, "no resources returned");
	t.is(resourceListCreatorStub.callCount, 1);
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].resources, [], "no resources are passed");
	const expectedOptions = {
		externalResources: {
			"sap/ui/core": [
				"*",
				"sap/base/",
				"sap/ui/"
			]
		}
	};
	t.deepEqual(resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
});

test.serial("empty resources (my.lib)", async (t) => {
	const generateResourcesJson = require("../../../lib/tasks/generateResourcesJson");

	const result = await generateResourcesJson({
		workspace: createWorkspace(),
		dependencies: createDependencies(),
		options: {
			projectName: "my.lib"
		}
	});
	t.is(result, undefined, "no resources returned");
	t.is(t.context.resourceListCreatorStub.callCount, 1);
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].resources, [], "no resources are passed");
	const expectedOptions = {};
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
});

test.serial("empty resources (my.lib with dependencies)", async (t) => {
	const generateResourcesJson = require("../../../lib/tasks/generateResourcesJson");

	const dependencyResources = [{"dependency": "resources"}];
	const dependencies = {
		byGlob: sinon.stub().resolves(dependencyResources)
	};

	const result = await generateResourcesJson({
		workspace: createWorkspace(),
		dependencies,
		options: {
			projectName: "my.lib"
		}
	});
	t.is(result, undefined, "no resources returned");
	t.is(t.context.resourceListCreatorStub.callCount, 1);
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].resources, [], "no resources are passed");
	const expectedOptions = {};
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
	t.is(t.context.resourceListCreatorStub.getCall(0).args[0].dependencyResources, dependencyResources,
		"dependencyResources reference should be passed to resourceListCreator");
});

test.serial("Resources omitted from build result should be ignored", async (t) => {
	const generateResourcesJson = require("../../../lib/tasks/generateResourcesJson");

	const resource1 = {};
	const resource2 = {};
	const resource3 = {};

	const workspace = createWorkspace();
	workspace.byGlob = sinon.stub().resolves([
		resource1,
		resource2,
		resource3,
	]);

	const dependencyResource1 = {};
	const dependencyResource2 = {};
	const dependencies = {
		byGlob: sinon.stub().resolves([dependencyResource1, dependencyResource2])
	};

	const taskUtil = {
		getTag: sinon.stub(),
		STANDARD_TAGS: {
			OmitFromBuildResult: "TEST-OmitFromBuildResult-TEST"
		}
	};

	// resources
	taskUtil.getTag
		.onCall(0).returns(false)
		.onCall(1).returns(true) // second resource should be filtered out
		.onCall(2).returns(false);

	// dependencyResources
	taskUtil.getTag
		.onCall(3).returns(true) // first dependencyResource should be filtered out
		.onCall(4).returns(false);

	const result = await generateResourcesJson({
		workspace,
		dependencies,
		taskUtil,
		options: {
			projectName: "my.lib"
		}
	});

	t.is(taskUtil.getTag.callCount, 5);
	t.deepEqual(taskUtil.getTag.getCall(0).args, [resource1, "TEST-OmitFromBuildResult-TEST"]);
	t.deepEqual(taskUtil.getTag.getCall(1).args, [resource2, "TEST-OmitFromBuildResult-TEST"]);
	t.deepEqual(taskUtil.getTag.getCall(2).args, [resource3, "TEST-OmitFromBuildResult-TEST"]);
	t.deepEqual(taskUtil.getTag.getCall(3).args, [dependencyResource1, "TEST-OmitFromBuildResult-TEST"]);
	t.deepEqual(taskUtil.getTag.getCall(4).args, [dependencyResource2, "TEST-OmitFromBuildResult-TEST"]);

	t.is(result, undefined, "no resources returned");
	t.is(t.context.resourceListCreatorStub.callCount, 1);
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].resources,
		[resource1, resource3], "only resources 1 and 3 are passed");
	const expectedOptions = {};
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].dependencyResources, [dependencyResource2],
		"dependencyResources reference should be passed to resourceListCreator");
});
