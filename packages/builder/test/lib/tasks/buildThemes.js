const test = require("ava");

const sinon = require("sinon");
const mock = require("mock-require");

let buildThemes = require("../../../lib/tasks/buildThemes");

test.before(() => {
	// Enable verbose logging to also cover verbose logging code
	require("@ui5/logger").setLevel("verbose");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.beforeEach((t) => {
	// Stubbing processors/themeBuilder
	t.context.themeBuilderStub = sinon.stub();
	t.context.fsInterfaceStub = sinon.stub(require("@ui5/fs"), "fsInterface");
	t.context.fsInterfaceStub.returns({});

	t.context.ReaderCollectionPrioritizedStub = sinon.stub(require("@ui5/fs"), "ReaderCollectionPrioritized");
	t.context.comboByGlob = sinon.stub();
	t.context.ReaderCollectionPrioritizedStub.returns({byGlob: t.context.comboByGlob});

	mock("@ui5/fs", {
		ReaderCollectionPrioritized: t.context.ReaderCollectionPrioritizedStub,
		fsInterface: t.context.fsInterfaceStub
	});
	mock("../../../lib/processors/themeBuilder", t.context.themeBuilderStub);

	// Re-require tested module
	buildThemes = mock.reRequire("../../../lib/tasks/buildThemes");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
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
			compress: true, // default
			cssVariables: false // default
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
			compress: false,
			cssVariables: false
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 3,
		"workspace.write should be called 3 times");
	t.true(workspace.write.calledWithExactly(cssResource));
	t.true(workspace.write.calledWithExactly(cssRtlResource));
	t.true(workspace.write.calledWithExactly(jsonParametersResource));
});

test.serial("buildThemes (cssVariables = true)", async (t) => {
	t.plan(10);

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
	const cssVariablesSourceResource = {};
	const cssVariablesResource = {};
	const cssSkeletonResource = {};
	const cssSkeletonRtlResource = {};

	t.context.themeBuilderStub.returns([
		cssResource,
		cssRtlResource,
		jsonParametersResource,
		cssVariablesSourceResource,
		cssVariablesResource,
		cssSkeletonResource,
		cssSkeletonRtlResource
	]);

	await buildThemes({
		workspace,
		options: {
			projectName: "sap.ui.demo.app",
			inputPattern: "/resources/test/library.source.less",
			cssVariables: true
		}
	});

	t.deepEqual(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [lessResource],
		fs: {},
		options: {
			compress: true,
			cssVariables: true
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 7,
		"workspace.write should be called 7 times");
	t.true(workspace.write.calledWithExactly(cssResource));
	t.true(workspace.write.calledWithExactly(cssRtlResource));
	t.true(workspace.write.calledWithExactly(jsonParametersResource));
	t.true(workspace.write.calledWithExactly(cssVariablesSourceResource));
	t.true(workspace.write.calledWithExactly(cssVariablesResource));
	t.true(workspace.write.calledWithExactly(cssSkeletonResource));
	t.true(workspace.write.calledWithExactly(cssSkeletonRtlResource));
});

test.serial("buildThemes (filtering libraries)", async (t) => {
	t.plan(3);

	const lessResources = {
		"sap/ui/lib1/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme1/library.source.less")
		},
		"sap/ui/lib2/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib2/themes/theme1/library.source.less")
		},
		"sap/ui/lib3/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib3/themes/theme1/library.source.less")
		}
	};

	const dotLibraryResources = {
		"sap/ui/lib1/.library": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/.library")
		},
		"sap/ui/lib1/library.js": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/library.js")
		},
		"sap/ui/lib3/library.js": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib3/library.js")
		}
	};

	const workspaceByGlob = sinon.stub();
	const workspace = {
		byGlob: workspaceByGlob,
		write: sinon.stub()
	};

	workspaceByGlob
		.withArgs("/resources/**/themes/*/library.source.less").resolves([
			lessResources["sap/ui/lib1/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib2/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme1/library.source.less"]
		]);

	t.context.comboByGlob
		.withArgs("/resources/**/(*.library|library.js)").resolves([
			dotLibraryResources["sap/ui/lib1/.library"],
			dotLibraryResources["sap/ui/lib1/library.js"],
			dotLibraryResources["sap/ui/lib3/library.js"]
		]);

	t.context.themeBuilderStub.returns([{}]);

	await buildThemes({
		workspace,
		options: {
			projectName: "sap.ui.test.lib1",
			inputPattern: "/resources/**/themes/*/library.source.less",
			librariesPattern: "/resources/**/(*.library|library.js)"
		}
	});

	t.deepEqual(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [
			lessResources["sap/ui/lib1/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme1/library.source.less"]
		],
		fs: {},
		options: {
			compress: true,
			cssVariables: false
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 1,
		"workspace.write should be called once");
});

test.serial("buildThemes (filtering themes)", async (t) => {
	t.plan(3);

	const lessResources = {
		"sap/ui/lib1/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme1/library.source.less")
		},
		"sap/ui/lib1/themes/theme2/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme2/library.source.less")
		},
		"sap/ui/lib1/themes/theme3/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme3/library.source.less")
		}
	};

	const baseThemes = {
		"sap/ui/core/themes/theme1/": {
			getPath: sinon.stub().returns("/resources/sap/ui/core/themes/theme1/"),
			getStatInfo: () => {
				return {isDirectory: () => true};
			}
		},
		"sap/ui/core/themes/theme3/": {
			getPath: sinon.stub().returns("/resources/sap/ui/core/themes/theme3/"),
			getStatInfo: () => {
				return {isDirectory: () => true};
			}
		}
	};

	const workspaceByGlob = sinon.stub();
	const workspace = {
		byGlob: workspaceByGlob,
		write: sinon.stub()
	};

	workspaceByGlob
		.withArgs("/resources/**/themes/*/library.source.less").resolves([
			lessResources["sap/ui/lib1/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib1/themes/theme2/library.source.less"],
			lessResources["sap/ui/lib1/themes/theme3/library.source.less"]
		]);

	t.context.comboByGlob
		.withArgs("/resources/sap/ui/core/themes/*", {nodir: false}).resolves([
			baseThemes["sap/ui/core/themes/theme1/"],
			baseThemes["sap/ui/core/themes/theme3/"]
		]);

	t.context.themeBuilderStub.returns([{}]);

	await buildThemes({
		workspace,
		options: {
			projectName: "sap.ui.test.lib1",
			inputPattern: "/resources/**/themes/*/library.source.less",
			themesPattern: "/resources/sap/ui/core/themes/*"
		}
	});

	t.deepEqual(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [
			lessResources["sap/ui/lib1/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib1/themes/theme3/library.source.less"]
		],
		fs: {},
		options: {
			compress: true,
			cssVariables: false
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 1,
		"workspace.write should be called once");
});

test.serial("buildThemes (filtering libraries + themes)", async (t) => {
	t.plan(3);

	const lessResources = {
		"sap/ui/lib1/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme1/library.source.less")
		},
		"sap/ui/lib1/themes/theme2/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme2/library.source.less")
		},
		"sap/ui/lib1/themes/theme3/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/themes/theme3/library.source.less")
		},
		"sap/ui/lib2/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib2/themes/theme1/library.source.less")
		},
		"sap/ui/lib2/themes/theme2/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib2/themes/theme2/library.source.less")
		},
		"sap/ui/lib2/themes/theme3/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib2/themes/theme3/library.source.less")
		},
		"sap/ui/lib3/themes/theme1/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib3/themes/theme1/library.source.less")
		},
		"sap/ui/lib3/themes/theme2/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib3/themes/theme2/library.source.less")
		},
		"sap/ui/lib3/themes/theme3/library.source.less": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib3/themes/theme3/library.source.less")
		}
	};

	const dotLibraryResources = {
		"sap/ui/lib1/.library": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/.library")
		},
		"sap/ui/lib1/library.js": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib1/library.js")
		},
		"sap/ui/lib3/library.js": {
			getPath: sinon.stub().returns("/resources/sap/ui/lib3/library.js")
		}
	};

	const baseThemes = {
		"sap/ui/core/themes/theme1/": {
			getPath: sinon.stub().returns("/resources/sap/ui/core/themes/theme1/"),
			getStatInfo: () => {
				return {isDirectory: () => true};
			}
		},
		"sap/ui/core/themes/theme3/": {
			getPath: sinon.stub().returns("/resources/sap/ui/core/themes/theme3/"),
			getStatInfo: () => {
				return {isDirectory: () => true};
			}
		}
	};

	const workspaceByGlob = sinon.stub();
	const workspace = {
		byGlob: workspaceByGlob,
		write: sinon.stub()
	};

	workspaceByGlob
		.withArgs("/resources/**/themes/*/library.source.less").resolves([
			lessResources["sap/ui/lib1/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib1/themes/theme2/library.source.less"],
			lessResources["sap/ui/lib1/themes/theme3/library.source.less"],
			lessResources["sap/ui/lib2/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib2/themes/theme2/library.source.less"],
			lessResources["sap/ui/lib2/themes/theme3/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme2/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme3/library.source.less"]
		]);

	t.context.comboByGlob
		.withArgs("/resources/**/(*.library|library.js)").resolves([
			dotLibraryResources["sap/ui/lib1/.library"],
			dotLibraryResources["sap/ui/lib1/library.js"],
			dotLibraryResources["sap/ui/lib3/library.js"]
		])
		.withArgs("/resources/sap/ui/core/themes/*", {nodir: false}).resolves([
			baseThemes["sap/ui/core/themes/theme1/"],
			baseThemes["sap/ui/core/themes/theme3/"]
		]);

	t.context.themeBuilderStub.returns([{}]);

	await buildThemes({
		workspace,
		options: {
			projectName: "sap.ui.test.lib1",
			inputPattern: "/resources/**/themes/*/library.source.less",
			librariesPattern: "/resources/**/(*.library|library.js)",
			themesPattern: "/resources/sap/ui/core/themes/*"
		}
	});

	t.deepEqual(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [
			lessResources["sap/ui/lib1/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib1/themes/theme3/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme1/library.source.less"],
			lessResources["sap/ui/lib3/themes/theme3/library.source.less"]
		],
		fs: {},
		options: {
			compress: true,
			cssVariables: false
		}
	}, "Processor should be called with expected arguments");

	t.deepEqual(workspace.write.callCount, 1,
		"workspace.write should be called once");
});
