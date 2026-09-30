import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import runSteps from "../../../lib/tasks/runSteps.js";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.fsInterfaceStub = sinon.stub().returns({});

	t.context.ReaderCollectionPrioritizedStub = sinon.stub().returns({
		byPath: sinon.stub()
	});

	t.context.ResourceStub = sinon.stub();
	t.context.libraryLessGeneratorStub = sinon.stub();

	t.context.generateThemeDesignerResources = await esmock("../../../lib/tasks/generateThemeDesignerResources", {
		"../../../lib/processors/libraryLessGenerator": t.context.libraryLessGeneratorStub,
		"@ui5/fs/ReaderCollectionPrioritized": t.context.ReaderCollectionPrioritizedStub,
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"@ui5/fs/Resource": t.context.ResourceStub,
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("generateThemeDesignerResources: Library", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub,
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
			if (globPattern === "/resources/sap/ui/demo/lib/themes/*/library.source.less") {
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

	// One step per theme, so libraryLessGenerator is called once per theme; return a distinct resource
	// per input theme so concurrent writes stay independent.
	const lessByTheme = new Map([
		[librarySourceLessResource1, libraryLessResource1],
		[librarySourceLessResource2, libraryLessResource2],
		[librarySourceLessResource3, libraryLessResource3],
	]);
	libraryLessGeneratorStub.callsFake(async ({resources}) => [lessByTheme.get(resources[0])]);

	await runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3",
			projectNamespace: "sap/ui/demo/lib"
		}
	});

	// A combo is created per theme; its first reader is the step's (recording) workspace, the second the
	// dependencies reader.
	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 3, "ReaderCollectionPrioritized created per theme");
	const rcpArgs = t.context.ReaderCollectionPrioritizedStub.getCall(0).args[0];
	t.is(rcpArgs.name, `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.demo.lib`);
	t.is(rcpArgs.readers.length, 2, "combo has a workspace and a dependencies reader");
	t.is(rcpArgs.readers[1], dependencies, "second combo reader is the dependencies reader");
	const combo = t.context.ReaderCollectionPrioritizedStub.getCall(0).returnValue;

	t.is(fsInterfaceStub.callCount, 3, "fsInterface created per theme");
	t.is(fsInterfaceStub.getCall(0).args[0], combo, "fsInterface should be created for 'combo'");
	const fs = fsInterfaceStub.getCall(0).returnValue;

	t.is(libraryLessGeneratorStub.callCount, 3, "libraryLessGenerator called per theme");
	const lessInputs = libraryLessGeneratorStub.getCalls().map((call) => call.args[0].resources[0]);
	t.true(lessInputs.includes(librarySourceLessResource1), "base theme processed");
	t.true(lessInputs.includes(librarySourceLessResource2), "my_theme processed");
	t.true(lessInputs.includes(librarySourceLessResource3), "sap_fiori_3 processed");
	libraryLessGeneratorStub.getCalls().forEach((call) =>
		t.is(call.args[0].fs, fs, "libraryLessGenerator called with the combo's fs"));

	// new Resource is created for the library .theming and for the generated base/my_theme .theming;
	// sap_fiori_3 is cloned from the core theme instead. Order across the concurrent themes is not
	// guaranteed, so assert membership.
	t.is(ResourceStub.callCount, 3);
	t.true(ResourceStub.alwaysCalledWithNew());
	const resourceArgs = ResourceStub.getCalls().map((call) => call.args[0]);
	t.true(resourceArgs.some((args) =>
		args.path === "/resources/sap/ui/demo/lib/.theming" &&
		args.string === JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/demo/lib",
			sVersion: "1.2.3"
		}, null, 2)), "library .theming created");
	t.true(resourceArgs.some((args) =>
		args.path === "/resources/sap/ui/demo/lib/themes/base/.theming" &&
		args.string === JSON.stringify({
			sEntity: "Theme",
			sId: "base",
			sVendor: "SAP"
		}, null, 2)), "base theme .theming created");
	t.true(resourceArgs.some((args) =>
		args.path === "/resources/sap/ui/demo/lib/themes/my_theme/.theming" &&
		args.string === JSON.stringify({
			sEntity: "Theme",
			sId: "my_theme",
			sVendor: "SAP",
			oExtends: "base"
		}, null, 2)), "my_theme .theming created");

	t.is(clonedCoreBaseDotThemingResourceStub.setPath.callCount, 1);
	t.deepEqual(clonedCoreBaseDotThemingResourceStub.setPath.getCall(0).args,
		["/resources/sap/ui/demo/lib/themes/sap_fiori_3/.theming"]);

	// Written: the library .theming, the three theme .theming (two created, sap_fiori_3 cloned), and the
	// three library.less resources.
	const written = workspace.write.getCalls().map((call) => call.args[0]);
	t.is(written.length, 7, "workspace.write called for every produced resource");
	ResourceStub.getCalls().forEach((call) =>
		t.true(written.includes(call.returnValue), "each created .theming was written"));
	t.true(written.includes(clonedCoreBaseDotThemingResourceStub), "the cloned sap_fiori_3 .theming was written");
	[libraryLessResource1, libraryLessResource2, libraryLessResource3].forEach((resource) =>
		t.true(written.includes(resource), "each library.less was written"));
});

test.serial("generateThemeDesignerResources: Library sap.ui.core", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/core/themes/base/library.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/sap/ui/core/themes/*/library.source.less") {
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

	await runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			projectNamespace: "sap/ui/core"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	const rcpArgs = t.context.ReaderCollectionPrioritizedStub.getCall(0).args[0];
	t.is(rcpArgs.name, `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.core`);
	t.is(rcpArgs.readers.length, 2, "combo has a workspace and a dependencies reader");
	t.is(rcpArgs.readers[1], dependencies, "second combo reader is the dependencies reader");
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

test.serial("generateThemeDesignerResources: Library sap.ui.core with existing library .theming", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/core/themes/base/library.source.less")
	};

	const coreLibraryDotThemingResource = {
		getString: async () => JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			aFiles: [
				"existing", "entries"
			]
		}, null, 2),
		setString: sinon.stub()
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/sap/ui/core/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/core/themes/base/.theming") {
				return {};
			} else if (virPath === "/resources/sap/ui/core/.theming") {
				return coreLibraryDotThemingResource;
			} else {
				return null;
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource = {};

	libraryLessGeneratorStub.resolves([libraryLessResource]);

	await runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			projectNamespace: "sap/ui/core"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	const rcpArgs = t.context.ReaderCollectionPrioritizedStub.getCall(0).args[0];
	t.is(rcpArgs.name, `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.core`);
	t.is(rcpArgs.readers.length, 2, "combo has a workspace and a dependencies reader");
	t.is(rcpArgs.readers[1], dependencies, "second combo reader is the dependencies reader");
	const combo = t.context.ReaderCollectionPrioritizedStub.getCall(0).returnValue;

	t.is(fsInterfaceStub.callCount, 1, "fsInterface should be created once");
	t.deepEqual(fsInterfaceStub.getCall(0).args, [combo], "fsInterface should be created for 'combo'");
	const fs = fsInterfaceStub.getCall(0).returnValue;

	t.is(libraryLessGeneratorStub.callCount, 1);

	t.deepEqual(libraryLessGeneratorStub.getCall(0).args[0], {
		resources: [librarySourceLessResource],
		fs,
	}, "libraryLessGenerator processor should be called with expected arguments");

	t.is(ResourceStub.callCount, 0, "No new resource should be created");

	t.is(coreLibraryDotThemingResource.setString.callCount, 1);
	t.deepEqual(coreLibraryDotThemingResource.setString.getCall(0).args, [
		JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			aFiles: [
				"existing", "entries"
			],
			sVersion: "1.2.3",
		}, null, 2)
	]);

	t.is(workspace.write.callCount, 2);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for coreLibraryDotThemingResource should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], coreLibraryDotThemingResource,
		"workspace.write should be called with libraryDotTheming");
	t.is(workspace.write.getCall(1).args.length, 1,
		"workspace.write for libraryLessResource should be called with 1 argument");
	t.is(workspace.write.getCall(1).args[0], libraryLessResource,
		"workspace.write should be called with libraryLessResource");
});

test.serial("generateThemeDesignerResources: Library sap.ui.core without themes, " +
"with existing library .theming with version", async (t) => {
	// NOTE: This tests the case when sap.ui.core has no themes, which is not a likely scenario.
	// But as the underlying functionality might be used in other scenarios in future, it is tested here.

	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const coreLibraryDotThemingResource = {
		getString: async () => JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			sVersion: "0.0.0", // existing version should be ignored
			aFiles: [
				"existing", "entries"
			]
		}, null, 2),
		setString: sinon.stub()
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			return [];
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/core/.theming") {
				return coreLibraryDotThemingResource;
			} else {
				return null;
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource = {};

	libraryLessGeneratorStub.resolves([libraryLessResource]);

	await runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			projectNamespace: "sap/ui/core"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 0, "ReaderCollectionPrioritized should not be created");

	t.is(fsInterfaceStub.callCount, 0, "fsInterface should not be created");

	t.is(libraryLessGeneratorStub.callCount, 0);

	t.is(ResourceStub.callCount, 0, "No new resource should be created");

	t.is(coreLibraryDotThemingResource.setString.callCount, 1);
	t.deepEqual(coreLibraryDotThemingResource.setString.getCall(0).args, [
		JSON.stringify({
			sEntity: "Library",
			sId: "sap/ui/core",
			sVersion: "1.2.3",
			aFiles: [
				"existing", "entries"
			],
			bIgnore: true
		}, null, 2)
	]);

	t.is(workspace.write.callCount, 1);
	t.is(workspace.write.getCall(0).args.length, 1,
		"workspace.write for coreLibraryDotThemingResource should be called with 1 argument");
	t.is(workspace.write.getCall(0).args[0], coreLibraryDotThemingResource,
		"workspace.write should be called with libraryDotTheming");
});

test.serial("generateThemeDesignerResources: Library sap.ui.core with existing invalid library .theming", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const coreLibraryDotThemingResource = {
		getPath: () => "/resources/sap/ui/core/.theming",
		getString: async () => JSON.stringify({
			sEntity: "Library",
			sId: "sap/m"
		}, null, 2),
		setString: sinon.stub()
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			return [];
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/core/.theming") {
				return coreLibraryDotThemingResource;
			} else {
				return null;
			}
		}),
		write: sinon.stub()
	};
	const dependencies = {};

	const libraryLessResource = {};

	libraryLessGeneratorStub.resolves([libraryLessResource]);

	await t.throwsAsync(runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			projectNamespace: "sap/ui/core"
		}
	}), {
		message: "Incorrect 'sId' value 'sap/m' in /resources/sap/ui/core/.theming: Expected 'sap/ui/core'"
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 0, "ReaderCollectionPrioritized should not be created");

	t.is(fsInterfaceStub.callCount, 0, "fsInterface should not be created");

	t.is(libraryLessGeneratorStub.callCount, 0);

	t.is(ResourceStub.callCount, 0, "No new resource should be created");

	t.is(coreLibraryDotThemingResource.setString.callCount, 0);

	t.is(workspace.write.callCount, 0);
});

test.serial("generateThemeDesignerResources: Library sap.ui.documentation is skipped", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const workspace = {
		byGlob: sinon.stub(),
		write: sinon.stub()
	};

	await runSteps(generateThemeDesignerResources, {
		workspace: {},
		dependencies: {},
		options: {
			projectName: "sap.ui.documentation",
			version: "1.2.3",
			projectNamespace: "sap/ui/documentation"
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
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

	const workspace = {
		byGlob: sinon.stub().callsFake(async () => {
			return [];
		}),
		write: sinon.stub()
	};

	await runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies: {},
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3",
			projectNamespace: "sap/ui/demo/lib"
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
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

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

	await runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.demo.lib",
			version: "1.2.3"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	const rcpArgs = t.context.ReaderCollectionPrioritizedStub.getCall(0).args[0];
	t.is(rcpArgs.name, `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.demo.lib`);
	t.is(rcpArgs.readers.length, 2, "combo has a workspace and a dependencies reader");
	t.is(rcpArgs.readers[1], dependencies, "second combo reader is the dependencies reader");
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
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/core/themes/base/library.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/sap/ui/core/themes/*/library.source.less") {
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

	await t.throwsAsync(runSteps(generateThemeDesignerResources, {
		workspace,
		dependencies,
		options: {
			projectName: "sap.ui.core",
			version: "1.2.3",
			projectNamespace: "sap/ui/core"
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
	const {sinon, generateThemeDesignerResources} = t.context;

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

	await t.throwsAsync(runSteps(generateThemeDesignerResources, {
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
