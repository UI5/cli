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
	mock.reRequire("../../../lib/processors/resourceListCreator");
});

test.afterEach.always((t) => {
	mock.stop("../../../lib/processors/resourceListCreator");
});

test("empty resources", async (t) => {
	const generateResourcesJson = require("../../../lib/tasks/generateResourcesJson");

	const result = await generateResourcesJson({
		workspace: createWorkspace(),
		dependencies: undefined,
		options: {
			projectName: "sap.ui.core"
		}
	});
	t.deepEqual(result, undefined, "no resources returned");
	t.is(t.context.resourceListCreatorStub.callCount, 1);
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
	t.deepEqual(t.context.resourceListCreatorStub.getCall(0).args[0].options, expectedOptions, "options match");
});
