import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import Resource from "@ui5/fs/Resource";
import LocatorResourcePool from "../../../../lib/lbt/resources/LocatorResourcePool.js";

test.beforeEach(async (t) => {
	t.context.logWarnSpy = sinon.spy();
	t.context.logVerboseSpy = sinon.spy();

	t.context.ResourceCollector = await esmock("../../../../lib/lbt/resources/ResourceCollector.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("lbt:resources:ResourceCollector").returns({
				warn: t.context.logWarnSpy,
				verbose: t.context.logVerboseSpy
			})
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});


test.serial("add: empty constructor dummy params", (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector({}, {});
	t.is(resourceCollector.resources.size, 0, "empty");
});

test.serial("add: empty constructor", (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	t.is(resourceCollector.resources.size, 0, "empty");
});

test.serial("setExternalResources: empty filters", (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	resourceCollector.setExternalResources({
		"testcomp": []
	});
	const orphanFilters = resourceCollector.createOrphanFilters();
	t.is(orphanFilters.size, 1, "1 filter");
});

test.serial("createOrphanFilters: filters", (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	resourceCollector.setExternalResources({
		"testcomp": ["test"],
		"/": ["test"],
		"": ["test"],
		"a/": ["test"],
		"b": ["test"],
	});
	const orphanFilters = resourceCollector.createOrphanFilters();
	t.is(orphanFilters.size, 4, "4 filters");
});

test.serial("visitResource: path", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	await resourceCollector.visitResource({getPath: () => "mypath", getSize: async () => 13});
	t.is(t.context.logWarnSpy.callCount, 1);
	t.is(t.context.logWarnSpy.getCall(0).args[0], "Non-runtime resource mypath ignored");
});

test.serial("visitResource: library.source.less", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	t.is(resourceCollector.themePackages.size, 0, "initially there is no theme package");
	await resourceCollector.visitResource({
		getPath: () => "/resources/themes/a/library.source.less",
		getSize: async () => 13
	});
	t.is(resourceCollector.themePackages.size, 1, "theme package was added");
});

test.serial("visitResource: ensure proper matching of indicator files", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	t.is(resourceCollector.components.size, 0, "initially there are no prefixes");
	await resourceCollector.visitResource({
		getPath: () => "/resources/projectA/NotComponent.js",
		getSize: async () => 13
	});
	await resourceCollector.visitResource({
		getPath: () => "/resources/projectB/notmanifest.json",
		getSize: async () => 13
	});
	await resourceCollector.visitResource({
		getPath: () => "/resources/projectC/not.library.yaml",
		getSize: async () => 13
	});
	await resourceCollector.visitResource({
		getPath: () => "/resources/projectD/Component.json",
		getSize: async () => 13
	});
	t.is(resourceCollector.components.size, 0, "No prefixes should be added");
});

test.serial("groupResourcesByComponents: external resources", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	resourceCollector.setExternalResources({
		"testcomp": ["my/file.js"]
	});
	await resourceCollector.visitResource({getPath: () => "/resources/testcomp/Component.js", getSize: async () => 13});
	await resourceCollector.visitResource({getPath: () => "/resources/my/file.js", getSize: async () => 13});
	resourceCollector.groupResourcesByComponents();
	t.is(resourceCollector.resources.size, 0, "all resources were deleted");
});

test.serial("groupResourcesByComponents: theme", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	await resourceCollector.visitResource({getPath: () => "/resources/themes/a/.theming", getSize: async () => 13});
	t.is(resourceCollector.themePackages.size, 1, "1 theme was added");
	await resourceCollector.determineResourceDetails({});
	resourceCollector.groupResourcesByComponents();
	t.is(resourceCollector.themePackages.get("themes/a/").resources.length, 1, "1 theme was grouped");
});

test.serial("determineResourceDetails: properties", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector({
		getModuleInfo: async (moduleInfo) => {
			return {
				name: "myName"
			};
		}
	});
	await resourceCollector.visitResource({
		getPath: () => "/resources/mylib/manifest.json", getSize: async () => 13
	});
	await resourceCollector.visitResource({
		getPath: () => "/resources/mylib/i18n/i18n_de.properties", getSize: async () => 13
	});
	await resourceCollector.visitResource({
		getPath: () => "/resources/mylib/i18n/i18n.properties", getSize: async () => 13
	});
	await resourceCollector.determineResourceDetails({});
	resourceCollector.groupResourcesByComponents();
	const resources = resourceCollector.components.get("mylib/").resources;
	t.deepEqual(resources.map((res) => res.i18nName),
		[null, "i18n/i18n.properties", "i18n/i18n.properties"], "i18nName was set");
});

test.serial("determineResourceDetails: view.xml", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();
	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo")
		.returns(Promise.resolve());
	await resourceCollector.visitResource({getPath: () => "/resources/mylib/my.view.xml", getSize: async () => 13});
	await resourceCollector.determineResourceDetails({});
	t.is(enrichWithDependencyInfoStub.callCount, 1, "is called once");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "mylib/my.view.xml", "is called with view");
});

test.serial("determineResourceDetails: Debug bundle (without non-debug variant)", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();

	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo").resolves();
	await resourceCollector.visitResource({getPath: () => "/resources/MyBundle-dbg.js", getSize: async () => 13});

	await resourceCollector.determineResourceDetails({
		debugResources: ["**/*-dbg.js"], // MyBundle-dbg.js should be marked as "isDebug"
	});

	t.is(enrichWithDependencyInfoStub.callCount, 1, "enrichWithDependencyInfo is called once");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "MyBundle-dbg.js",
		"enrichWithDependencyInfo is called with debug bundle");
});

test.serial("determineResourceDetails: Debug bundle (with non-debug variant)", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();

	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo")
		.onFirstCall().callsFake(async (resourceInfo) => {
			resourceInfo.included = new Set(["SomeModule.js"]);
			resourceInfo.required = new Set(["Boot.js"]);
		})
		.onSecondCall().callsFake(async (resourceInfo) => {
			resourceInfo.required = new Set(["Boot.js"]);
		});
	await resourceCollector.visitResource({getPath: () => "/resources/MyBundle-dbg.js", getSize: async () => 13});
	await resourceCollector.visitResource({getPath: () => "/resources/MyBundle.js", getSize: async () => 13});

	await resourceCollector.determineResourceDetails({
		debugResources: ["**/*-dbg.js"], // MyBundle-dbg.js should be marked as "isDebug"
	});
	t.is(enrichWithDependencyInfoStub.callCount, 2, "enrichWithDependencyInfo is called twice");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "MyBundle.js",
		"enrichWithDependencyInfo is called with non-debug bundle first");
	t.is(enrichWithDependencyInfoStub.getCall(1).args[0].name, "MyBundle-dbg.js",
		"enrichWithDependencyInfo is called with debug bundle on second run");

	const bundleInfo = resourceCollector._resources.get("MyBundle.js");
	t.deepEqual(bundleInfo.included, new Set(["SomeModule.js"]));
	t.deepEqual(bundleInfo.required, new Set(["Boot.js"]));
	t.is(bundleInfo.isDebug, false);

	const debugBundleInfo = resourceCollector._resources.get("MyBundle-dbg.js");
	t.is(debugBundleInfo.included, null);
	t.deepEqual(debugBundleInfo.required, new Set(["Boot.js"]));
	t.is(debugBundleInfo.isDebug, true);
});

test.serial("determineResourceDetails: Debug files and non-debug files", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector();

	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo")
		.callsFake(async (resourceInfo) => {
			// Simulate enriching resource info with dependency info to test whether it gets shared
			// with the dbg resource later on
			resourceInfo.dynRequired = true;
		});
	await Promise.all([
		"/resources/MyBundle-dbg.js",
		"/resources/mylib/MyControlA-dbg.js",
		"/resources/mylib/MyControlA.js",
		"/resources/mylib/MyControlB.js",
		"/resources/mylib/MyControlB-dbg.js"
	].map((resourcePath) => {
		return resourceCollector.visitResource({getPath: () => resourcePath, getSize: async () => 13});
	}));

	await resourceCollector.determineResourceDetails({
		debugResources: ["**/*-dbg.js"]
	});
	t.is(enrichWithDependencyInfoStub.callCount, 3, "enrichWithDependencyInfo is called three times");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "mylib/MyControlA.js",
		"enrichWithDependencyInfo called with non-debug control A");
	t.is(enrichWithDependencyInfoStub.getCall(1).args[0].name, "mylib/MyControlB.js",
		"enrichWithDependencyInfo called with non-debug control B");
	t.is(enrichWithDependencyInfoStub.getCall(2).args[0].name, "MyBundle-dbg.js",
		"enrichWithDependencyInfo called with debug bundle");

	t.is(resourceCollector._resources.get("MyBundle-dbg.js").isDebug, true, "MyBundle-dbg is a debug file");
	t.is(resourceCollector._resources.get("MyBundle-dbg.js").dynRequired, true,
		"MyBundle-dbg is flagged as dynRequired");

	t.is(resourceCollector._resources.get("mylib/MyControlA.js").isDebug, false, "MyControlA is no debug file");
	t.is(resourceCollector._resources.get("mylib/MyControlA.js").dynRequired, true,
		"MyControlA is flagged as dynRequired");

	t.is(resourceCollector._resources.get("mylib/MyControlA-dbg.js").isDebug, true, "MyControlA-dbg is a debug file");
	t.is(resourceCollector._resources.get("mylib/MyControlA-dbg.js").dynRequired, true,
		"MyControlA-dbg is flagged as dynRequired");

	t.is(resourceCollector._resources.get("mylib/MyControlB.js").isDebug, false, "MyControlB is no debug file");
	t.is(resourceCollector._resources.get("mylib/MyControlB.js").dynRequired, true,
		"MyControlB is flagged as dynRequired");

	t.is(resourceCollector._resources.get("mylib/MyControlB-dbg.js").isDebug, true, "MyControlB-dbg is a debug file");
	t.is(resourceCollector._resources.get("mylib/MyControlB-dbg.js").dynRequired, true,
		"MyControlB-dbg is flagged as dynRequired");
});

test.serial("enrichWithDependencyInfo: add infos to resourceinfo", async (t) => {
	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector({
		getModuleInfo: async () => {
			return {
				name: "myname",
				dynamicDependencies: true,
				isConditionalDependency: (dep) => {
					return dep.includes("conditional");
				},
				dependencies: [
					"mydependency.conditional", "mydependency"
				],
				subModules: [
					"mySubmodule"
				],
				requiresTopLevelScope: true,
				exposedGlobals: ["myGlobal"],
				rawModule: true
			};
		}
	});
	const resourceInfo = {};
	await resourceCollector.enrichWithDependencyInfo(resourceInfo);
	t.deepEqual(resourceInfo, {
		condRequired: new Set(["mydependency.conditional"]),
		dynRequired: true,
		exposedGlobalNames: new Set(["myGlobal"]),
		format: "raw",
		included: new Set(["mySubmodule"]),
		module: "myname",
		required: new Set(["mydependency"]),
		requiresTopLevelScope: true
	}, "all information gets used for the resourceInfo");
});

test.serial("integration: Raw Module Info for debug variant", async (t) => {
	const resources = [
		new Resource({
			path: "/resources/mylib/myRawModuleBundle.js",
			string: `define('a', () => 'a');define('b', ['a'], (a) => a + 'b');`
		}),
		new Resource({
			path: "/resources/mylib/externalDependency.js",
			string: `console.log('Foo');`
		}),
		new Resource({
			path: "/resources/mylib/myRawModuleBundle-dbg.js",
			string: `
define('a', () => 'a');
define('b', ['a'], (a) => a + 'b');
`
		}),
		new Resource({
			path: "/resources/mylib/.library",
			string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd">
				<name>mylib</name>
				<vendor>Me</vendor>
				<copyright>mylib</copyright>
				<version>1.0.0</version>
				<documentation>mylib</documentation>
				<dependencies>
					<dependency>
						<libraryName>sap.ui.core</libraryName>
					</dependency>
				</dependencies>
				<appData>
					<packaging xmlns="http://www.sap.com/ui5/buildext/packaging" version="2.0">
						<module-infos>
							<raw-module
								name="mylib/myRawModuleBundle.js"
								depends="mylib/externalDependency.js"
							/>
						</module-infos>
					</packaging>
				</appData>
			</library>`
		}),
	];

	const pool = new LocatorResourcePool();
	await pool.prepare( resources );

	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector(pool);
	await Promise.all(resources.map((resource) => resourceCollector.visitResource(resource)));

	await resourceCollector.determineResourceDetails({
		debugResources: ["**/*-dbg.js"]
	});

	resourceCollector.groupResourcesByComponents();

	const resourceInfoList = resourceCollector.components.get("mylib/");

	const myRawModuleBundle = resourceInfoList.resourcesByName.get("myRawModuleBundle.js");
	t.is(myRawModuleBundle.name, "myRawModuleBundle.js");
	t.is(myRawModuleBundle.module, "mylib/myRawModuleBundle.js");
	t.is(myRawModuleBundle.format, "raw");
	t.is(myRawModuleBundle.requiresTopLevelScope, false);
	t.deepEqual(myRawModuleBundle.included,
		new Set(["a.js", "b.js"]));
	t.deepEqual(myRawModuleBundle.required,
		new Set(["mylib/externalDependency.js"]));

	const myRawModuleBundleDbg = resourceInfoList.resourcesByName.get("myRawModuleBundle-dbg.js");
	t.is(myRawModuleBundleDbg.name, "myRawModuleBundle-dbg.js");
	t.is(myRawModuleBundleDbg.module, "mylib/myRawModuleBundle.js");
	t.is(myRawModuleBundleDbg.format, "raw");
	t.is(myRawModuleBundleDbg.requiresTopLevelScope, false);
	t.deepEqual(myRawModuleBundleDbg.included,
		new Set(["a.js", "b.js"]));
	t.deepEqual(myRawModuleBundleDbg.required,
		new Set(["mylib/externalDependency.js"]));
});

test.serial("integration: Analyze debug bundle", async (t) => {
	const resources = [
		new Resource({
			path: "/resources/mylib/myBundle.js",
			string: `sap.ui.predefine('a', () => 'a');sap.ui.predefine('b', ['a'], (a) => a + 'b');`
		}),
		new Resource({
			path: "/resources/mylib/myBundle-dbg.js",
			string: `sap.ui.predefine('a', () => 'a');`
		}),
		new Resource({
			path: "/resources/mylib/.library",
			string: `
			<?xml version="1.0" encoding="UTF-8" ?>
			<library xmlns="http://www.sap.com/sap.ui.library.xsd">
				<name>mylib</name>
				<vendor>Me</vendor>
				<copyright>mylib</copyright>
				<version>1.0.0</version>
				<documentation>mylib</documentation>
				<dependencies>
					<dependency>
						<libraryName>sap.ui.core</libraryName>
					</dependency>
				</dependencies>
			</library>`
		}),
	];

	const pool = new LocatorResourcePool();
	await pool.prepare( resources );

	const {ResourceCollector} = t.context;
	const resourceCollector = new ResourceCollector(pool);
	await Promise.all(resources.map((resource) => resourceCollector.visitResource(resource)));

	await resourceCollector.determineResourceDetails({
		debugResources: ["**/*-dbg.js"]
	});

	resourceCollector.groupResourcesByComponents();

	const resourceInfoList = resourceCollector.components.get("mylib/");

	const myRawModuleBundle = resourceInfoList.resourcesByName.get("myBundle.js");
	t.is(myRawModuleBundle.name, "myBundle.js");
	t.is(myRawModuleBundle.module, "mylib/myBundle.js");
	t.is(myRawModuleBundle.format, null);
	t.is(myRawModuleBundle.requiresTopLevelScope, false);
	t.deepEqual(myRawModuleBundle.included,
		new Set(["a.js", "b.js"]));
	t.is(myRawModuleBundle.required, null);

	const myRawModuleBundleDbg = resourceInfoList.resourcesByName.get("myBundle-dbg.js");
	t.is(myRawModuleBundleDbg.name, "myBundle-dbg.js");
	t.is(myRawModuleBundleDbg.module, "mylib/myBundle.js");
	t.is(myRawModuleBundleDbg.format, null);
	t.is(myRawModuleBundleDbg.requiresTopLevelScope, false);
	t.deepEqual(myRawModuleBundleDbg.included,
		new Set(["a.js"]));
	t.is(myRawModuleBundleDbg.required, null);
});
