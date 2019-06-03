const test = require("ava");
const ResourcePool = require("../../../../lib/lbt/resources/ResourcePool");
const ResourceFilterList = require("../../../../lib/lbt/resources/ResourceFilterList");

const LibraryFileAnalyzer = require("../../../../lib/lbt/resources/LibraryFileAnalyzer");
const sinon = require("sinon");

test("findResources: based on pattern", async (t) => {
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

test("size", async (t) => {
	const resourcePool = new ResourcePool();
	t.deepEqual(resourcePool.size, 0, "size of empty pool is 0");

	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);
	t.deepEqual(resourcePool.size, 1, "size of pool is 1");
});

test("resources", async (t) => {
	const resourcePool = new ResourcePool();
	t.deepEqual(resourcePool.resources, [], "no resources in empty pool");

	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);
	t.deepEqual(resourcePool.resources, [resourceA], "resource a in pool");
});

class ResourcePoolWithRejectingModuleInfo extends ResourcePool {
	async getModuleInfo(name) {
		throw new Error("myerror");
	}
}

test("findResourceWithInfo: rejecting getModuleInfo", async (t) => {
	const resourcePool = new ResourcePoolWithRejectingModuleInfo();
	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);
	const resource = await resourcePool.findResourceWithInfo("a");
	t.falsy(resource.info, "in the rejection case the info is not there");
	t.deepEqual(resource, resourceA, "Although info was rejected resource is still found");
});

test.serial("findResourceWithInfo", async (t) => {
	const resourcePool = new ResourcePool();
	const resourceA = {name: "a"};
	resourcePool.addResource(resourceA);

	sinon.stub(resourcePool, "getModuleInfo").resolves("myInfo");

	const resource = await resourcePool.findResourceWithInfo("a");
	t.deepEqual(resource.info, "myInfo", "info is set correctly");
	sinon.restore();
});

test("getModuleInfo", async (t) => {
	const resourcePool = new ResourcePool();
	const code = "var test = 47;";
	const inputJsResource = {name: "a.js", buffer: async () => code};
	resourcePool.addResource(inputJsResource);
	const jsResource = await resourcePool.getModuleInfo("a.js");
	t.is(resourcePool._dependencyInfos.get(inputJsResource.name), jsResource,
		"info has been added to _dependencyInfos map");

	t.deepEqual(jsResource.name, inputJsResource.name, "name should be the same");
	t.deepEqual(jsResource.size, code.length, "size is the character length of code");
	t.true(jsResource.rawModule);
	t.deepEqual(jsResource.subModules, [], "does not contain submodules");
});

test("getModuleInfo: determineDependencyInfo for js templateAssembler code", async (t) => {
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
	t.is(resourcePool._dependencyInfos.get(inputJsResource.name), jsResource,
		"info has been added to _dependencyInfos map");
	t.deepEqual(jsResource.size, 372);
	t.deepEqual(jsResource.format, "ui5-define", "contains sap.ui.define therefore should be a ui5-define format");
	t.deepEqual(jsResource.name, "a.js");
	t.false(jsResource.rawModule);
	t.deepEqual(jsResource.subModules, []);
});

test("getModuleInfo: determineDependencyInfo for xml control and fragment", async (t) => {
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
	t.is(resourcePool._dependencyInfos.get(inputXmlControlResource.name), xmlControlResource,
		"info has been added to _dependencyInfos map");
	t.deepEqual(xmlControlResource.size, 298);
	t.falsy(xmlControlResource.format);
	t.deepEqual(xmlControlResource.name, "a.control.xml");
	t.false(xmlControlResource.rawModule);
	t.deepEqual(xmlControlResource.subModules, []);

	const xmlFragmentResource = await resourcePool.getModuleInfo("a.fragment.xml");
	t.is(resourcePool._dependencyInfos.get(inputXmlFragmentResource.name), xmlFragmentResource,
		"info has been added to _dependencyInfos map");
	t.deepEqual(xmlFragmentResource.size, 298);
	t.falsy(xmlFragmentResource.format);
	t.deepEqual(xmlFragmentResource.name, "a.fragment.xml");
	t.false(xmlFragmentResource.rawModule);
	t.deepEqual(xmlFragmentResource.subModules, []);
});

test("getModuleInfo: determineDependencyInfo for xml view", async (t) => {
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
	t.is(resourcePool._dependencyInfos.get(inputXmlViewResource.name), xmlViewResource,
		"info has been added to _dependencyInfos map");
	t.deepEqual(xmlViewResource.size, 315);
	t.falsy(xmlViewResource.format);
	t.deepEqual(xmlViewResource.name, "a.view.xml");
	t.false(xmlViewResource.rawModule);
	t.deepEqual(xmlViewResource.subModules, []);
});


test("addResource twice", async (t) => {
	const resourcePool = new ResourcePool();
	const resourceA = {name: "a"};

	resourcePool.addResource(resourceA);
	resourcePool.addResource(resourceA);
	t.deepEqual(resourcePool._resources, [resourceA, resourceA], "resource a has been added to resources array twice");
	t.is(resourcePool._resourcesByName.get("a"), resourceA, "resource a has been added to the _resourcesByName map");
	t.is(resourcePool._resourcesByName.size, 1, "resource a was added to _resourcesByName map");
});

test.serial("addResource: library", async (t) => {
	const resourcePool = new ResourcePool();

	const stubGetDependencyInfos = sinon.stub(LibraryFileAnalyzer, "getDependencyInfos").returns({
		myKeyA: "123",
		myKeyB: "456"
	});

	const library = {
		name: "a.library",
		buffer: async () => ""
	};
	await resourcePool.addResource(library);
	t.deepEqual(resourcePool._resources, [library], "library a has been added to resources array twice");
	t.is(resourcePool._resourcesByName.get("a.library"), library,
		"library a has been added to the _resourcesByName map");
	t.is(resourcePool._resourcesByName.size, 1, "library a was added to _resourcesByName map");
	t.deepEqual(resourcePool._rawModuleInfos.get("myKeyA"), "123", "module info has been added to _rawModuleInfos");
	t.deepEqual(resourcePool._rawModuleInfos.get("myKeyB"), "456", "module info has been added to _rawModuleInfos");
	stubGetDependencyInfos.restore();
});
