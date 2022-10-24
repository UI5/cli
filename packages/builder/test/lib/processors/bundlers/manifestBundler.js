import test from "ava";
import yazl from "yazl";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();

	t.context.log = {
		verbose: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub(),
	};

	t.context.zip = new yazl.ZipFile();
	sinon.spy(t.context.zip, "addBuffer");

	t.context.manifestBundler = await esmock("../../../../lib/processors/bundlers/manifestBundler.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:processors:bundlers:manifestBundler").returns(t.context.log)
		},
		"yazl": {
			ZipFile: sinon.stub().returns(t.context.zip)
		}
	});
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("manifestBundler with empty resources", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	const options = {};
	await manifestBundler({resources, options});
	t.is(t.context.zip.addBuffer.callCount, 0);
	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 0);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest path not starting with '/resources'", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	resources.push({
		name: "manifest.json",
		getPath: () => "pony/manifest.json",
		getBuffer: async () => JSON.stringify({
			"sap.app": {}
		})
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 0, "should not be called");

	t.is(t.context.log.verbose.callCount, 1);
	t.deepEqual(t.context.log.verbose.getCall(0).args,
		["Not bundling resource with path pony/manifest.json since it is not based on path /resources/pony/"],
		"should be called with correct arguments");
	t.is(t.context.log.warn.callCount, 1);
	t.deepEqual(t.context.log.warn.getCall(0).args,
		["Could not find any resources for i18n bundle 'pony/i18n'"]);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest without i18n section in sap.app", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => JSON.stringify({
			"sap.app": {}
		})
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 1, "should be called once");
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args, ["{\"sap.app\":{}}", "manifest.json"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 1);
	t.deepEqual(t.context.log.warn.getCall(0).args,
		["Could not find any resources for i18n bundle '/resources/pony/i18n'"]);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n string", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => JSON.stringify({
			"sap.app": {
				"i18n": "i18n-bundle/i18n.properties"
			}
		})
	});
	resources.push({
		name: "i18n.properties",
		getPath: () => "/resources/pony/i18n-bundle/i18n.properties",
		getBuffer: async () => "A=B"
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 2);
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args,
		["{\"sap.app\":{\"i18n\":\"i18n-bundle/i18n.properties\"}}", "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(1).args,
		["A=B", "i18n-bundle/i18n.properties"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 0);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n object (bundleUrl)", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	const manifestString = JSON.stringify({
		"sap.app": {
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"supportedLocales": ["en", "de"],
				"fallbackLocale": "en"
			}
		}
	});
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => manifestString
	});
	resources.push({
		name: "i18n_de.properties",
		getPath: () => "/resources/pony/i18n/i18n_de.properties",
		getBuffer: async () => "A=B"
	});
	resources.push({
		name: "i18n_en.properties",
		getPath: () => "/resources/pony/i18n/i18n_en.properties",
		getBuffer: async () => "A=C"
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony",
		propertiesExtension: ".properties"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 3, "should be called 3 times");
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 0);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n object (bundleName)", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	const manifestString = JSON.stringify({
		"sap.app": {
			"id": "pony",
			"i18n": {
				"bundleName": "pony.i18n.i18n",
				"supportedLocales": ["en", "de"],
				"fallbackLocale": "en"
			}
		}
	});
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => manifestString
	});
	resources.push({
		name: "i18n_de.properties",
		getPath: () => "/resources/pony/i18n/i18n_de.properties",
		getBuffer: async () => "A=B"
	});
	resources.push({
		name: "i18n_en.properties",
		getPath: () => "/resources/pony/i18n/i18n_en.properties",
		getBuffer: async () => "A=C"
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony",
		propertiesExtension: ".properties"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 3, "should be called 3 times");
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 0);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n enhanceWith", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	const manifestString = JSON.stringify({
		"sap.app": {
			"id": "pony",
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"enhanceWith": [
					{
						"bundleUrl": "enhancement1/i18n.properties"
					},
					{
						"bundleName": "pony.enhancement2.i18n"
					}
				]
			}
		}
	});
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => manifestString
	});
	resources.push({
		name: "i18n_de.properties",
		getPath: () => "/resources/pony/i18n/i18n_de.properties",
		getBuffer: async () => "A=B"
	});
	resources.push({
		name: "i18n_en.properties",
		getPath: () => "/resources/pony/i18n/i18n_en.properties",
		getBuffer: async () => "A=C"
	});
	resources.push({
		name: "i18n.properties",
		getPath: () => "/resources/pony/enhancement1/i18n.properties",
		getBuffer: async () => "A=enhancement1"
	});
	resources.push({
		name: "i18n.properties",
		getPath: () => "/resources/pony/enhancement2/i18n.properties",
		getBuffer: async () => "A=enhancement2"
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony",
		propertiesExtension: ".properties"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 5, "should be called 5 times");
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(3).args, ["A=enhancement1", "enhancement1/i18n.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.zip.addBuffer.getCall(4).args, ["A=enhancement2", "enhancement2/i18n.properties"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 0);
	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest with missing i18n files", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	const manifestString = JSON.stringify({
		"sap.app": {
			"id": "pony",
			"i18n": {
				"bundleUrl": "i18n/i18n.properties",
				"enhanceWith": [
					{
						"bundleUrl": "enhancement1/i18n.properties"
					},
					{
						"bundleName": "pony.enhancement2.i18n"
					}
				]
			}
		}
	});
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => manifestString
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony",
		propertiesExtension: ".properties"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 1, "should be called 1 time");
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 3);
	t.deepEqual(t.context.log.warn.getCall(0).args, [
		`Could not find any resources for i18n bundle '/resources/pony/i18n'`
	]);
	t.deepEqual(t.context.log.warn.getCall(1).args, [
		`Could not find any resources for i18n bundle '/resources/pony/enhancement1'`
	]);
	t.deepEqual(t.context.log.warn.getCall(2).args, [
		`Could not find any resources for i18n bundle '/resources/pony/enhancement2'`
	]);

	t.is(t.context.log.error.callCount, 0);
});

test.serial("manifestBundler with manifest with ui5:// url", async (t) => {
	const {manifestBundler} = t.context;
	const resources = [];
	const manifestString = JSON.stringify({
		"sap.app": {
			"id": "pony",
			"i18n": {
				"bundleUrl": "ui5://pony/i18n/i18n.properties"
			}
		}
	});
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => manifestString
	});
	resources.push({
		name: "i18n_de.properties",
		getPath: () => "/resources/pony/i18n/i18n_de.properties",
		getBuffer: async () => "A=B"
	});
	resources.push({
		name: "i18n_en.properties",
		getPath: () => "/resources/pony/i18n/i18n_en.properties",
		getBuffer: async () => "A=C"
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony",
		propertiesExtension: ".properties"
	};

	await manifestBundler({resources, options});

	t.is(t.context.zip.addBuffer.callCount, 1, "should be called 1 time");
	t.deepEqual(t.context.zip.addBuffer.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");

	t.is(t.context.log.verbose.callCount, 0);
	t.is(t.context.log.warn.callCount, 1);
	t.deepEqual(t.context.log.warn.getCall(0).args, [
		`Using the ui5:// protocol for i18n bundles is currently not supported ` +
		`('ui5://pony/i18n/i18n.properties' in /resources/pony/manifest.json)`
	]);
	t.is(t.context.log.error.callCount, 0);
});
