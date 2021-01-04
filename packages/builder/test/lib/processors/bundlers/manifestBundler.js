const test = require("ava");

const yazl = require("yazl");
const sinon = require("sinon");
const mock = require("mock-require");

let manifestBundler = require("../../../../lib/processors/bundlers/manifestBundler");

test.beforeEach((t) => {
	// Stubbing logger of processors/bundlers/manifestBundler
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("builder:processors:bundlers:manifestBundler");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	t.context.logVerboseSpy = sinon.stub(loggerInstance, "verbose");
	t.context.logWarnSpy = sinon.stub(loggerInstance, "warn");
	t.context.logErrorSpy = sinon.stub(loggerInstance, "error");

	// Re-require tested module
	manifestBundler = mock.reRequire("../../../../lib/processors/bundlers/manifestBundler");


	const zip = new yazl.ZipFile();
	t.context.addBufferSpy = sinon.spy(zip, "addBuffer");
	t.context.yazlZipFile = sinon.stub(yazl, "ZipFile").returns(zip);
});

test.afterEach.always(() => {
	mock.stopAll();
	sinon.restore();
});

test.serial("manifestBundler with empty resources", async (t) => {
	const resources = [];
	const options = {};
	await manifestBundler({resources, options});
	t.is(t.context.addBufferSpy.callCount, 0);
	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 0);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest path not starting with '/resources'", async (t) => {
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

	t.deepEqual(t.context.addBufferSpy.callCount, 0, "should not be called");

	t.is(t.context.logVerboseSpy.callCount, 1);
	t.deepEqual(t.context.logVerboseSpy.getCall(0).args,
		["Not bundling resource with path pony/manifest.json since it is not based on path /resources/pony/"],
		"should be called with correct arguments");
	t.is(t.context.logWarnSpy.callCount, 1);
	t.deepEqual(t.context.logWarnSpy.getCall(0).args,
		["Could not find any resources for i18n bundle 'pony/i18n'"]);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest without i18n section in sap.app", async (t) => {
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

	t.is(t.context.addBufferSpy.callCount, 1, "should be called once");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, ["{\"sap.app\":{}}", "manifest.json"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 1);
	t.deepEqual(t.context.logWarnSpy.getCall(0).args,
		["Could not find any resources for i18n bundle '/resources/pony/i18n'"]);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n string", async (t) => {
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

	t.deepEqual(t.context.addBufferSpy.callCount, 2);
	t.deepEqual(t.context.addBufferSpy.getCall(0).args,
		["{\"sap.app\":{\"i18n\":\"i18n-bundle/i18n.properties\"}}", "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(1).args,
		["A=B", "i18n-bundle/i18n.properties"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 0);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n object (bundleUrl)", async (t) => {
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

	t.is(t.context.addBufferSpy.callCount, 3, "should be called 3 times");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 0);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n object (bundleName)", async (t) => {
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

	t.is(t.context.addBufferSpy.callCount, 3, "should be called 3 times");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 0);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest with i18n enhanceWith", async (t) => {
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

	t.is(t.context.addBufferSpy.callCount, 5, "should be called 5 times");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(3).args, ["A=enhancement1", "enhancement1/i18n.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(4).args, ["A=enhancement2", "enhancement2/i18n.properties"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 0);
	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest with missing i18n files", async (t) => {
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

	t.is(t.context.addBufferSpy.callCount, 1, "should be called 1 time");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 3);
	t.deepEqual(t.context.logWarnSpy.getCall(0).args, [
		`Could not find any resources for i18n bundle '/resources/pony/i18n'`
	]);
	t.deepEqual(t.context.logWarnSpy.getCall(1).args, [
		`Could not find any resources for i18n bundle '/resources/pony/enhancement1'`
	]);
	t.deepEqual(t.context.logWarnSpy.getCall(2).args, [
		`Could not find any resources for i18n bundle '/resources/pony/enhancement2'`
	]);

	t.is(t.context.logErrorSpy.callCount, 0);
});

test.serial("manifestBundler with manifest with ui5:// url", async (t) => {
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

	t.is(t.context.addBufferSpy.callCount, 1, "should be called 1 time");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");

	t.is(t.context.logVerboseSpy.callCount, 0);
	t.is(t.context.logWarnSpy.callCount, 1);
	t.deepEqual(t.context.logWarnSpy.getCall(0).args, [
		`Using the ui5:// protocol for i18n bundles is currently not supported ` +
		`('ui5://pony/i18n/i18n.properties' in /resources/pony/manifest.json)`
	]);
	t.is(t.context.logErrorSpy.callCount, 0);
});
