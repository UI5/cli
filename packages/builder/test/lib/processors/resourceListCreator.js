const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

let resourceListCreator = require("../../../lib/processors/resourceListCreator");
const resourceFactory = require("@ui5/fs").resourceFactory;

test.beforeEach((t) => {
	// Spying logger of processors/bootstrapHtmlTransformer
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("builder:processors:resourceListCreator");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	t.context.logErrorSpy = sinon.spy(loggerInstance, "error");

	// Re-require tested module
	resourceListCreator = mock.reRequire("../../../lib/processors/resourceListCreator");
});

test.afterEach.always((t) => {
	mock.stop("@ui5/logger");
	t.context.logErrorSpy.restore();
});

test.serial("Empty resources", async (t) => {
	const result = await resourceListCreator({
		resources: []
	});
	t.deepEqual(result, []);
});

test.serial("Empty resources but options", async (t) => {
	const result = await resourceListCreator({
		resources: [],
		options: {
			externalResources: {
				"mycomp": [".*dbg.js"]
			}
		}
	});
	t.deepEqual(result, []);
});

test.serial("Orphaned resources", async (t) => {
	// Does not fail by default
	const resource = resourceFactory.createResource({
		path: "/resources/nomodule.foo",
		string: "bar content"
	});
	await resourceListCreator({
		resources: [resource]
	});
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("Orphaned resources (failOnOrphans: true)", async (t) => {
	const resource = resourceFactory.createResource({
		path: "/resources/nomodule.foo",
		string: "bar content"
	});
	const errorObject = await t.throwsAsync(() => {
		return resourceListCreator({
			resources: [resource],
			options: {
				failOnOrphans: true
			}
		});
	});
	t.is(errorObject.message,
		"resources.json generation failed with error: " +
		"There are 1 resources which could not be assigned to components.");
	t.is(t.context.logErrorSpy.callCount, 1);
	t.is(t.context.logErrorSpy.getCall(0).args[0],
		"resources.json generation failed because of unassigned resources: nomodule.foo");
});

// 114,134-168,174-175

test.serial("components and themes", async (t) => {
	const componentResource = resourceFactory.createResource({
		path: "/resources/mylib/manifest.json",
		string: "bar content"
	});
	const themeResource = resourceFactory.createResource({
		path: "/resources/themes/a/.theming",
		string: "base less content"
	});
	const resources = await resourceListCreator({
		resources: [componentResource, themeResource]
	});

	t.is(resources.length, 2);
	const libResourceJson = resources[0];
	const themeResourceJson = resources[1];
	t.is(libResourceJson.getPath(), "/resources/mylib/resources.json");
	t.is(themeResourceJson.getPath(), "/resources/themes/a/resources.json");

	const libResourcesJsonContent = await libResourceJson.getString();
	const themeResourcesJsonContent = await themeResourceJson.getString();
	t.is(libResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": "manifest.json",
			"module": "mylib/manifest.json",
			"size": 11
		},
		{
			"name": "resources.json",
			"size": 183
		}
	]
}`);
	t.is(themeResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": ".theming",
			"size": 17,
			"theme": "a"
		},
		{
			"name": "resources.json",
			"size": 159
		}
	]
}`);
});

test.serial("XML View with control resource as dependency", async (t) => {
	const myAppManifestJsonResource = resourceFactory.createResource({
		path: "/resources/my/app/manifest.json",
		string: JSON.stringify({"sap.app": {"id": "my.app"}})
	});
	const myAppXmlViewResource = resourceFactory.createResource({
		path: "/resources/my/app/view/Main.view.xml",
		string: `<mvc:View
			controllerName="my.app.controller.Main"
			xmlns="my.lib"
			xmlns:myapp="my.app.controls"
			xmlns:mvc="sap.ui.core.mvc">

			<!-- Existing control, should be listed as "required" -->
			<Button></Button>

			<!-- Nonexistent control, should not be listed -->
			<NonexistentControl></NonexistentControl>

			<!-- Existing control within same project (app), should be listed as "required" -->
			<myapp:Button></myapp:Button>

			<!-- Nonexistent control within same project (app), should not be listed -->
			<myapp:NonexistentControl></myapp:NonexistentControl>

		</mvc:View>`
	});
	const myAppButtonResource = resourceFactory.createResource({
		path: "/resources/my/app/controls/Button.js",
		string: ""
	});
	const myLibButtonResource = resourceFactory.createResource({
		path: "/resources/my/lib/Button.js",
		string: ""
	});

	const resourcesJson = await resourceListCreator({
		resources: [myAppManifestJsonResource, myAppXmlViewResource, myAppButtonResource],
		dependencyResources: [myLibButtonResource]
	});

	t.is(resourcesJson.length, 1, "One resources.json should be returned");
	const myAppResourcesJson = resourcesJson[0];
	t.is(myAppResourcesJson.getPath(), "/resources/my/app/resources.json");
	const myAppResourcesJsonContent = await myAppResourcesJson.getString();
	t.is(myAppResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": "controls/Button.js",
			"module": "my/app/controls/Button.js",
			"size": 0,
			"format": "raw"
		},
		{
			"name": "manifest.json",
			"module": "my/app/manifest.json",
			"size": 27
		},
		{
			"name": "resources.json",
			"size": 523
		},
		{
			"name": "view/Main.view.xml",
			"module": "my/app/view/Main.view.xml",
			"size": 592,
			"required": [
				"my/app/controller/Main.controller.js",
				"my/app/controls/Button.js",
				"my/lib/Button.js"
			]
		}
	]
}`);
});
