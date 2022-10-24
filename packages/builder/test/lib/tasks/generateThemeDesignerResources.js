import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

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
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

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
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, fsInterfaceStub, ResourceStub} = t.context;

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

test.serial("generateThemeDesignerResources: Theme-Library with CSS Variables", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/library.source.less")
	};

	const cssVariablesSourceResource = {
		getString: sinon.stub().returns("My Content"),
	};

	const cssVariableSourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else if (globPattern === "/resources/**/themes/*/css_variables.source.less") {
				return [cssVariableSourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less") {
				return cssVariablesSourceResource;
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

	t.is(ResourceStub.callCount, 2);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(1).args, [{
		path: "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.less",
		string:
`/* NOTE: This file was generated as an optimized version of "css_variables.source.less" for the Theme Designer. */

@import "../base/css_variables.less";

/* START "css_variables.source.less" */
My Content
/* END "css_variables.source.less" */

@import "../../../../../../sap/ui/core/themes/my_theme/global.less";
`
	}]);
	const cssVariableResource = ResourceStub.getCall(1).returnValue;

	t.is(workspace.write.callCount, 3);
	t.is(workspace.write.getCall(2).args.length, 1,
		"workspace.write for cssVariableResource should be called with 1 argument");
	t.is(workspace.write.getCall(2).args[0], cssVariableResource,
		"workspace.write should be called with cssVariableResource");
});

test.serial("generateThemeDesignerResources: Theme-Library with CSS Variables with namespace", async (t) => {
	const {sinon, generateThemeDesignerResources, libraryLessGeneratorStub, ResourceStub} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/library.source.less")
	};

	const cssVariablesSourceResource = {
		getString: sinon.stub().returns("My Content from Namespace"),
	};

	const cssVariableSourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/sap/ui/demo/lib/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else if (globPattern === "/resources/sap/ui/demo/lib/themes/*/css_variables.source.less") {
				return [cssVariableSourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less") {
				return cssVariablesSourceResource;
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
			version: "1.2.3",
			namespace: "sap/ui/demo/lib"
		}
	});

	t.is(t.context.ReaderCollectionPrioritizedStub.callCount, 1, "ReaderCollectionPrioritized should be created once");
	t.deepEqual(t.context.ReaderCollectionPrioritizedStub.getCall(0).args, [{
		name: `generateThemeDesignerResources - prioritize workspace over dependencies: sap.ui.demo.lib`,
		readers: [workspace, dependencies]
	}]);

	t.is(ResourceStub.callCount, 3);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(2).args, [{
		path: "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.less",
		string:
`/* NOTE: This file was generated as an optimized version of "css_variables.source.less" for the Theme Designer. */

@import "../base/css_variables.less";

/* START "css_variables.source.less" */
My Content from Namespace
/* END "css_variables.source.less" */

@import "../../../../../../sap/ui/core/themes/my_theme/global.less";
`
	}]);
	const cssVariableResource = ResourceStub.getCall(2).returnValue;

	t.is(workspace.write.callCount, 4);
	t.is(workspace.write.getCall(3).args.length, 1,
		"workspace.write for cssVariableResource should be called with 1 argument");
	t.is(workspace.write.getCall(3).args[0], cssVariableResource,
		"workspace.write should be called with cssVariableResource");
});

test.serial("generateThemeDesignerResources: Theme-Library with CSS Variables with base theme", async (t) => {
	const {
		sinon,
		generateThemeDesignerResources,
		libraryLessGeneratorStub,
		ResourceStub,
		ReaderCollectionPrioritizedStub
	} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/library.source.less")
	};

	const cssVariablesSourceResource = {
		getString: sinon.stub().returns("My Content with Base Theme"),
	};

	const cssVariableSourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less")
	};

	const baseLessResource = {};

	ReaderCollectionPrioritizedStub.returns({
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/core/themes/my_theme/base.less") {
				return baseLessResource;
			} else {
				return null;
			}
		})
	});

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else if (globPattern === "/resources/**/themes/*/css_variables.source.less") {
				return [cssVariableSourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less") {
				return cssVariablesSourceResource;
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

	t.is(ResourceStub.callCount, 2);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(1).args, [{
		path: "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.less",
		string:
`/* NOTE: This file was generated as an optimized version of "css_variables.source.less" for the Theme Designer. */

@import "../base/css_variables.less";

/* START "css_variables.source.less" */
My Content with Base Theme
/* END "css_variables.source.less" */

@import "../../../../../../../Base/baseLib/my_theme/base.less";
@import "../../../../../../sap/ui/core/themes/my_theme/global.less";
`
	}]);
	const cssVariableResource = ResourceStub.getCall(1).returnValue;

	t.is(workspace.write.callCount, 3);
	t.is(workspace.write.getCall(2).args.length, 1,
		"workspace.write for cssVariableResource should be called with 1 argument");
	t.is(workspace.write.getCall(2).args[0], cssVariableResource,
		"workspace.write should be called with cssVariableResource");
});

test.serial("generateThemeDesignerResources: Base Theme-Library with CSS Variables", async (t) => {
	const {
		sinon,
		generateThemeDesignerResources,
		libraryLessGeneratorStub,
		ResourceStub
	} = t.context;

	const librarySourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/base/library.source.less")
	};

	const cssVariablesSourceResource = {
		getString: sinon.stub().returns("My Base Theme Content"),
	};

	const cssVariableSourceLessResource = {
		getPath: sinon.stub().returns("/resources/sap/ui/demo/lib/themes/base/css_variables.source.less")
	};

	const workspace = {
		byGlob: sinon.stub().callsFake(async (globPattern) => {
			if (globPattern === "/resources/**/themes/*/library.source.less") {
				return [librarySourceLessResource];
			} else if (globPattern === "/resources/**/themes/*/css_variables.source.less") {
				return [cssVariableSourceLessResource];
			} else {
				return [];
			}
		}),
		byPath: sinon.stub().callsFake(async (virPath) => {
			if (virPath === "/resources/sap/ui/demo/lib/themes/my_theme/css_variables.source.less") {
				return cssVariablesSourceResource;
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

	t.is(ResourceStub.callCount, 2);
	t.true(ResourceStub.alwaysCalledWithNew());

	t.deepEqual(ResourceStub.getCall(1).args, [{
		path: "/resources/sap/ui/demo/lib/themes/base/css_variables.less",
		string:
`/* NOTE: This file was generated as an optimized version of "css_variables.source.less" for the Theme Designer. */

@import "../../../../../../sap/ui/core/themes/base/global.less";
`
	}]);
	const cssVariableResource = ResourceStub.getCall(1).returnValue;

	t.is(workspace.write.callCount, 3);
	t.is(workspace.write.getCall(2).args.length, 1,
		"workspace.write for cssVariableResource should be called with 1 argument");
	t.is(workspace.write.getCall(2).args[0], cssVariableResource,
		"workspace.write should be called with cssVariableResource");
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
