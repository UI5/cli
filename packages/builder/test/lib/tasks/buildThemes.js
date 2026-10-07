import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import {deserializeResources} from "../../../lib/processors/themeBuilderWorker.js";
import runSteps from "../../../lib/tasks/runSteps.js";
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
	t.context.comboByPath = sinon.stub().resolves(null);
	t.context.ReaderCollectionPrioritizedStub.returns({
		byGlob: t.context.comboByGlob,
		byPath: t.context.comboByPath
	});

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

	const lessResource = {getPath: () => "/resources/test/library.source.less"};

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

	await runSteps(buildThemes, {
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

	const lessResource = {getPath: () => "/resources/test/library.source.less"};

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

	await runSteps(buildThemes, {
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
		}
	}, "Processor should be called with expected arguments");

	t.is(workspace.write.callCount, 3,
		"workspace.write should be called 3 times");
	t.true(workspace.write.calledWithExactly(cssResource));
	t.true(workspace.write.calledWithExactly(cssRtlResource));
	t.true(workspace.write.calledWithExactly(jsonParametersResource));
});

test.serial("buildThemes (filtering libraries)", async (t) => {
	t.plan(5);

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

	// Per theme, isThemeAvailable probes the library markers by path. lib1 and lib3 have a marker;
	// lib2 does not, so its theme is skipped.
	t.context.comboByPath.callsFake(async (p) =>
		Object.values(dotLibraryResources).find((res) => res.getPath() === p) ?? null);

	// One step per surviving theme; a fresh result per call so concurrent writes stay independent.
	t.context.themeBuilderStub.callsFake(() => [{}]);

	await runSteps(buildThemes, {
		workspace,
		options: {
			projectName: "sap.ui.test.lib1",
			inputPattern: "/resources/**/themes/*/library.source.less",
			librariesPattern: "/resources/**/(*.library|library.js)"
		}
	});

	t.is(t.context.themeBuilderStub.callCount, 2,
		"Processor should be called once per surviving theme");

	const processed = t.context.themeBuilderStub.getCalls().map((call) => call.args[0].resources[0]);
	t.true(processed.includes(lessResources["sap/ui/lib1/themes/theme1/library.source.less"]),
		"lib1 theme was built");
	t.true(processed.includes(lessResources["sap/ui/lib3/themes/theme1/library.source.less"]),
		"lib3 theme was built");
	t.false(processed.includes(lessResources["sap/ui/lib2/themes/theme1/library.source.less"]),
		"lib2 theme was skipped (no library marker)");

	t.is(workspace.write.callCount, 2,
		"workspace.write should be called once per surviving theme");
});

test.serial("buildThemes (filtering themes)", async (t) => {
	t.plan(5);

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

	// One step per surviving theme; a fresh result per call so concurrent writes stay independent.
	t.context.themeBuilderStub.callsFake(() => [{}]);

	await runSteps(buildThemes, {
		workspace,
		options: {
			projectName: "sap.ui.test.lib1",
			inputPattern: "/resources/**/themes/*/library.source.less",
			themesPattern: "/resources/sap/ui/core/themes/*"
		}
	});

	t.is(t.context.themeBuilderStub.callCount, 2,
		"Processor should be called once per surviving theme");

	const processed = t.context.themeBuilderStub.getCalls().map((call) => call.args[0].resources[0]);
	t.true(processed.includes(lessResources["sap/ui/lib1/themes/theme1/library.source.less"]),
		"theme1 was built");
	t.true(processed.includes(lessResources["sap/ui/lib1/themes/theme3/library.source.less"]),
		"theme3 was built");
	t.false(processed.includes(lessResources["sap/ui/lib1/themes/theme2/library.source.less"]),
		"theme2 was skipped (no sap.ui.core theme folder)");

	t.is(workspace.write.callCount, 2,
		"workspace.write should be called once per surviving theme");
});

test.serial("buildThemes (filtering libraries + themes)", async (t) => {
	t.plan(6);

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
		.withArgs("/resources/sap/ui/core/themes/*", {nodir: false}).resolves([
			baseThemes["sap/ui/core/themes/theme1/"],
			baseThemes["sap/ui/core/themes/theme3/"]
		]);
	t.context.comboByPath.callsFake(async (p) =>
		Object.values(dotLibraryResources).find((res) => res.getPath() === p) ?? null);

	// One step per surviving theme; a fresh result per call so concurrent writes stay independent.
	t.context.themeBuilderStub.callsFake(() => [{}]);

	await runSteps(buildThemes, {
		workspace,
		options: {
			projectName: "sap.ui.test.lib1",
			inputPattern: "/resources/**/themes/*/library.source.less",
			librariesPattern: "/resources/**/(*.library|library.js)",
			themesPattern: "/resources/sap/ui/core/themes/*"
		}
	});

	t.is(t.context.themeBuilderStub.callCount, 4,
		"Processor should be called once per surviving theme");

	const processed = t.context.themeBuilderStub.getCalls().map((call) => call.args[0].resources[0]);
	// Surviving: an available library (lib1, lib3) crossed with an available theme (theme1, theme3).
	t.true(processed.includes(lessResources["sap/ui/lib1/themes/theme1/library.source.less"]), "lib1 theme1");
	t.true(processed.includes(lessResources["sap/ui/lib1/themes/theme3/library.source.less"]), "lib1 theme3");
	t.true(processed.includes(lessResources["sap/ui/lib3/themes/theme1/library.source.less"]), "lib3 theme1");
	t.true(processed.includes(lessResources["sap/ui/lib3/themes/theme3/library.source.less"]), "lib3 theme3");

	t.is(workspace.write.callCount, 4,
		"workspace.write should be called once per surviving theme");
});

test.serial("buildThemes (useWorkers = true)", async (t) => {
	t.plan(4);

	const taskUtilMock = {
		registerCleanupTask: sinon.stub()
	};
	const lessResource = {
		getPath: () => "/resources/test/library.source.less",
		getBuffer: () => Buffer.from("/** test comment */")
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

	await runSteps(buildThemes, {
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

	// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
	const cleanupTask = taskUtilMock.registerCleanupTask.getCall(0).args[0];
	await cleanupTask();
});

test.serial("buildThemes with taskUtil and unexpected termination of the workerpool", async (t) => {
	const taskUtilMock = {
		registerCleanupTask: sinon.stub().callsFake((cb) => {
			// Terminate the workerpool in a timeout, so that
			// the task is already in the queue, but not yet finished.
			setTimeout(cb);
		})
	};
	const lessResources = [];

	// Create more resources so there to be some pending tasks in the pool
	for (let i = 0; i < 50; i++) {
		lessResources.push({
			getPath: () => `/resources/test${i}/themes/${i}/library.source.less`,
			getBuffer: () => Buffer.from(`/** test comment N ${i} */`),
		});
	}

	const workspace = {
		byGlob: async (globPattern) => {
			if (globPattern === "/resources/test*/themes/**/library.source.less") {
				return lessResources;
			} else {
				return [];
			}
		},
		write: sinon.stub()
	};

	const cssResource = {path: "/cssResource", buffer: new Uint8Array(2)};
	const cssRtlResource = {path: "/cssRtlResource", buffer: new Uint8Array(2)};
	const jsonParametersResource = {path: "/jsonParametersResource", buffer: new Uint8Array(2)};

	t.context.themeBuilderStub.returns([cssResource, cssRtlResource, jsonParametersResource]);
	t.context.comboByGlob.resolves(lessResources);

	t.context.fsInterfaceStub.returns({
		readFile: (...args) => {
			if (/\/resources\/test.*\/themes\/.*\/library\.source\.less/i.test(args[0])) {
				args[args.length - 1](null, "/** */");
			} else {
				args[args.length - 1](null, "{}");
			}
		},
		stat: (...args) => args[args.length - 1](null, {}),
		readdir: (...args) => args[args.length - 1](null, {}),
		mkdir: (...args) => args[args.length - 1](null, {}),
	});

	await runSteps(buildThemes, {
		workspace,
		taskUtil: taskUtilMock,
		options: {
			projectName: "sap.ui.demo.app",
			inputPattern: "/resources/test*/themes/**/library.source.less"
		}
	});

	t.pass("No exception from an earlier workerpool termination attempt.");

	// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
	const cleanupTask = taskUtilMock.registerCleanupTask.getCall(0).args[0];
	await cleanupTask();
});
