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

test.serial("empty resources (sap.ui.core)", async (t) => {
	const {generateResourcesJson, resourceListCreatorStub} = t.context;

	const result = await generateResourcesJson({
		workspace: createWorkspace(),
		dependencies: undefined,
		options: {
			projectName: "sap.ui.core"
		}
	});
	t.deepEqual(result, undefined, "no resources returned");
	t.is(resourceListCreatorStub.callCount, 1);
	const expectedOptions = {
		externalResources: {
			"sap/ui/core": [
				"*",
				"sap/base/",
				"sap/ui/"
			]
		},
		mergedResourcesFilters: [
			"jquery-sap*.js",
			"sap-ui-core*.js",
			"**/Component-preload.js",
			"**/library-preload.js",
			"**/library-preload-dbg.js",
			"**/library-preload.json",
			"**/library-all.js",
			"**/library-all-dbg.js",
			"**/designtime/library-preload.designtime.js",
			"**/library-preload.support.js"
		]
	};
	t.deepEqual(resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
});

test.serial("empty resources (my.lib)", async (t) => {
	const generateResourcesJson = require("../../../lib/tasks/generateResourcesJson");

	const result = await generateResourcesJson({
		workspace: createWorkspace(),
		dependencies: undefined,
		options: {
			projectName: "my.lib"
		}
	});
	t.deepEqual(result, undefined, "no resources returned");
	t.is(t.context.resourceListCreatorStub.callCount, 1);
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
	t.deepEqual(result, undefined, "no resources returned");
	t.is(t.context.resourceListCreatorStub.callCount, 1);
	const expectedOptions = {};
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
	t.is(t.context.resourceListCreatorStub.getCall(0).args[0].dependencyResources, dependencyResources,
		"dependencyResources reference should be passed to resourceListCreator");
});
