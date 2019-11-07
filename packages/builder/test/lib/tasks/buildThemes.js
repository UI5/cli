const test = require("ava");

const sinon = require("sinon");
const mock = require("mock-require");

let buildThemes = require("../../../lib/tasks/buildThemes");

test.beforeEach((t) => {
	// Stubbing processors/themeBuilder
	t.context.themeBuilderStub = sinon.stub();
	t.context.fsInterfaceStub = sinon.stub(require("@ui5/fs"), "fsInterface");
	t.context.fsInterfaceStub.returns({});
	mock("../../../lib/processors/themeBuilder", t.context.themeBuilderStub);

	// Re-require tested module
	buildThemes = mock.reRequire("../../../lib/tasks/buildThemes");
});

test.afterEach.always((t) => {
	t.context.fsInterfaceStub.restore();
	mock.stop("../../../lib/processors/themeBuilder");
});

test.serial("buildThemes", async (t) => {
	t.plan(6);

	const lessResource = {};

	const workspace = {
		byGlob: async (globPattern) => {
			if (globPattern === "/resources/test/library.source.less") {
				return [lessResource];
			} else {
				return [];
			}
		},
		write: sinon.stub()
	};

	const cssResource = {};
	const cssRtlResource = {};
	const jsonParametersResource = {};

	t.context.themeBuilderStub.returns([
		cssResource,
		cssRtlResource,
		jsonParametersResource
	]);

	await buildThemes({
		workspace,
		options: {
			projectName: "sap.ui.demo.app",
			inputPattern: "/resources/test/library.source.less"
		}
	});

	t.deepEqual(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [lessResource],
		fs: {},
		options: {
			compress: true // default
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 3,
		"workspace.write should be called 3 times");
	t.true(workspace.write.calledWithExactly(cssResource));
	t.true(workspace.write.calledWithExactly(cssRtlResource));
	t.true(workspace.write.calledWithExactly(jsonParametersResource));
});


test.serial("buildThemes (compress = false)", async (t) => {
	t.plan(6);

	const lessResource = {};

	const workspace = {
		byGlob: async (globPattern) => {
			if (globPattern === "/resources/test/library.source.less") {
				return [lessResource];
			} else {
				return [];
			}
		},
		write: sinon.stub()
	};

	const cssResource = {};
	const cssRtlResource = {};
	const jsonParametersResource = {};

	t.context.themeBuilderStub.returns([
		cssResource,
		cssRtlResource,
		jsonParametersResource
	]);

	await buildThemes({
		workspace,
		options: {
			projectName: "sap.ui.demo.app",
			inputPattern: "/resources/test/library.source.less",
			compress: false
		}
	});

	t.deepEqual(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [lessResource],
		fs: {},
		options: {
			compress: false
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 3,
		"workspace.write should be called 3 times");
	t.true(workspace.write.calledWithExactly(cssResource));
	t.true(workspace.write.calledWithExactly(cssRtlResource));
	t.true(workspace.write.calledWithExactly(jsonParametersResource));
});
