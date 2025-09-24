import test from "ava";
import ModuleInfo from "../../../../lib/lbt/resources/ModuleInfo.js";
import ResourceFilterList from "../../../../lib/lbt/resources/ResourceFilterList.js";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.LibraryFileAnalyzerGetDependencyInfosStub = sinon.stub().returns({});
	t.context.ResourcePool = await esmock("../../../../lib/lbt/resources/ResourcePool.js", {
		"../../../../lib/lbt/resources/LibraryFileAnalyzer.js": {
			getDependencyInfos: t.context.LibraryFileAnalyzerGetDependencyInfosStub
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("findResources: based on pattern", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();

	const resourceB = {name: "b"};
	resourcePool.addResource(resourceB);

	// not found
	const resourcesOfEmptyPool = await resourcePool.findResources(/a/);
	t.deepEqual(resourcesOfEmptyPool, [], "nothing is found");

	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);

	// found
	const resources = await resourcePool.findResources(/a/);
	t.deepEqual(resources, [resourceA], "resource a is found");
});

test("findResources: based on ResourceFilterList", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();

	const resourceB = {name: "b"};
	resourcePool.addResource(resourceB);

	// not found
	const resourcesOfEmptyPool = await resourcePool.findResources(new ResourceFilterList(["a"]));
	t.deepEqual(resourcesOfEmptyPool, [], "nothing is found");

	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);

	// found
	const resources = await resourcePool.findResources(new ResourceFilterList(["a"]));
	t.deepEqual(resources, [resourceA], "resource a is found");
});

test("size", (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	t.is(resourcePool.size, 0, "size of empty pool is 0");

	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);
	t.is(resourcePool.size, 1, "size of pool is 1");
});

test("resources", (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	t.deepEqual(resourcePool.resources, [], "no resources in empty pool");

	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);
	t.deepEqual(resourcePool.resources, [resourceA], "resource a in pool");
});

test("getIgnoreMissingModules", (t) => {
	const {ResourcePool} = t.context;

	let resourcePool = new ResourcePool({});
	t.is(resourcePool.getIgnoreMissingModules(), false, "returned expected value");

	resourcePool = new ResourcePool({
		ignoreMissingModules: true
	});
	t.is(resourcePool.getIgnoreMissingModules(), true, "returned expected value");
});

test("findResourceWithInfo: rejecting getModuleInfo", async (t) => {
	const {sinon, ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	resourcePool.getModuleInfo = sinon.stub().rejects(new Error("myerror"));
	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);
	const resource = await resourcePool.findResourceWithInfo("a");
	t.falsy(resource.info, "in the rejection case the info is not there");
	t.deepEqual(resource, resourceA, "Although info was rejected resource is still found");
});

test.serial("findResourceWithInfo", async (t) => {
	const {sinon, ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);

	sinon.stub(resourcePool, "getModuleInfo").resolves("myInfo");

	const resource = await resourcePool.findResourceWithInfo("a");
	t.is(resource.info, "myInfo", "info is set correctly");
});

test("getModuleInfo", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const code = "var test = 47;";
	const inputJsResource = {name: "a.js", buffer: async () => code};
	resourcePool.addResource(inputJsResource);
	const jsResource = await resourcePool.getModuleInfo("a.js");
	t.is(await resourcePool._dependencyInfos.get(inputJsResource.name), jsResource,
		"info has been added to _dependencyInfos map");

	t.deepEqual(jsResource.name, inputJsResource.name, "name should be the same");
	t.deepEqual(jsResource.size, code.length, "size is the character length of code");
	t.true(jsResource.rawModule);
	t.deepEqual(jsResource.subModules, [], "does not contain submodules");
});

test("getModuleInfo: determineDependencyInfo for raw js resources", async (t) => {
	const {ResourcePool, LibraryFileAnalyzerGetDependencyInfosStub} = t.context;

	const resourcePool = new ResourcePool();
	const code = `function One() {return 1;}`;
	const inputJsResource = {name: "a.js", buffer: async () => code};
	resourcePool.addResource(inputJsResource);


	const infoA = new ModuleInfo("a.js");
	infoA.requiresTopLevelScope = false;

	LibraryFileAnalyzerGetDependencyInfosStub.returns({
		"a.js": infoA
	});

	const library = {
		name: "a.library",
		buffer: async () => ""
	};
	await resourcePool.addResource(library);

	const jsResource = await resourcePool.getModuleInfo("a.js");
	t.false(jsResource.requiresTopLevelScope);
});

test("getModuleInfo: determineDependencyInfo for library.js resource", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const code = `sap.ui.define(["sap/ui/core/Lib"], (Library) => Library.init({
		name: "testlib"
	}));`;
	const libraryJsResource = {
		name: "testlib/library.js", buffer: async () => code,
		resource: {
			getName: () => "testlib/library.js",
			getBuffer: async () => code
		}
	};
	resourcePool.addResource(libraryJsResource);

	const manifestResource = {name: "testlib/manifest.json", buffer: async () => `{}`};
	resourcePool.addResource(manifestResource);

	const jsResource = await resourcePool.getModuleInfo("testlib/library.js");
	t.deepEqual(jsResource.dependencies, [
		"sap/ui/core/Lib.js",
		"ui5loader-autoconfig.js",
		"testlib/manifest.json"
	]);
});

test("getModuleInfo: determineDependencyInfo for library.js resource (no manifest.json)", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const code = `sap.ui.define(["sap/ui/core/Lib"], (Library) => Library.init({
		name: "testlib"
	}));`;
	const libraryJsResource = {
		name: "testlib/library.js", buffer: async () => code,
		resource: {
			getName: () => "testlib/library.js",
			getBuffer: async () => code
		}
	};
	resourcePool.addResource(libraryJsResource);

	const jsResource = await resourcePool.getModuleInfo("testlib/library.js");
	t.deepEqual(jsResource.dependencies, [
		"sap/ui/core/Lib.js",
		"ui5loader-autoconfig.js"
	]);
});

test("getModuleInfo: determineDependencyInfo for js templateAssembler code", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const code = `sap.ui.define(["a", "sap/fe/core/TemplateAssembler"], function(a, TemplateAssembler){
	return TemplateAssembler.getTemplateComponent(getMethods,
		"sap.fe.templates.Page.Component", {
			metadata: {
				properties: {
					"templateName": {
						"type": "string",
						"defaultValue": "sap.fe.templates.Page.view.Page"
					}
				},
				"manifest": "json"
			}
		});
	});`;
	const inputJsResource = {name: "a.js", buffer: async () => code};
	resourcePool.addResource(inputJsResource);

	const jsResource = await resourcePool.getModuleInfo("a.js");
	t.is(await resourcePool._dependencyInfos.get(inputJsResource.name), jsResource,
		"info has been added to _dependencyInfos map");
	t.is(jsResource.size, 372);
	t.is(jsResource.format, "ui5-define", "contains sap.ui.define therefore should be a ui5-define format");
	t.is(jsResource.name, "a.js");
	t.false(jsResource.rawModule);
	t.deepEqual(jsResource.subModules, []);
});

test("getModuleInfo: determineDependencyInfo for xml control and fragment", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const xmlFragment = `<HBox xmlns:m="sap.m" xmlns:l="sap.ui.layout" controllerName="myController">
		<items>
		<l:HorizontalLayout id="layout">
		<m:Button text="Button 1" id="button1" />
		<m:Button text="Button 2" id="button2" />
		<m:Button text="Button 3" id="button3" />
		</l:HorizontalLayout>
		</items>
		</HBox>`;

	const inputXmlControlResource = {name: "a.control.xml", buffer: () => xmlFragment};
	resourcePool.addResource(inputXmlControlResource);
	const inputXmlFragmentResource = {name: "a.fragment.xml", buffer: () => xmlFragment};
	resourcePool.addResource(inputXmlFragmentResource);


	const xmlControlResource = await resourcePool.getModuleInfo("a.control.xml");
	t.is(await resourcePool._dependencyInfos.get(inputXmlControlResource.name), xmlControlResource,
		"info has been added to _dependencyInfos map");
	t.is(xmlControlResource.size, 298);
	t.falsy(xmlControlResource.format);
	t.is(xmlControlResource.name, "a.control.xml");
	t.false(xmlControlResource.rawModule);
	t.deepEqual(xmlControlResource.subModules, []);

	const xmlFragmentResource = await resourcePool.getModuleInfo("a.fragment.xml");
	t.is(await resourcePool._dependencyInfos.get(inputXmlFragmentResource.name), xmlFragmentResource,
		"info has been added to _dependencyInfos map");
	t.is(xmlFragmentResource.size, 298);
	t.falsy(xmlFragmentResource.format);
	t.is(xmlFragmentResource.name, "a.fragment.xml");
	t.false(xmlFragmentResource.rawModule);
	t.deepEqual(xmlFragmentResource.subModules, []);
});

test("getModuleInfo: determineDependencyInfo for xml view", async (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const xmlView = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:m="sap.m" xmlns:l="sap.ui.layout"
		controllerName="myController">
		<l:HorizontalLayout id="layout">
		<m:Button text="Button 1" id="button1" />
		<m:Button text="Button 2" id="button2" />
		<m:Button text="Button 3" id="button3" />
		</l:HorizontalLayout>
		</mvc:View>`;

	const inputXmlViewResource = {name: "a.view.xml", buffer: () => xmlView};
	resourcePool.addResource(inputXmlViewResource);

	const xmlViewResource = await resourcePool.getModuleInfo("a.view.xml");
	t.is(await resourcePool._dependencyInfos.get(inputXmlViewResource.name), xmlViewResource,
		"info has been added to _dependencyInfos map");
	t.is(xmlViewResource.size, 315);
	t.falsy(xmlViewResource.format);
	t.is(xmlViewResource.name, "a.view.xml");
	t.false(xmlViewResource.rawModule);
	t.deepEqual(xmlViewResource.subModules, []);
});


test("addResource twice", (t) => {
	const {ResourcePool} = t.context;

	const resourcePool = new ResourcePool();
	const resourceA = {name: "a"};

	resourcePool.addResource(resourceA);
	resourcePool.addResource(resourceA);
	t.deepEqual(resourcePool._resources, [resourceA, resourceA], "resource a has been added to resources array twice");
	t.is(resourcePool._resourcesByName.get("a"), resourceA, "resource a has been added to the _resourcesByName map");
	t.is(resourcePool._resourcesByName.size, 1, "resource a was added to _resourcesByName map");
});

test.serial("addResource: library and eval raw module info", async (t) => {
	const {ResourcePool, LibraryFileAnalyzerGetDependencyInfosStub} = t.context;

	const resourcePool = new ResourcePool();

	const infoA = {};
	infoA.name = "moduleA.js";
	infoA.rawModule = true;
	infoA.dependencies = ["123.js"];
	infoA.ignoredGlobals = ["foo", "bar"];
	const infoB = {};
	infoB.name = "moduleB.js";
	infoB.rawModule = true;
	infoB.dependencies = ["456.js"];

	LibraryFileAnalyzerGetDependencyInfosStub.returns({
		"moduleA.js": infoA,
		"moduleB.js": infoB
	});

	const library = {
		name: "a.library",

		// LibraryFileAnalyzer.getDependencyInfos() is stubbed! Therefore this content is irrelevant.
		buffer: async () => ""
	};
	await resourcePool.addResource(library);
	const moduleA = {
		name: "moduleA.js",
		buffer: async () => "var foo,bar,some;"
	};
	await resourcePool.addResource(moduleA);
	const moduleB = {
		name: "moduleB.js",
		buffer: async () => "var foo,bar,some; jQuery.sap.require(\"moduleC\");"
	};
	await resourcePool.addResource(moduleB);

	t.deepEqual(resourcePool._resources, [library, moduleA, moduleB], "resources have been added to resources array");
	t.is(resourcePool._resourcesByName.get("a.library"), library,
		"library a has been added to the _resourcesByName map");
	t.is(resourcePool._resourcesByName.size, 3, "library a was added to _resourcesByName map");
	t.deepEqual(resourcePool._rawModuleInfos.get("moduleA.js"), infoA, "module info has been added to _rawModuleInfos");
	t.deepEqual(resourcePool._rawModuleInfos.get("moduleB.js"), infoB, "module info has been added to _rawModuleInfos");

	const actualResourceA = await resourcePool.findResourceWithInfo("moduleA.js");
	t.true(actualResourceA.info instanceof ModuleInfo);
	t.deepEqual(actualResourceA.info.dependencies, ["123.js"],
		"configured dependencies should have been dded");
	t.true(actualResourceA.info.requiresTopLevelScope, "'some' is the global variable to be exposed");
	t.deepEqual(actualResourceA.info.exposedGlobals, ["some"],
		"global names should be known from analysis step");

	const actualResourceB = await resourcePool.findResourceWithInfo("moduleB.js");
	t.true(actualResourceB.info instanceof ModuleInfo);
	t.deepEqual(actualResourceB.info.dependencies, ["moduleC.js", "jquery.sap.global.js", "456.js"],
		"dependencies from analsyis and raw info should have been merged");
	t.true(actualResourceB.info.requiresTopLevelScope);
	t.deepEqual(actualResourceB.info.exposedGlobals, ["foo", "bar", "some"],
		"global names should be known from analsyis step");
});

