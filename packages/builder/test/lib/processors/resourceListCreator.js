import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import {createResource} from "@ui5/fs/resourceFactory";
import XMLTemplateAnalyzer from "../../../lib/lbt/analyzer/XMLTemplateAnalyzer.js";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.resourceListCreatorLog = {
		error: sinon.stub(),
		verbose: sinon.stub()
	};
	t.context.ResourceCollectorLog = {
		error: sinon.stub(),
		warn: sinon.stub(),
		verbose: sinon.stub()
	};

	class XMLTemplateAnalyzerSpy extends XMLTemplateAnalyzer {}
	t.context.XMLTemplateAnalyzerAnalyzeViewSpy = sinon.spy(XMLTemplateAnalyzerSpy.prototype, "analyzeView");

	t.context.resourceListCreator = await esmock("../../../lib/processors/resourceListCreator.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:processors:resourceListCreator")
				.returns(t.context.resourceListCreatorLog)
		},
		"../../../lib/lbt/resources/ResourceCollector.js":
			await esmock("../../../lib/lbt/resources/ResourceCollector.js", {
				"@ui5/logger": {
					getLogger: sinon.stub().withArgs("lbt:resources:ResourceCollector")
						.returns(t.context.ResourceCollectorLog)
				}
			})
	}, {
		"../../../lib/lbt/analyzer/XMLTemplateAnalyzer.js": XMLTemplateAnalyzerSpy
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("Empty resources", async (t) => {
	const {resourceListCreator, resourceListCreatorLog} = t.context;

	const result = await resourceListCreator({
		resources: []
	});
	t.deepEqual(result, []);
	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 1);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 0 resources"]);
});

test.serial("Empty resources but options", async (t) => {
	const {resourceListCreator, resourceListCreatorLog} = t.context;

	const result = await resourceListCreator({
		resources: [],
		options: {
			externalResources: {
				"mycomp": [".*dbg.js"]
			}
		}
	});
	t.deepEqual(result, []);
	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 1);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 0 resources"]);
});

test.serial("Orphaned resources", async (t) => {
	const {resourceListCreator, resourceListCreatorLog} = t.context;

	// Does not fail by default
	const resource = createResource({
		path: "/resources/nomodule.foo",
		string: "bar content"
	});
	await resourceListCreator({
		resources: [resource]
	});
	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 1);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 1 resources"]);
});

test.serial("Orphaned resources (failOnOrphans: true)", async (t) => {
	const {resourceListCreator, resourceListCreatorLog} = t.context;

	const resource = createResource({
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
	t.is(resourceListCreatorLog.error.callCount, 1);
	t.is(resourceListCreatorLog.error.getCall(0).args[0],
		"resources.json generation failed because of unassigned resources: nomodule.foo");
	t.is(resourceListCreatorLog.verbose.callCount, 1);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 1 resources"]);
});

test.serial("Components and themes", async (t) => {
	const {resourceListCreator, resourceListCreatorLog} = t.context;

	const componentResource = createResource({
		path: "/resources/mylib/manifest.json",
		string: "bar content"
	});
	const themeResource = createResource({
		path: "/resources/themes/a/.theming",
		string: "base less content"
	});
	const resources = await resourceListCreator({
		resources: [componentResource, themeResource]
	});

	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 3);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 2 resources"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(1).args,
		["\tWriting 'mylib/resources.json'"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(2).args,
		["\tWriting 'themes/a/resources.json'"]);


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
	const {resourceListCreator, resourceListCreatorLog} = t.context;

	const myAppManifestJsonResource = createResource({
		path: "/resources/my/app/manifest.json",
		string: JSON.stringify({"sap.app": {"id": "my.app"}})
	});
	const myAppXmlViewResource = createResource({
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
	const myAppButtonResource = createResource({
		path: "/resources/my/app/controls/Button.js",
		string: ""
	});
	const myLibButtonResource = createResource({
		path: "/resources/my/lib/Button.js",
		string: ""
	});

	const resourcesJson = await resourceListCreator({
		resources: [myAppManifestJsonResource, myAppXmlViewResource, myAppButtonResource],
		dependencyResources: [myLibButtonResource]
	});

	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 2);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 3 resources"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(1).args,
		["\tWriting 'my/app/resources.json'"]);

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

test.serial("Bundle containing an XML View with control resource as dependency", async (t) => {
	const {resourceListCreator, resourceListCreatorLog, ResourceCollectorLog} = t.context;

	const myAppManifestJsonResource = createResource({
		path: "/resources/my/app/manifest.json",
		string: JSON.stringify({"sap.app": {"id": "my.app"}})
	});
	const myAppXmlViewResource = createResource({
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
	// eslint-disable-next-line max-len
	const bundledXmlView = `<mvc:View controllerName="my.app.controller.Main" xmlns="my.lib" xmlns:myapp="my.app.controls" xmlns:mvc="sap.ui.core.mvc"><Button></Button><NonexistentControl></NonexistentControl><myapp:Button></myapp:Button><myapp:NonexistentControl></myapp:NonexistentControl></mvc:View>`;
	const myAppBundleResource = createResource({
		path: "/resources/my/app/bundle.js",
		string: `//@ui5-bundle my/app/bundle.js
sap.ui.require.preload({
	"my/app/view/Main.view.xml": '${bundledXmlView}',
	"my/app/controls/Button.js": ''
});
`
	});

	const myAppButtonResource = createResource({
		path: "/resources/my/app/controls/Button.js",
		string: ""
	});
	const myLibButtonResource = createResource({
		path: "/resources/my/lib/Button.js",
		string: ""
	});

	const resourcesJson = await resourceListCreator({
		resources: [myAppManifestJsonResource, myAppXmlViewResource, myAppButtonResource, myAppBundleResource],
		dependencyResources: [myLibButtonResource]
	});

	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 2);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 4 resources"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(1).args,
		["\tWriting 'my/app/resources.json'"]);

	t.is(ResourceCollectorLog.error.callCount, 0);
	t.is(ResourceCollectorLog.warn.callCount, 0);
	t.is(ResourceCollectorLog.verbose.callCount, 1);
	t.deepEqual(ResourceCollectorLog.verbose.getCall(0).args,
		["  Configured external resources filters (resources outside the namespace): (none)"]);

	t.is(resourcesJson.length, 1, "One resources.json should be returned");
	const myAppResourcesJson = resourcesJson[0];
	t.is(myAppResourcesJson.getPath(), "/resources/my/app/resources.json");
	const myAppResourcesJsonContent = await myAppResourcesJson.getString();
	t.is(myAppResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": "bundle.js",
			"module": "my/app/bundle.js",
			"size": 401,
			"merged": true,
			"required": [
				"my/app/controller/Main.controller.js",
				"my/lib/Button.js"
			],
			"included": [
				"my/app/view/Main.view.xml",
				"my/app/controls/Button.js"
			]
		},
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
			"size": 801
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

test.serial("Bundle containing subModule which is not available within provided resources", async (t) => {
	const {resourceListCreator, resourceListCreatorLog, ResourceCollectorLog} = t.context;

	const myAppManifestJsonResource = createResource({
		path: "/resources/my/app/manifest.json",
		string: JSON.stringify({"sap.app": {"id": "my.app"}})
	});

	const myAppBundleResource = createResource({
		path: "/resources/my/app/bundle.js",
		string: `//@ui5-bundle my/app/bundle.js
sap.ui.require.preload({
	"my/app/view/Main.view.xml": ''
});
`
	});

	const resourcesJson = await resourceListCreator({
		resources: [myAppManifestJsonResource, myAppBundleResource]
	});

	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 2);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 2 resources"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(1).args,
		["\tWriting 'my/app/resources.json'"]);

	t.is(ResourceCollectorLog.error.callCount, 0);
	t.is(ResourceCollectorLog.warn.callCount, 0);
	t.is(ResourceCollectorLog.verbose.callCount, 2);
	t.deepEqual(ResourceCollectorLog.verbose.getCall(0).args,
		["\tMissing submodule my/app/view/Main.view.xml included by my/app/bundle.js"]);
	t.deepEqual(ResourceCollectorLog.verbose.getCall(1).args,
		["  Configured external resources filters (resources outside the namespace): (none)"]);

	t.is(resourcesJson.length, 1, "One resources.json should be returned");
	const myAppResourcesJson = resourcesJson[0];
	t.is(myAppResourcesJson.getPath(), "/resources/my/app/resources.json");
	const myAppResourcesJsonContent = await myAppResourcesJson.getString();
	t.is(myAppResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": "bundle.js",
			"module": "my/app/bundle.js",
			"size": 93,
			"merged": true,
			"included": [
				"my/app/view/Main.view.xml"
			]
		},
		{
			"name": "manifest.json",
			"module": "my/app/manifest.json",
			"size": 27
		},
		{
			"name": "resources.json",
			"size": 338
		}
	]
}`);
});

test.serial("Bundles with subModules should not cause analyzing the same module multiple times", async (t) => {
	const {
		sinon, resourceListCreator, resourceListCreatorLog, ResourceCollectorLog, XMLTemplateAnalyzerAnalyzeViewSpy
	} = t.context;

	const myAppManifestJsonResource = createResource({
		path: "/resources/my/app/manifest.json",
		string: JSON.stringify({"sap.app": {"id": "my.app"}})
	});

	const xmlView1content = "<mvc:View xmlns:mvc=\"sap.ui.core.mvc\"></mvc:View>";
	const myAppViewResource1 = createResource({
		path: "/resources/my/app/View1.view.xml",
		string: xmlView1content
	});
	// Delay getBuffer to cause situation where the xml resource hasn't been analyzed
	// when processing the bundle subModules.
	// This should not lead to multiple analysis of the same resource. Instead it should
	// wait for the pending analysis to be finished
	sinon.stub(myAppViewResource1, "getBuffer").callsFake(() => {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve(Buffer.from(xmlView1content));
			}, 10);
		});
	});

	const myAppBundleResource1 = createResource({
		path: "/resources/my/app/bundle1.js",
		string: `//@ui5-bundle my/app/bundle1.js
sap.ui.require.preload({
	"my/app/View1.view.xml": '${xmlView1content}'
});
`
	});
	const myAppBundleResource2 = createResource({
		path: "/resources/my/app/bundle2.js",
		string: `//@ui5-bundle my/app/bundle2.js
sap.ui.require.preload({
	"my/app/View1.view.xml": '${xmlView1content}'
});
`
	});

	const resourcesJson = await resourceListCreator({
		resources: [myAppManifestJsonResource, myAppBundleResource1, myAppBundleResource2, myAppViewResource1]
	});

	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 2);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 4 resources"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(1).args,
		["\tWriting 'my/app/resources.json'"]);

	t.is(ResourceCollectorLog.error.callCount, 0);
	t.is(ResourceCollectorLog.warn.callCount, 0);
	t.is(ResourceCollectorLog.verbose.callCount, 1);
	t.deepEqual(ResourceCollectorLog.verbose.getCall(0).args,
		["  Configured external resources filters (resources outside the namespace): (none)"]);

	// XMLTemplateAnalyzer should only be called once, which means that the view was only analyzed once
	t.is(XMLTemplateAnalyzerAnalyzeViewSpy.callCount, 1);
	t.is(XMLTemplateAnalyzerAnalyzeViewSpy.getCall(0).args[1]._name,
		"my/app/View1.view.xml");

	t.is(resourcesJson.length, 1, "One resources.json should be returned");
	const myAppResourcesJson = resourcesJson[0];
	t.is(myAppResourcesJson.getPath(), "/resources/my/app/resources.json");
	const myAppResourcesJsonContent = await myAppResourcesJson.getString();
	t.is(myAppResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": "View1.view.xml",
			"module": "my/app/View1.view.xml",
			"size": 49
		},
		{
			"name": "bundle1.js",
			"module": "my/app/bundle1.js",
			"size": 139,
			"merged": true,
			"included": [
				"my/app/View1.view.xml"
			]
		},
		{
			"name": "bundle2.js",
			"module": "my/app/bundle2.js",
			"size": 139,
			"merged": true,
			"included": [
				"my/app/View1.view.xml"
			]
		},
		{
			"name": "manifest.json",
			"module": "my/app/manifest.json",
			"size": 27
		},
		{
			"name": "resources.json",
			"size": 580
		}
	]
}`);
});

test.serial("Bundle", async (t) => {
	const {resourceListCreator, resourceListCreatorLog, ResourceCollectorLog} = t.context;

	const myAppManifestJsonResource = createResource({
		path: "/resources/my/app/manifest.json",
		string: JSON.stringify({"sap.app": {"id": "my.app"}})
	});

	const myAppBundleResource = createResource({
		path: "/resources/my/app/bundle.js",
		string: `//@ui5-bundle my/app/bundle.js
sap.ui.require.preload({
	"my/app/module1.js": '',
	"my/app/module2.js": ''
});
`
	});

	const module1Resource = createResource({
		path: "/resources/my/app/module1.js",
		string: `sap.ui.define(['dep1'], function() {
			return function(x) {
				if (x === true) {
					sap.ui.require(["dep2"]);
				}
			}
		})`
	});

	const module2Resource = createResource({
		path: "/resources/my/app/module2.js",
		string: `sap.ui.define(['dep2'], function() {
			return function(x) {
				if (x === true) {
					sap.ui.require(["dep1", "dep3"]);
				}
			}
		})`
	});

	const resourcesJson = await resourceListCreator({
		resources: [myAppManifestJsonResource, myAppBundleResource, module1Resource, module2Resource],
	});

	t.is(resourceListCreatorLog.error.callCount, 0);
	t.is(resourceListCreatorLog.verbose.callCount, 2);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(0).args,
		["\tFound 4 resources"]);
	t.deepEqual(resourceListCreatorLog.verbose.getCall(1).args,
		["\tWriting 'my/app/resources.json'"]);

	t.is(ResourceCollectorLog.error.callCount, 0);
	t.is(ResourceCollectorLog.warn.callCount, 0);
	t.is(ResourceCollectorLog.verbose.callCount, 1);
	t.deepEqual(ResourceCollectorLog.verbose.getCall(0).args,
		["  Configured external resources filters (resources outside the namespace): (none)"]);

	t.is(resourcesJson.length, 1, "One resources.json should be returned");
	const myAppResourcesJson = resourcesJson[0];
	t.is(myAppResourcesJson.getPath(), "/resources/my/app/resources.json");
	const myAppResourcesJsonContent = await myAppResourcesJson.getString();
	t.is(myAppResourcesJsonContent, `{
	"_version": "1.1.0",
	"resources": [
		{
			"name": "bundle.js",
			"module": "my/app/bundle.js",
			"size": 111,
			"merged": true,
			"required": [
				"dep1.js",
				"dep2.js"
			],
			"condRequired": [
				"dep3.js"
			],
			"included": [
				"my/app/module1.js",
				"my/app/module2.js"
			]
		},
		{
			"name": "manifest.json",
			"module": "my/app/manifest.json",
			"size": 27
		},
		{
			"name": "module1.js",
			"module": "my/app/module1.js",
			"size": 129,
			"required": [
				"dep1.js"
			],
			"condRequired": [
				"dep2.js"
			]
		},
		{
			"name": "module2.js",
			"module": "my/app/module2.js",
			"size": 137,
			"required": [
				"dep2.js"
			],
			"condRequired": [
				"dep1.js",
				"dep3.js"
			]
		},
		{
			"name": "resources.json",
			"size": 786
		}
	]
}`);
});
