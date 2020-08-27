const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const Builder = require("../../../../lib/lbt/bundle/Builder");
const ResourcePool = require("../../../../lib/lbt/resources/ResourcePool");

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
});

test.serial("writePreloadModule: with invalid json content", async (t) => {
	const writeStub = sinon.stub();
	const logger = require("@ui5/logger");
	const verboseLogStub = sinon.stub();
	const myLoggerInstance = {
		verbose: verboseLogStub
	};
	sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const BuilderWithStub = mock.reRequire("../../../../lib/lbt/bundle/Builder");
	const invalidJsonContent = `{
	"a": 47,
	"b": {{include: asd}}
	}`;

	const builder = new BuilderWithStub({});
	builder.optimize = true;
	builder.outW = {
		write: writeStub
	};
	const invalidJsonResource = {
		buffer: async () => {
			return invalidJsonContent;
		}
	};
	const result = await builder.writePreloadModule("invalid.json", undefined, invalidJsonResource);


	t.is(verboseLogStub.callCount, 2, "called 2 times");
	t.is(verboseLogStub.firstCall.args[0], "Failed to parse JSON file %s. Ignoring error, skipping compression.", "first verbose log argument 0 is correct");
	t.is(verboseLogStub.firstCall.args[1], "invalid.json", "first verbose log argument 1 is correct");
	t.deepEqual(verboseLogStub.secondCall.args[0], new SyntaxError("Unexpected token { in JSON at position 19"), "second verbose log");

	t.true(result, "result is true");
	t.is(writeStub.callCount, 1, "Writer is called once");
});


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
		buffer: async () => "(function(){window.mine = {};}());"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
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
	const expectedContent = `//@ui5-bundle Component-preload.js
window["sap-ui-optimized"] = true;
sap.ui.require.preload({
	"jquery.sap.global-dbg.js":function(){sap.ui.define([], function(){return {};});
}
},"preload-section");
//@ui5-bundle-raw-include myModule.js
(function(){window.mine = {};}());
sap.ui.requireSync("ui5loader");
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optomization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.deepEqual(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global-dbg.js", "myModule.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle EVOBundleFormat, using predefine calls", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({ // the pool must contain this to activate optimization markers
		name: "jquery.sap.global-dbg.js",
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "myRawModule.js",
		buffer: async () => "(function(){window.mine = {};}());"
	});
	pool.addResource({
		name: "myModuleUsingGlobalScope.js",
		buffer: async () => "var magic = {};"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: ["jquery.sap.global.js", "myModuleUsingGlobalScope.js"]
		}, {
			declareRawModules: undefined,
			mode: "raw",
			filters: ["myRawModule.js"],
			sort: undefined
		}, {
			mode: "require",
			filters: ["ui5loader.js"]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		numberOfParts: 1,
		decorateBootstrapModule: true,
		optimize: true // Note: using 'optimize' makes the test sensitive to changes in terser
	});
	t.deepEqual(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
window["sap-ui-optimized"] = true;
sap.ui.predefine("jquery.sap.global",[],function(){return{}});
sap.ui.require.preload({
	"myModuleUsingGlobalScope.js":'var magic={};'
},"preload-section");
//@ui5-bundle-raw-include myRawModule.js
(function(){window.mine={}})();
sap.ui.requireSync("ui5loader");
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optomization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.deepEqual(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global.js", "myModuleUsingGlobalScope.js", "myRawModule.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle (bootstrap bundle)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "sap/ui/core/Core.js",
		buffer: async () => "sap.ui.define([],function(){return {};});"
	});

	const bundleDefinition = {
		name: `bootstrap.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "raw",
			filters: ["ui5loader.js"],
			declareRawModules: undefined,
			sort: undefined
		}, {
			mode: "preload",
			filters: ["sap/ui/core/Core.js"],
			resolve: true
		}, {
			mode: "require",
			filters: ["sap/ui/core/Core.js"]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		numberOfParts: 1,
		decorateBootstrapModule: true,
		addTryCatchRestartWrapper: true,
		optimize: true,
		usePredefineCalls: true
	});
	t.deepEqual(oResult.name, "bootstrap.js");
	const expectedContent = `//@ui5-bundle bootstrap.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include ui5loader.js
(function(i){sap.ui.require=function(){}})(window);
sap.ui.predefine("sap/ui/core/Core",[],function(){return{}});
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optomization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.deepEqual(oResult.bundleInfo.name, "bootstrap.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["ui5loader.js", "sap/ui/core/Core.js"],
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
		buffer: async () => "(function(){window.mine = {};}());"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
		sections: [{
			mode: "preload",
			name: "preload-section",
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
	const expectedContent = `//@ui5-bundle Component-preload.js
jQuery.sap.registerPreloadedModules({
"name":"preload-section",
"version":"2.0",
"modules":{
	"jquery.sap.global-dbg.js":function(){sap.ui.define([], function(){return {};});
}
}});
//@ui5-bundle-raw-include myModule.js
(function(){window.mine = {};}());
sap.ui.requireSync("sap-ui-core");
`;
	t.deepEqual(oResult.content, expectedContent, "Ui5BundleFormat should start with registerPreloadedModules " +
		"and should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from sap-ui-core.js");
	t.deepEqual(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global-dbg.js", "myModule.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle (bootstrap bundle, UI5BundleFormat)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "jquery.sap.global.js",
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "jquery.sap.global-dbg.js",
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "myRawModule.js",
		buffer: async () => "(function(){window.mine = {};}());"
	});
	pool.addResource({
		name: "sap/ui/core/Core.js",
		buffer: async () => "sap.ui.define([],function(){return {};});"
	});

	const bundleDefinition = {
		name: `bootstrap.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "raw",
			filters: ["jquery.sap.global.js", "myRawModule.js"],
			sort: false,
			declareRawModules: true
		}, {
			mode: "preload",
			filters: ["sap/ui/core/Core.js"],
			resolve: true
		}, {
			mode: "require",
			filters: ["sap/ui/core/Core.js"]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		numberOfParts: 1,
		decorateBootstrapModule: true,
		addTryCatchRestartWrapper: true,
		optimize: true,
		usePredefineCalls: true
	});
	t.deepEqual(oResult.name, "bootstrap.js");
	const expectedContent = `//@ui5-bundle bootstrap.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include jquery.sap.global.js
(function(i){sap.ui.require=function(){}})(window);
//@ui5-bundle-raw-include myRawModule.js
(function(){window.mine={}})();
jQuery.sap.declare('jquery.sap.global', false);
jQuery.sap.declare('myRawModule', false);
sap.ui.predefine("sap/ui/core/Core",[],function(){return{}});
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optomization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.deepEqual(oResult.bundleInfo.name, "bootstrap.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global.js", "myRawModule.js", "sap/ui/core/Core.js"],
		"bundle info subModules are correct");
});
