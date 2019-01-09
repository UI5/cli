const {test} = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

let transformBootstrapHtml = require("../../../lib/tasks/transformBootstrapHtml");

test.beforeEach((t) => {
	// Spying logger of tasks/transformBootstrapHtml
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("builder:tasks:transformBootstrapHtml");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	t.context.logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Stubbing processors/bootstrapHtmlTransformer
	t.context.bootstrapHtmlTransformerStub = sinon.stub();
	mock("../../../lib/processors/bootstrapHtmlTransformer", t.context.bootstrapHtmlTransformerStub);

	// Re-require tested module
	transformBootstrapHtml = mock.reRequire("../../../lib/tasks/transformBootstrapHtml");
});

test.afterEach.always((t) => {
	mock.stop("@ui5/logger");
	mock.stop("../../../lib/processors/bootstrapHtmlTransformer");
	t.context.logWarnSpy.restore();
});

test.serial("Transforms index.html resource", async (t) => {
	t.plan(5);

	const resource = {};

	const workspace = {
		byPath: (actualPath) => {
			t.deepEqual(actualPath, "/resources/sap/ui/demo/app/index.html",
				"Reads index.html file from applicaiton namespace.");
			return Promise.resolve(resource);
		},
		write: (actualResource) => {
			t.deepEqual(actualResource, resource,
				"Expected resource is written back to workspace");
		}
	};

	t.context.bootstrapHtmlTransformerStub.returns([resource]);

	await transformBootstrapHtml({
		workspace,
		options: {
			projectName: "sap.ui.demo.app",
			namespace: "sap/ui/demo/app"
		}
	});

	t.deepEqual(t.context.bootstrapHtmlTransformerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.bootstrapHtmlTransformerStub.calledWithExactly({
		resources: [resource],
		options: {
			src: "resources/sap-ui-custom.js"
		}
	}), "Processor should be called with expected arguments");

	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
});

test.serial("No index.html resource exists", async (t) => {
	t.plan(4);

	const workspace = {
		byPath: (actualPath) => {
			t.deepEqual(actualPath, "/resources/sap/ui/demo/app/index.html",
				"Reads index.html file from applicaiton namespace.");
			return Promise.resolve(null);
		},
		write: () => {
			t.fail("No resources should be written to workspace");
		}
	};

	await transformBootstrapHtml({
		workspace,
		options: {
			projectName: "sap.ui.demo.app",
			namespace: "sap/ui/demo/app"
		}
	});

	t.true(t.context.bootstrapHtmlTransformerStub.notCalled,
		"Processor should not be called");

	t.deepEqual(t.context.logWarnSpy.callCount, 1, "One warning should be logged");
	t.true(t.context.logWarnSpy.calledWith(`Skipping bootstrap transformation due to missing index.html in project "sap.ui.demo.app".`),
		"Warning about missing index.html file should be logged");
});

test.serial("No namespace provided", async (t) => {
	t.plan(3);

	const workspace = {
		byPath: (actualPath) => {
			t.fail("No index.html file should be read from workspace");
		},
		write: () => {
			t.fail("No resources should be written to workspace");
		}
	};

	await transformBootstrapHtml({
		workspace,
		options: {
			projectName: "sap.ui.demo.app"
		}
	});

	t.true(t.context.bootstrapHtmlTransformerStub.notCalled,
		"Processor should not be called");

	t.deepEqual(t.context.logWarnSpy.callCount, 1, "One warning should be logged");
	t.true(t.context.logWarnSpy.calledWith(`Skipping bootstrap transformation due to missing namespace of project "sap.ui.demo.app".`),
		"Warning about missing index.html file should be logged");
});
