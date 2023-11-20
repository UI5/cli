import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import {createAdapter, createResource} from "@ui5/fs/resourceFactory";

function createWorkspace() {
	return createAdapter({
		virBasePath: "/",
		project: {
			getName: () => "test.lib",
			getVersion: () => "2.0.0",
		}
	});
}

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		verbose: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub()
	};

	t.context.manifestEnhancerStub = sinon.stub();
	t.context.fsInterfaceStub = sinon.stub().returns("fs interface");
	t.context.enhanceManifest = await esmock("../../../lib/tasks/enhanceManifest.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:tasks:enhanceManifest").returns(t.context.log)
		},
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"../../../lib/processors/manifestEnhancer": t.context.manifestEnhancerStub,
	});
	t.context.workspace = createWorkspace();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("Transforms single manifest.json resource", async (t) => {
	const {enhanceManifest, log} = t.context;

	t.plan(6);

	const resource = createResource({
		path: "/resources/sap/ui/demo/app/manifest.json",
		string: `{
"_version": "1.58.0",
"sap.app": {
	"id": "sap.ui.demo.app",
	"type": "application",
	"title": "{{title}}"
}
`,
		project: t.context.workspace._project
	});

	const workspace = {
		byGlob: (actualPath) => {
			t.is(actualPath, "/resources/sap/ui/demo/app/**/manifest.json",
				"Reads all manifest.json files");
			return Promise.resolve([resource]);
		},
		write: (actualResource) => {
			t.deepEqual(actualResource, resource,
				"Expected resource is written back to workspace");
		}
	};

	t.context.manifestEnhancerStub.returns([resource]);

	await enhanceManifest({
		workspace,
		options: {
			projectNamespace: "sap/ui/demo/app"
		}
	});

	t.is(t.context.manifestEnhancerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.manifestEnhancerStub.calledWithExactly({
		resources: [resource],
		fs: "fs interface"
	}), "Processor should be called with expected arguments");

	t.true(log.warn.notCalled, "No warnings should be logged");
	t.true(log.error.notCalled, "No errors should be logged");
});

test.serial("Transforms all manifest.json resources", async (t) => {
	const {enhanceManifest, log} = t.context;

	t.plan(6);

	const resourceLib = createResource({
		path: "/resources/sap/ui/demo/lib/manifest.json",
		string: `{
	"_version": "1.58.0",
	"sap.app": {
		"id": "sap.ui.demo.lib",
		"type": "library"
	},
	"sap.ui5": {
		"library": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties"
			}
		}
	}
}`,
		project: t.context.workspace._project
	});

	const resourceReuseComp1 = createResource({
		path: "/resources/sap/ui/demo/lib/comp1/manifest.json",
		string: `{
	"_version": "1.58.0",
	"sap.app": {
		"id": "sap.ui.demo.lib",
		"type": "component"
	},
	"sap.ui5": {
		"models": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties"
			}
		}
	}
}`,
		project: t.context.workspace._project
	});

	const resourceReuseComp2 = createResource({
		path: "/resources/sap/ui/demo/lib/comp2/manifest.json",
		string: `{
	"_version": "1.58.0",
	"sap.app": {
		"id": "sap.ui.demo.lib",
		"type": "component"
	},
	"sap.ui5": {
		"models": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"supportedLocales": ["fr", "en"]
			}
		}
	}
}`,
		project: t.context.workspace._project
	});

	const workspace = {
		byGlob: () => {
			return Promise.resolve([resourceLib, resourceReuseComp1, resourceReuseComp2]);
		},
		write: (actualResource) => {
			const path = actualResource.getPath();
			let expectedResource;
			if (path === "/resources/sap/ui/demo/lib/manifest.json") {
				expectedResource = resourceLib;
			} else if (path === "/resources/sap/ui/demo/lib/comp1/manifest.json") {
				expectedResource = resourceReuseComp1;
			} else if (path === "/resources/sap/ui/demo/lib/comp2/manifest.json") {
				t.fail("Resoure should be written, because it was not returned by the processor");
			} else {
				t.fail("No other resoure should be written");
			}
			t.deepEqual(actualResource, expectedResource,
				"Expected resource is written back to workspace");
		}
	};

	t.context.manifestEnhancerStub.returns([resourceLib, resourceReuseComp1]);

	await enhanceManifest({
		workspace,
		options: {
			projectNamespace: "sap/ui/demo/lib"
		}
	});

	t.is(t.context.manifestEnhancerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.manifestEnhancerStub.calledWithExactly({
		resources: [resourceLib, resourceReuseComp1, resourceReuseComp2],
		fs: "fs interface"
	}), "Processor should be called with expected arguments");

	t.true(log.warn.notCalled, "No warnings should be logged");
	t.true(log.error.notCalled, "No errors should be logged");
});

test.serial("Transforms multiple manifest.json resources", async (t) => {
	const {enhanceManifest, log} = t.context;

	t.plan(7);

	const resourceLib = createResource({
		path: "/resources/sap/ui/demo/lib/manifest.json",
		string: `{
	"_version": "1.58.0",
	"sap.app": {
		"id": "sap.ui.demo.lib",
		"type": "library"
	},
	"sap.ui5": {
		"library": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties"
			}
		}
	}
}`,
		project: t.context.workspace._project
	});

	const resourceReuseComp1 = createResource({
		path: "/resources/sap/ui/demo/lib/comp1/manifest.json",
		string: `{
	"_version": "1.58.0",
	"sap.app": {
		"id": "sap.ui.demo.lib",
		"type": "component"
	},
	"sap.ui5": {
		"models": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties"
			}
		}
	}
}`,
		project: t.context.workspace._project
	});

	const resourceReuseComp2 = createResource({
		path: "/resources/sap/ui/demo/lib/comp2/manifest.json",
		string: `{
	"_version": "1.58.0",
	"sap.app": {
		"id": "sap.ui.demo.lib",
		"type": "component"
	},
	"sap.ui5": {
		"models": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties"
			}
		}
	}
}`,
		project: t.context.workspace._project
	});

	const workspace = {
		byGlob: () => {
			return Promise.resolve([resourceLib, resourceReuseComp1, resourceReuseComp2]);
		},
		write: (actualResource) => {
			const path = actualResource.getPath();
			let expectedResource;
			if (path === "/resources/sap/ui/demo/lib/manifest.json") {
				expectedResource = resourceLib;
			} else if (path === "/resources/sap/ui/demo/lib/comp1/manifest.json") {
				expectedResource = resourceReuseComp1;
			} else if (path === "/resources/sap/ui/demo/lib/comp2/manifest.json") {
				expectedResource = resourceReuseComp2;
			} else {
				t.fail("No other resoure should be written");
			}
			t.deepEqual(actualResource, expectedResource,
				"Expected resource is written back to workspace");
		}
	};

	t.context.manifestEnhancerStub.returns([resourceLib, resourceReuseComp1, resourceReuseComp2]);

	await enhanceManifest({
		workspace,
		options: {
			projectNamespace: "sap/ui/demo/lib"
		}
	});

	t.is(t.context.manifestEnhancerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.manifestEnhancerStub.calledWithExactly({
		resources: [resourceLib, resourceReuseComp1, resourceReuseComp2],
		fs: "fs interface"
	}), "Processor should be called with expected arguments");

	t.true(log.warn.notCalled, "No warnings should be logged");
	t.true(log.error.notCalled, "No errors should be logged");
});

test.serial("Should not rewrite the manifest.json if no changes were made", async (t) => {
	const {enhanceManifest, log} = t.context;

	t.plan(5);

	const resource = createResource({
		path: "/resources/sap/ui/demo/app/manifest.json",
		string: `{
"_version": "1.58.0",
"sap.app": {
	"id": "sap.ui.demo.app",
	"type": "application"
}
`,
		project: t.context.workspace._project
	});

	const workspace = {
		byGlob: (actualPath) => {
			t.is(actualPath, "/resources/sap/ui/demo/app/**/manifest.json",
				"Reads all manifest.json files");
			return Promise.resolve([resource]);
		},
		write: (actualResource) => {
			t.fail("No resource should be rewritten");
		}
	};

	t.context.manifestEnhancerStub.returns([]);

	await enhanceManifest({
		workspace,
		options: {
			projectNamespace: "sap/ui/demo/app"
		}
	});

	t.is(t.context.manifestEnhancerStub.callCount, 1,
		"Processor should be called once");

	t.true(t.context.manifestEnhancerStub.calledWithExactly({
		resources: [resource],
		fs: "fs interface"
	}), "Processor should be called with expected arguments");

	t.true(log.warn.notCalled, "No warnings should be logged");
	t.true(log.error.notCalled, "No errors should be logged");
});
