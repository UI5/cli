import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		warn: sinon.stub()
	};

	t.context.bootstrapHtmlTransformerStub = sinon.stub();

	t.context.transformBootstrapHtml = await esmock("../../../lib/tasks/transformBootstrapHtml.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:tasks:transformBootstrapHtml").returns(t.context.log)
		},
		"../../../lib/processors/bootstrapHtmlTransformer": t.context.bootstrapHtmlTransformerStub,
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("Transforms index.html resource", async (t) => {
	const {transformBootstrapHtml, log} = t.context;

	t.plan(5);

	const resource = {};

	const workspace = {
		byPath: (actualPath) => {
			t.is(actualPath, "/resources/sap/ui/demo/app/index.html",
				"Reads index.html file from application namespace.");
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

	t.is(t.context.bootstrapHtmlTransformerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.bootstrapHtmlTransformerStub.calledWithExactly({
		resources: [resource],
		options: {
			src: "resources/sap-ui-custom.js"
		}
	}), "Processor should be called with expected arguments");

	t.true(log.warn.notCalled, "No warnings should be logged");
});

test.serial("Transforms index.html resource without namespace", async (t) => {
	const {transformBootstrapHtml, log} = t.context;

	t.plan(5);

	const resource = {};

	const workspace = {
		byPath: (actualPath) => {
			t.is(actualPath, "/index.html",
				"Reads index.html file from application namespace.");
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
			projectName: "sap.ui.demo.app"
		}
	});

	t.is(t.context.bootstrapHtmlTransformerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.bootstrapHtmlTransformerStub.calledWithExactly({
		resources: [resource],
		options: {
			src: "resources/sap-ui-custom.js"
		}
	}), "Processor should be called with expected arguments");

	t.true(log.warn.notCalled, "No warnings should be logged");
});

test.serial("No index.html resource exists", async (t) => {
	const {transformBootstrapHtml, log} = t.context;

	t.plan(4);

	const workspace = {
		byPath: (actualPath) => {
			t.is(actualPath, "/resources/sap/ui/demo/app/index.html",
				"Reads index.html file from application namespace.");
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

	t.is(log.warn.callCount, 1, "One warning should be logged");
	t.true(
		log.warn.calledWith(
			`Skipping bootstrap transformation due to missing index.html in project "sap.ui.demo.app".`),
		"Warning about missing index.html file should be logged");
});
