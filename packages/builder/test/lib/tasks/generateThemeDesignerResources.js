const test = require("ava");

const sinon = require("sinon");
const mock = require("mock-require");

test.beforeEach((t) => {
	const ui5Fs = require("@ui5/fs");

	t.context.fsInterfaceStub = sinon.stub(ui5Fs, "fsInterface");
	t.context.fsInterfaceStub.returns({});

	t.context.ReaderCollectionPrioritizedStub = sinon.stub(ui5Fs, "ReaderCollectionPrioritized");
	t.context.ReaderCollectionPrioritizedStub.returns({
		byPath: sinon.stub()
	});

	t.context.ResourceStub = sinon.stub();

	mock("@ui5/fs", {
		ReaderCollectionPrioritized: t.context.ReaderCollectionPrioritizedStub,
		fsInterface: t.context.fsInterfaceStub,
		Resource: t.context.ResourceStub
	});

	t.context.libraryLessGeneratorStub = sinon.stub();

	mock("../../../lib/processors/libraryLessGenerator", t.context.libraryLessGeneratorStub);

	// Re-require tested module
	t.context.generateThemeDesignerResources = mock.reRequire("../../../lib/tasks/generateThemeDesignerResources");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
});

test.serial("generateThemeDesignerResources: Library", async (t) => {
	const {generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub,
		ReaderCollectionPrioritizedStub} = t.context;

	const librarySourceLessResource1 = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/base/library.source.less")
	};
	const librarySourceLessResource2 = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/library.source.less")
	};
	const librarySourceLessResource3 = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/sap_fiori_3/library.source.less")
	};

	const clonedCoreBaseDotThemingResourceStub = {
		setPath: sinon.stub()
	};
	const coreBaseDotThemingResourceStub = {
		clone: sinon.stub().resolves(clonedCoreBaseDotThemingResourceStub)
	};
	ReaderCollectionPrioritizedStub.returns({
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/core/themes/sap_fiori_3/.theming") {
				return coreBaseDotThemingResourceStub;
			} else {
				return null;
			}
		})
	});

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource1, librarySourceLessResource2, librarySourceLessResource3];
			} else {
				return [];
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource1 = {};
	const libraryLessResource2 = {};
	const libraryLessResource3 = {};

	libraryLessGeneratorStub.resolves([libraryLessResource1, libraryLessResource2, libraryLessResource3]);

	await generateThemeDesignerResources({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3",
			namespace: "sap/ui/demo/lib"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	t.deepEqual(t.context.ReaderCollectionPrioritizedStub.getCall(0).args, [{
		name: `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.demo.lib`,
		readers: [workspace, dependencies]
	}]);
	const combo = t.context.ReaderCollectionPrioritizedStub.getCall(0).returnValue;

	t.is(fsInterfaceStub.callCount, 1, "fsInterface should be created once");
	t.deepEqual(fsInterfaceStub.getCall(0).args, [combo], "fsInterface should be created for 'combo'");
	const fs = fsInterfaceStub.getCall(0).returnValue;

	t.is(libraryLessGeneratorStub.callCount, 1);

	t.deepEqual(libraryLessGeneratorStub.getCall(0).args[0], {
		resources: [librarySourceLessResource1, librarySourceLessResource2, librarySourceLessResource3],
		fs,
	}, "libraryLessGenerator processor should be called with expected arguments");

	t.is(ResourceStub.callCount, 3);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(0).args, [{
		path: "/resources/sap/ui/demo/lib/.theming",
		string: JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/demo/lib",
			sVersion: "1.2.3"
		}, null, 2)
	}]);
	const libraryDotTheming = ResourceStub.getCall(0).returnValue;

	t.deepEqual(ResourceStub.getCall(1).args, [{
		path: "/resources/sap/ui/demo/lib/themes/base/.theming",
		string: JSON.stringify({
			sEntity: "Theme",
			sId: "base",
			sVendor: "SAP"
		}, null, 2)
	}]);
	const baseThemeDotTheming = ResourceStub.getCall(1).returnValue;

	t.deepEqual(ResourceStub.getCall(2).args, [{
		path: "/resources/sap/ui/demo/lib/themes/my_theme/.theming",
		string: JSON.stringify({
			sEntity: "Theme",
			sId: "my_theme",
			sVendor: "SAP",
			oExtends: "base"
		}, null, 2)
	}]);
	const myThemeDotTheming = ResourceStub.getCall(2).returnValue;

	t.is(clonedCoreBaseDotThemingResourceStub.setPath.callCount, 1);
	t.deepEqual(clonedCoreBaseDotThemingResourceStub.setPath.getCall(0).args,
		["/resources/sap/ui/demo/lib/themes/sap_fiori_3/.theming"]);

	t.is(workspace.write.callCount, 7);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for libraryDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], libraryDotTheming,
		"workspace.write should be called with libraryDotTheming");
	t.is(workspace.write.getCall(1).args.length, 1,
		"workspace.write for baseThemeDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(1).args[0], baseThemeDotTheming,
		"workspace.write should be called with baseThemeDotTheming");
	t.is(workspace.write.getCall(2).args.length, 1,
		"workspace.write for myThemeDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(2).args[0], myThemeDotTheming,
		"workspace.write should be called with myThemeDotTheming");
	t.is(workspace.write.getCall(3).args.length, 1,
		"workspace.write for clonedCoreBaseDotThemingResourceStub should be called with 1 argument");
	t.is(workspace.write.getCall(3).args[0], clonedCoreBaseDotThemingResourceStub,
		"workspace.write should be called with clonedCoreBaseDotThemingResourceStub");
	t.is(workspace.write.getCall(4).args.length, 1,
		"workspace.write for libraryLessResource1 should be called with 1 argument");
	t.is(workspace.write.getCall(4).args[0], libraryLessResource1,
		"workspace.write should be called with libraryLessResource1");
	t.is(workspace.write.getCall(5).args.length, 1,
		"workspace.write for libraryLessResource2 should be called with 1 argument");
	t.is(workspace.write.getCall(5).args[0], libraryLessResource2,
		"workspace.write should be called with libraryLessResource2");
});

test.serial("generateThemeDesignerResources: Library sap.ui.core", async (t) => {
	const {generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/core/themes/base/library.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/core/themes/base/.theming") {
				return {};
			} else {
				return null;
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource = {};

	libraryLessGeneratorStub.resolves([libraryLessResource]);

	await generateThemeDesignerResources({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			namespace: "sap/ui/core"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	t.deepEqual(t.context.ReaderCollectionPrioritizedStub.getCall(0).args, [{
		name: `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.core`,
		readers: [workspace, dependencies]
	}]);
	const combo = t.context.ReaderCollectionPrioritizedStub.getCall(0).returnValue;

	t.is(fsInterfaceStub.callCount, 1, "fsInterface should be created once");
	t.deepEqual(fsInterfaceStub.getCall(0).args, [combo], "fsInterface should be created for 'combo'");
	const fs = fsInterfaceStub.getCall(0).returnValue;

	t.is(libraryLessGeneratorStub.callCount, 1);

	t.deepEqual(libraryLessGeneratorStub.getCall(0).args[0], {
		resources: [librarySourceLessResource],
		fs,
	}, "libraryLessGenerator processor should be called with expected arguments");

	t.is(ResourceStub.callCount, 1);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(0).args, [{
		path: "/resources/sap/ui/core/.theming",
		string: JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			sVersion: "1.2.3",
			aFiles: [
				"library",
				"global",
				"css_variables"
			]
		}, null, 2)
	}]);
	const libraryDotTheming = ResourceStub.getCall(0).returnValue;

	t.is(workspace.write.callCount, 2);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for libraryDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], libraryDotTheming,
		"workspace.write should be called with libraryDotTheming");
	t.is(workspace.write.getCall(1).args.length, 1,
		"workspace.write for libraryLessResource should be called with 1 argument");
	t.is(workspace.write.getCall(1).args[0], libraryLessResource,
		"workspace.write should be called with libraryLessResource");
});

test.serial("generateThemeDesignerResources: Library sap.ui.documentation is skipped", async (t) => {
	const {generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const workspace = {
		byGlob: sinon.stub(),
		write: sinon.stub()
	};

	await generateThemeDesignerResources({
		workspace: {},
		dependencies: {},
		options: {
			projectName: "sap.ui.documentation",
			version: "1.2.3",
			namespace: "sap/ui/documentation"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 0);
	t.is(fsInterfaceStub.callCount, 0);
	t.is(libraryLessGeneratorStub.callCount, 0);
	t.is(ResourceStub.callCount, 0);
	t.is(workspace.byGlob.callCount, 0);
	t.is(workspace.write.callCount, 0);
});

test.serial("generateThemeDesignerResources: Library without themes", async (t) => {
	const {generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const workspace = {
		byGlob: sinon.stub().callsFake(async () => {
			return [];
		}),
		write: sinon.stub()
	};

	await generateThemeDesignerResources({
		workspace,
		dependencies: {},
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3",
			namespace: "sap/ui/demo/lib"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 0);
	t.is(fsInterfaceStub.callCount, 0);
	t.is(libraryLessGeneratorStub.callCount, 0);

	t.is(ResourceStub.callCount, 1);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(0).args, [{
		path: "/resources/sap/ui/demo/lib/.theming",
		string: JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/demo/lib",
			sVersion: "1.2.3",
			bIgnore: true
		}, null, 2)
	}]);
	const libraryDotTheming = ResourceStub.getCall(0).returnValue;

	t.is(workspace.write.callCount, 1);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for libraryDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], libraryDotTheming,
		"workspace.write should be called with libraryDotTheming");
});

test.serial("generateThemeDesignerResources: Theme-Library", async (t) => {
	const {generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/library.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else {
				return [];
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource = {};

	libraryLessGeneratorStub.resolves([libraryLessResource]);

	await generateThemeDesignerResources({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	t.deepEqual(t.context.ReaderCollectionPrioritizedStub.getCall(0).args, [{
		name: `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.demo.lib`,
		readers: [workspace, dependencies]
	}]);
	const combo = t.context.ReaderCollectionPrioritizedStub.getCall(0).returnValue;

	t.is(fsInterfaceStub.callCount, 1, "fsInterface should be created once");
	t.deepEqual(fsInterfaceStub.getCall(0).args, [combo], "fsInterface should be created for 'combo'");
	const fs = fsInterfaceStub.getCall(0).returnValue;

	t.is(libraryLessGeneratorStub.callCount, 1);

	t.deepEqual(libraryLessGeneratorStub.getCall(0).args[0], {
		resources: [librarySourceLessResource],
		fs,
	}, "libraryLessGenerator processor should be called with expected arguments");

	t.is(ResourceStub.callCount, 1);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(0).args, [{
		path: "/resources/sap/ui/demo/lib/themes/my_theme/.theming",
		string: JSON.stringify({
			sEntity: "Theme",
			sId: "my_theme",
			sVendor: "SAP",
			oExtends: "base"
		}, null, 2)
	}]);
	const myThemeDotTheming = ResourceStub.getCall(0).returnValue;

	t.is(workspace.write.callCount, 2);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for myThemeDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], myThemeDotTheming,
		"workspace.write should be called with myThemeDotTheming");
	t.is(workspace.write.getCall(1).args.length, 1,
		"workspace.write for libraryLessResource should be called with 1 argument");
	t.is(workspace.write.getCall(1).args[0], libraryLessResource,
		"workspace.write should be called with libraryLessResource");
});

test.serial("generateThemeDesignerResources: .theming file missing in sap.ui.core library source`", async (t) => {
	const {generateThemeDesignerResources, libraryLessGeneratorStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/core/themes/base/library.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			return null;
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource = {};

	libraryLessGeneratorStub.resolves([libraryLessResource]);

	await t.throwsAsync(generateThemeDesignerResources({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			namespace: "sap/ui/core"
		}
	}), {
		message: ".theming file for theme base missing in sap.ui.core library source"
	});

	t.is(ResourceStub.callCount, 1);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(0).args, [{
		path: "/resources/sap/ui/core/.theming",
		string: JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			sVersion: "1.2.3",
			aFiles: [
				"library",
				"global",
				"css_variables"
			]
		}, null, 2)
	}]);
	const libraryDotTheming = ResourceStub.getCall(0).returnValue;

	t.is(workspace.write.callCount, 1);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for libraryDotTheming should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], libraryDotTheming,
		"workspace.write should be called with libraryDotTheming");
});

test.serial("generateThemeDesignerResources: Failed to extract library name from theme folder path", async (t) => {
	const {generateThemeDesignerResources} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/foo/library.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else {
				return [];
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	await t.throwsAsync(generateThemeDesignerResources({
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3"
		}
	}), {
		message: "Failed to extract library name from theme folder path: /resources/foo"
	});

	t.is(workspace.write.callCount, 0);
});
