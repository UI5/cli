const test = require("ava");

const Builder = require("../../../../lib/lbt/bundle/Builder");
const ResourcePool = require("../../../../lib/lbt/resources/ResourcePool");


test("integration: createBundle EVOBundleFormat (ui5loader.js)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "jquery.sap.global-dbg.js",
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "myModule.js",
		buffer: async () => "sap.ui.define([], function(){var mine = {}; return mine;});"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			filters: ["jquery.sap.global-dbg.js"]
		}, {
			declareRawModules: undefined,
			mode: "raw",
			filters: ["myModule.js"],
			sort: undefined
		}, {
			mode: "require",
			filters: ["ui5loader.js"]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {numberOfParts: 1, decorateBootstrapModule: true});
	t.deepEqual(oResult.name, "Component-preload.js");
	const expectedContent = `window["sap-ui-optimized"] = true;
sap.ui.require.preload({
	"jquery.sap.global-dbg.js":function(){sap.ui.define([], function(){return {};});
}
});
sap.ui.define([], function(){var mine = {}; return mine;});
sap.ui.requireSync("ui5loader");
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optomization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.deepEqual(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, 241, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global-dbg.js", "myModule.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle UI5BundleFormat (non ui5loader.js)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "sap-ui-core.js",
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "jquery.sap.global-dbg.js",
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "myModule.js",
		buffer: async () => "sap.ui.define([], function(){var mine = {}; return mine;});"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
		sections: [{
			mode: "preload",
			filters: ["jquery.sap.global-dbg.js"]
		}, {
			declareRawModules: undefined,
			mode: "raw",
			filters: ["myModule.js"],
			sort: undefined
		}, {
			mode: "require",
			filters: ["sap-ui-core.js"]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {numberOfParts: 1, decorateBootstrapModule: true});
	t.deepEqual(oResult.name, "Component-preload.js");
	const expectedContent = `jQuery.sap.registerPreloadedModules({
"version":"2.0",
"modules":{
	"jquery.sap.global-dbg.js":function(){sap.ui.define([], function(){return {};});
}
}});
sap.ui.define([], function(){var mine = {}; return mine;});
sap.ui.requireSync("sap-ui-core");
`;
	t.deepEqual(oResult.content, expectedContent, "Ui5BundleFormat should start with registerPreloadedModules " +
		"and should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from sap-ui-core.js");
	t.deepEqual(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, 251, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global-dbg.js", "myModule.js"],
		"bundle info subModules are correct");
});
