import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {deserializeResources} from "../../../lib/processors/themeBuilderWorker.js";
let buildThemes;

test.before(async () => {
	// Enable verbose logging to also cover verbose logging code
	const {setLogLevel} = await import("@ui5/logger");
	setLogLevel("verbose");
});

test.beforeEach(async (t) => {
	// Stubbing processors/themeBuilder
	t.context.themeBuilderStub = sinon.stub();
	t.context.fsInterfaceStub = sinon.stub();
	t.context.fsInterfaceStub.returns({});

	t.context.ReaderCollectionPrioritizedStub = sinon.stub();
	t.context.comboByGlob = sinon.stub().resolves([]);
	t.context.ReaderCollectionPrioritizedStub.returns({byGlob: t.context.comboByGlob});

	buildThemes = await esmock.p("../../../lib/tasks/buildThemes.js", {
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"@ui5/fs/ReaderCollectionPrioritized": t.context.ReaderCollectionPrioritizedStub,
		"../../../lib/processors/themeBuilder.js": t.context.themeBuilderStub
	});
});

test.afterEach.always(() => {
	esmock.purge(buildThemes);
	sinon.restore();
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

	t.is(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [lessResource],
		fs: {},
		options: {
			compress: true, // default
			cssVariables: false // default
		}
	}, "Processor should be called with expected arguments");

	t.is(workspace.write.callCount, 3,
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

	t.is(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [lessResource],
		fs: {},
		options: {
			compress: false,
			cssVariables: false
		}
	}, "Processor should be called with expected arguments");

	t.is(workspace.write.callCount, 3,
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

	t.is(t.context.themeBuilderStub.callCount, 1,
		"Processor should be called once");

	t.deepEqual(t.context.themeBuilderStub.getCall(0).args[0], {
		resources: [lessResource],
		fs: {},
		options: {
			compress: true,
			cssVariables: true
		}
	}, "Processor should be called with expected arguments");

	t.is(workspace.write.callCount, 7,
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

	t.is(t.context.themeBuilderStub.callCount, 1,
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

	t.is(workspace.write.callCount, 1,
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

	t.is(t.context.themeBuilderStub.callCount, 1,
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

	t.is(workspace.write.callCount, 1,
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

	t.is(t.context.themeBuilderStub.callCount, 1,
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

	t.is(workspace.write.callCount, 1,
		"workspace.write should be called once");
});

test.serial("buildThemes (useWorkers = true)", async (t) => {
	t.plan(4);

	const taskUtilMock = {
		registerCleanupTask: sinon.stub()
	};
	const lessResource = {
		getPath: () => "/resources/test/library.source.less",
		getBuffer: () => new Buffer("/** test comment */")
	};

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

	const cssResource = {path: "/cssResource", buffer: new Uint8Array(2)};
	const cssRtlResource = {path: "/cssRtlResource", buffer: new Uint8Array(2)};
	const jsonParametersResource = {path: "/jsonParametersResource", buffer: new Uint8Array(2)};

	t.context.comboByGlob.resolves([lessResource]);

	t.context.fsInterfaceStub.returns({
		readFile: (...args) => {
			if (args[0] === "/resources/test/library.source.less") {
				args[args.length - 1](null, "/** */");
			} else {
				args[args.length - 1](null, "{}");
			}
		},
		stat: (...args) => args[args.length - 1](null, {}),
		readdir: (...args) => args[args.length - 1](null, {}),
		mkdir: (...args) => args[args.length - 1](null, {}),
	});

	t.context.themeBuilderStub.returns([
		cssResource,
		cssRtlResource,
		jsonParametersResource
	]);

	await buildThemes({
		workspace,
		taskUtil: taskUtilMock,
		options: {
			projectName: "sap.ui.demo.app",
			inputPattern: "/resources/test/library.source.less"
		}
	});

	const transferredResources = deserializeResources([cssResource, cssRtlResource, jsonParametersResource]);

	t.is(workspace.write.callCount, 3,
		"workspace.write should be called 3 times");
	t.true(workspace.write.calledWithExactly(transferredResources[0]));
	t.true(workspace.write.calledWithExactly(transferredResources[1]));
	t.true(workspace.write.calledWithExactly(transferredResources[2]));
});
