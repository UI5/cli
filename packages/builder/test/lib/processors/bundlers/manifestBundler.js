const test = require("ava");

const yazl = require("yazl");
const sinon = require("sinon");
const mock = require("mock-require");

let manifestBundler = require("../../../../lib/processors/bundlers/manifestBundler");

test.beforeEach((t) => {
	// Spying logger of processors/bundlers/manifestBundler
	const log = require("@ui5/logger");
	const loggerInstance = log.getLogger("builder:processors:bundlers:manifestBundler");
	mock("@ui5/logger", {
		getLogger: () => loggerInstance
	});
	mock.reRequire("@ui5/logger");
	t.context.logVerboseSpy = sinon.spy(loggerInstance, "verbose");

	// Re-require tested module
	manifestBundler = mock.reRequire("../../../../lib/processors/bundlers/manifestBundler");


	const zip = new yazl.ZipFile();
	t.context.addBufferSpy = sinon.spy(zip, "addBuffer");
	t.context.yazlZipFile = sinon.stub(yazl, "ZipFile").returns(zip);
});

test.afterEach.always((t) => {
	mock.stop("@ui5/logger");
	t.context.logVerboseSpy.restore();
	t.context.yazlZipFile.restore();
	t.context.addBufferSpy.restore();
});

test.serial("manifestBundler with empty resources", async (t) => {
	const resources = [];
	const options = {};
	await manifestBundler({resources, options});
	t.deepEqual(t.context.addBufferSpy.callCount, 0, "should not be called");
	t.deepEqual(t.context.logVerboseSpy.callCount, 0, "should not be called");
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
	t.deepEqual(t.context.logVerboseSpy.callCount, 1, "should be called once");
	t.deepEqual(t.context.logVerboseSpy.getCall(0).args,
		["Not bundling resource with path pony/manifest.json since it is not based on path /resources/pony/"],
		"should be called with correct arguments");
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
	t.deepEqual(t.context.addBufferSpy.callCount, 1, "should be called once");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, ["{\"sap.app\":{}}", "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.logVerboseSpy.callCount, 0, "should not be called");
});

test.serial("manifestBundler with manifest with i18n string", async (t) => {
	const resources = [];
	resources.push({
		name: "manifest.json",
		getPath: () => "/resources/pony/manifest.json",
		getBuffer: async () => JSON.stringify({
			"sap.app": {
				"i18n": "i18n/i18n.properties"
			}
		})
	});
	const options = {
		descriptor: "manifest.json",
		namespace: "pony"
	};
	await manifestBundler({resources, options});
	t.deepEqual(t.context.addBufferSpy.callCount, 1, "should be called once");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args,
		["{\"sap.app\":{\"i18n\":\"i18n/i18n.properties\"}}", "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.logVerboseSpy.callCount, 0, "should not be called");
});

test.serial("manifestBundler with manifest with i18n object", async (t) => {
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
	t.deepEqual(t.context.addBufferSpy.callCount, 3, "should be called 3 times");
	t.deepEqual(t.context.logVerboseSpy.callCount, 0, "should not be called");
	t.deepEqual(t.context.addBufferSpy.getCall(0).args, [manifestString, "manifest.json"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(1).args, ["A=B", "i18n/i18n_de.properties"],
		"should be called with correct arguments");
	t.deepEqual(t.context.addBufferSpy.getCall(2).args, ["A=C", "i18n/i18n_en.properties"],
		"should be called with correct arguments");
});
