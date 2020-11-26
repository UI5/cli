const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

let ResourceCollector = require("../../../../lib/lbt/resources/ResourceCollector");

test.beforeEach((t) => {
	// Spying logger of processors/bootstrapHtmlTransformer
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("lbt:resources:ResourceCollector");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	t.context.logWarnSpy = sinon.spy(loggerInstance, "warn");

	// Re-require tested module
	ResourceCollector = mock.reRequire("../../../../lib/lbt/resources/ResourceCollector");
});

test.afterEach.always((t) => {
	mock.stop("@ui5/logger");
	t.context.logWarnSpy.restore();
});


test.serial("add: empty constructor dummy params", (t) => {
	const resourceCollector = new ResourceCollector({}, {});
	t.is(resourceCollector.resources.size, 0, "empty");
});

test.serial("add: empty constructor", (t) => {
	const resourceCollector = new ResourceCollector();
	t.is(resourceCollector.resources.size, 0, "empty");
});

test.serial("setExternalResources: empty filters", (t) => {
	const resourceCollector = new ResourceCollector();
	resourceCollector.setExternalResources({
		"testcomp": []
	});
	const orphanFilters = resourceCollector.createOrphanFilters();
	t.is(orphanFilters.size, 1, "1 filter");
});

test.serial("createOrphanFilters: filters", (t) => {
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
	const resourceCollector = new ResourceCollector();
	await resourceCollector.visitResource({getPath: () => "mypath", getSize: async () => 13});
	t.is(t.context.logWarnSpy.callCount, 1);
	t.is(t.context.logWarnSpy.getCall(0).args[0], "non-runtime resource mypath ignored");
});

test.serial("visitResource: library.source.less", async (t) => {
	const resourceCollector = new ResourceCollector();
	t.is(resourceCollector.themePackages.size, 0, "initially there is no theme package");
	await resourceCollector.visitResource({
		getPath: () => "/resources/themes/a/library.source.less",
		getSize: async () => 13
	});
	t.is(resourceCollector.themePackages.size, 1, "theme package was added");
});

test.serial("groupResourcesByComponents: debugBundles", async (t) => {
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
	const resourceCollector = new ResourceCollector();
	await resourceCollector.visitResource({getPath: () => "/resources/themes/a/.theming", getSize: async () => 13});
	t.is(resourceCollector.themePackages.size, 1, "1 theme was added");
	await resourceCollector.determineResourceDetails({});
	resourceCollector.groupResourcesByComponents();
	t.is(resourceCollector.themePackages.get("themes/a/").resources.length, 1, "1 theme was grouped");
});

test.serial("determineResourceDetails: properties", async (t) => {
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
	const resourceCollector = new ResourceCollector();
	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo")
		.returns(Promise.resolve());
	await resourceCollector.visitResource({getPath: () => "/resources/mylib/my.view.xml", getSize: async () => 13});
	await resourceCollector.determineResourceDetails({});
	t.is(enrichWithDependencyInfoStub.callCount, 1, "is called once");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "mylib/my.view.xml", "is called with view");
});

test.serial("determineResourceDetails: Debug bundle", async (t) => {
	const resourceCollector = new ResourceCollector();

	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo").resolves();
	await resourceCollector.visitResource({getPath: () => "/resources/MyBundle-dbg.js", getSize: async () => 13});

	await resourceCollector.determineResourceDetails({
		debugBundles: ["MyBundle-dbg.js"]
	});
	t.is(enrichWithDependencyInfoStub.callCount, 1, "enrichWithDependencyInfo is called once");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "MyBundle-dbg.js",
		"enrichWithDependencyInfo is called with debug bundle");
});

test.serial("determineResourceDetails: Debug files and non-debug files", async (t) => {
	const resourceCollector = new ResourceCollector();

	const enrichWithDependencyInfoStub = sinon.stub(resourceCollector, "enrichWithDependencyInfo")
		.callsFake((resourceInfo) => {
			// Simulate enriching resource info with dependency info to test whether it gets shared
			// with the dbg resource alter on
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
		debugResources: ["**/*-dbg.js"],
		debugBundles: ["MyBundle-dbg.js"]
	});
	t.is(enrichWithDependencyInfoStub.callCount, 3, "enrichWithDependencyInfo is called three times");
	t.is(enrichWithDependencyInfoStub.getCall(0).args[0].name, "MyBundle-dbg.js",
		"enrichWithDependencyInfo called with debug bundle");
	t.is(enrichWithDependencyInfoStub.getCall(1).args[0].name, "mylib/MyControlA.js",
		"enrichWithDependencyInfo called with non-debug control A");
	t.is(enrichWithDependencyInfoStub.getCall(2).args[0].name, "mylib/MyControlB.js",
		"enrichWithDependencyInfo called with non-debug control B");

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
	const resourceCollector = new ResourceCollector({
		getModuleInfo: async () => {
			return {
				name: "myname",
				dynamicDependencies: true,
				isConditionalDependency: (dep) => {
					return dep.includes("conditional");
				},
				isImplicitDependency: (dep) => {
					return dep.includes("implicit");
				},
				dependencies: [
					"mydependency.conditional", "mydependency.implicit", "mydependency"
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
