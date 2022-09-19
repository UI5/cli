/* eslint-disable max-len */
const test = require("ava");
const sinon = require("sinon");
const mock = require("mock-require");

const Builder = require("../../../../lib/lbt/bundle/Builder");
const ResourcePool = require("../../../../lib/lbt/resources/ResourcePool");

// Node.js itself tries to parse sourceMappingURLs in all JavaScript files. This is unwanted and might even lead to
// obscure errors when dynamically generating Data-URI soruceMappingURL values.
// Therefore use this constant to never write the actual string.
const SOURCE_MAPPING_URL = "//" + "# sourceMappingURL";

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
		string: function() {
			return this.buffer();
		},
		buffer: async () => {
			return invalidJsonContent;
		}
	};
	const result = await builder.writePreloadModule("invalid.json", undefined, invalidJsonResource);

	t.is(verboseLogStub.callCount, 2, "called 2 times");
	t.is(verboseLogStub.firstCall.args[0], "Failed to parse JSON file %s. Ignoring error, skipping compression.",
		"first verbose log argument 0 is correct");
	t.is(verboseLogStub.firstCall.args[1], "invalid.json", "first verbose log argument 1 is correct");
	t.deepEqual(verboseLogStub.secondCall.args[0], new SyntaxError("Unexpected token { in JSON at position 19"),
		"second verbose log");

	t.true(result, "result is true");
	t.is(writeStub.callCount, 1, "Writer is called once");
});

test("integration: createBundle with exposedGlobals", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "a.js",
		getPath: () => "a.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "function One(){return 1;}"
	});
	pool.addResource({
		name: "ui5loader.js",
		getPath: () => "ui5loader.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => ""
	});
	pool.addResource({
		name: "a.library",
		getPath: () => "a.library",
		string: function() {
			return this.buffer();
		},
		buffer: async () => `<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
	<appData>
		<packaging xmlns="http://www.sap.com/ui5/buildext/packaging" version="2.0" >
			  <module-infos>
				<raw-module name="a.js"
					requiresTopLevelScope="false" />
			</module-infos>
		</packaging>
	</appData>
</library>`
	});

	const bundleDefinition = {
		name: `library-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: ["a.js"]
		}, {
			mode: "require",
			filters: ["ui5loader.js"]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {numberOfParts: 1, decorateBootstrapModule: true});
	t.is(oResult.name, "library-preload.js");
	const expectedContent = `//@ui5-bundle library-preload.js
window["sap-ui-optimized"] = true;
sap.ui.require.preload({
	"a.js":function(){
function One(){return 1;}
this.One=One;
}
},"preload-section");
sap.ui.requireSync("ui5loader");
${SOURCE_MAPPING_URL}=library-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat " +
		"should contain:" +
		" preload part from a.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "library-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["a.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle EVOBundleFormat (ui5loader.js)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		getPath: () => "ui5loader.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "jquery.sap.global-dbg.js",
		getPath: () => "jquery.sap.global-dbg.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "myModule.js",
		getPath: () => "myModule.js",
		string: function() {
			return this.buffer();
		},
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
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
window["sap-ui-optimized"] = true;
sap.ui.require.preload({
	"jquery.sap.global-dbg.js":function(){
sap.ui.define([], function(){return {};});
}
},"preload-section");
//@ui5-bundle-raw-include myModule.js
(function(){window.mine = {};}());
sap.ui.requireSync("ui5loader");
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optimization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global-dbg.js", "myModule.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle EVOBundleFormat, using predefine calls", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		getPath: () => "ui5loader.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({ // the pool must contain this to activate optimization markers
		name: "jquery.sap.global-dbg.js",
		getPath: () => "jquery.sap.global-dbg.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "jquery.sap.pony1.js",
		getPath: () => "jquery.sap.pony1.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define(); // hello"
	});
	pool.addResource({
		name: "jquery.sap.pony2.js",
		getPath: () => "jquery.sap.pony2.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => `sap.
		ui.define
		/*hello*/
				();`
	});
	pool.addResource({
		name: "myRawModule.js",
		getPath: () => "myRawModule.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(){window.mine = {};}());"
	});
	pool.addResource({
		name: "myModuleUsingGlobalScope.js",
		getPath: () => "myModuleUsingGlobalScope.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "var magic = {};"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js",
				"myModuleUsingGlobalScope.js",
				"jquery.sap.pony1.js",
				"jquery.sap.pony2.js"
			]
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
		optimize: true
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
window["sap-ui-optimized"] = true;
sap.ui.predefine("jquery.sap.global", [], function(){return {};});
sap.ui.predefine("jquery.sap.pony1"); // hello
sap.
		ui.predefine
		/*hello*/
				("jquery.sap.pony2");
sap.ui.require.preload({
	"myModuleUsingGlobalScope.js":'var magic = {};'
},"preload-section");
//@ui5-bundle-raw-include myRawModule.js
(function(){window.mine = {};}());
sap.ui.requireSync("ui5loader");
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optimization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js",
			"jquery.sap.pony1.js",
			"jquery.sap.pony2.js",
			"myModuleUsingGlobalScope.js",
			"myRawModule.js"
		], "bundle info subModules are correct");
});

test("integration: createBundle EVOBundleFormat, using predefine calls, no optimize", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		getPath: () => "ui5loader.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({ // the pool must contain this to activate optimization markers
		name: "jquery.sap.global-dbg.js",
		getPath: () => "jquery.sap.global-dbg.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define([], function(){return {};});"
	});
	pool.addResource({
		name: "jquery.sap.pony1.js",
		getPath: () => "jquery.sap.pony1.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define(); // hello"
	});
	pool.addResource({
		name: "jquery.sap.pony2.js",
		getPath: () => "jquery.sap.pony2.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => `sap.
		ui.define
		/*hello*/
				();`
	});
	pool.addResource({
		name: "myRawModule.js",
		getPath: () => "myRawModule.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(){window.mine = {};}());"
	});
	pool.addResource({
		name: "myModuleUsingGlobalScope.js",
		getPath: () => "myModuleUsingGlobalScope.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "var magic = {};"
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js",
				"myModuleUsingGlobalScope.js",
				"jquery.sap.pony1.js",
				"jquery.sap.pony2.js"
			]
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
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
window["sap-ui-optimized"] = true;
sap.ui.predefine("jquery.sap.global", [], function(){return {};});
sap.ui.predefine("jquery.sap.pony1"); // hello
sap.
		ui.predefine
		/*hello*/
				("jquery.sap.pony2");
sap.ui.require.preload({
	"myModuleUsingGlobalScope.js":'var magic = {};'
},"preload-section");
//@ui5-bundle-raw-include myRawModule.js
(function(){window.mine = {};}());
sap.ui.requireSync("ui5loader");
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optimization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js",
			"jquery.sap.pony1.js",
			"jquery.sap.pony2.js",
			"myModuleUsingGlobalScope.js",
			"myRawModule.js"
		], "bundle info subModules are correct");
});

test("integration: createBundle (bootstrap bundle)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "ui5loader.js",
		getPath: () => "ui5loader.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "sap/ui/core/Core.js",
		getPath: () => "sap/ui/core/Core.js",
		string: function() {
			return this.buffer();
		},
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
	t.is(oResult.name, "bootstrap.js");
	const expectedContent = `//@ui5-bundle bootstrap.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include ui5loader.js
(function(__global) {sap.ui.require = function(){};}(window));
sap.ui.predefine("sap/ui/core/Core", [],function(){return {};});
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
${SOURCE_MAPPING_URL}=bootstrap.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optimization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "bootstrap.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["ui5loader.js", "sap/ui/core/Core.js"],
		"bundle info subModules are correct");
});

test("integration: Legacy test: createBundle without ui5loader.js presence also uses modern API", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "sap-ui-core.js",
		getPath: () => "sap-ui-core.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "jquery.sap.global-dbg.js",
		getPath: () => "jquery.sap.global-dbg.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "sap.ui.define([], function(){/* comment */ return {};});"
	});
	pool.addResource({
		name: "myModule.js",
		getPath: () => "myModule.js",
		string: function() {
			return this.buffer();
		},
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
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
sap.ui.require.preload({
	"jquery.sap.global-dbg.js":function(){
sap.ui.define([], function(){/* comment */ return {};});
}
},"preload-section");
//@ui5-bundle-raw-include myModule.js
(function(){window.mine = {};}());
sap.ui.requireSync("sap-ui-core");
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Ui5BundleFormat should start with registerPreloadedModules " +
		"and should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from sap-ui-core.js");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global-dbg.js", "myModule.js"],
		"bundle info subModules are correct");
});

test("integration: createBundle (bootstrap bundle, UI5BundleFormat)", async (t) => {
	const pool = new ResourcePool();
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(__global) {sap.ui.require = function(){};}(window));"
	});
	pool.addResource({
		name: "myRawModule.js",
		getPath: () => "myRawModule.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "(function(){window.mine = {};}());"
	});
	pool.addResource({
		name: "sap/ui/core/Core.js",
		getPath: () => "sap/ui/core/Core.js",
		string: function() {
			return this.buffer();
		},
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
	t.is(oResult.name, "bootstrap.js");
	const expectedContent = `//@ui5-bundle bootstrap.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include jquery.sap.global.js
(function(__global) {sap.ui.require = function(){};}(window));
//@ui5-bundle-raw-include myRawModule.js
(function(){window.mine = {};}());
jQuery.sap.declare('jquery.sap.global', false);
jQuery.sap.declare('myRawModule', false);
sap.ui.predefine("sap/ui/core/Core", [],function(){return {};});
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
${SOURCE_MAPPING_URL}=bootstrap.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat should start with optimization and " +
		"should contain:" +
		" preload part from jquery.sap.global-dbg.js" +
		" raw part from myModule.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "bootstrap.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["jquery.sap.global.js", "myRawModule.js", "sap/ui/core/Core.js"],
		"bundle info subModules are correct");
});

test.serial("integration: createBundle with bundleInfo", async (t) => {
	const logger = require("@ui5/logger");
	const verboseLogStub = sinon.stub();
	const warnLogStub = sinon.stub();
	const myLoggerInstance = {
		verbose: verboseLogStub,
		warn: warnLogStub
	};
	sinon.stub(logger, "getLogger").returns(myLoggerInstance);
	const BuilderWithStub = mock.reRequire("../../../../lib/lbt/bundle/Builder");

	const pool = new ResourcePool();
	pool.addResource({
		name: "a.js",
		getPath: () => "a.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "function One(){return 1;}"
	});
	pool.addResource({
		name: "b.js",
		getPath: () => "b.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "function Two(){return 2;}"
	});
	pool.addResource({
		name: "c.js",
		getPath: () => "c.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => "function Three(){return 3;}"
	});
	pool.addResource({
		name: "ui5loader.js",
		getPath: () => "ui5loader.js",
		string: function() {
			return this.buffer();
		},
		buffer: async () => ""
	});
	pool.addResource({
		name: "a.library",
		getPath: () => "a.library",
		string: function() {
			return this.buffer();
		},
		buffer: async () => `<?xml version="1.0" encoding="UTF-8" ?>
<library xmlns="http://www.sap.com/sap.ui.library.xsd" >
	<appData>
		<packaging xmlns="http://www.sap.com/ui5/buildext/packaging" version="2.0" >
			  <module-infos>
				<raw-module name="a.js"
					requiresTopLevelScope="false" />
			</module-infos>
		</packaging>
	</appData>
</library>`
	});

	const bundleDefinition = {
		name: `library-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: ["a.js"]
		}, {
			mode: "require",
			filters: ["ui5loader.js"]
		}, {
			mode: "bundleInfo",
			name: "my-custom-bundle", // without .js, should emit a warning
			filters: ["b.js"]
		}, {
			mode: "bundleInfo",
			name: "my-other-custom-bundle.js", // with .js
			filters: ["c.js"]
		}]
	};

	const builder = new BuilderWithStub(pool);
	const oResult = await builder.createBundle(bundleDefinition, {numberOfParts: 1, decorateBootstrapModule: true});
	t.is(oResult.name, "library-preload.js");
	const expectedContent = `//@ui5-bundle library-preload.js
window["sap-ui-optimized"] = true;
sap.ui.require.preload({
	"a.js":function(){
function One(){return 1;}
this.One=One;
}
},"preload-section");
sap.ui.requireSync("ui5loader");
sap.ui.loader.config({bundlesUI5:{
"my-custom-bundle":['b.js'],
"my-other-custom-bundle.js":['c.js']
}});
${SOURCE_MAPPING_URL}=library-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "EVOBundleFormat " +
		"should contain:" +
		" preload part from a.js" +
		" require part from ui5loader.js");
	t.is(oResult.bundleInfo.name, "library-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules, ["a.js", "b.js", "c.js"],
		"bundle info subModules are correct");

	t.is(warnLogStub.callCount, 1);
	t.deepEqual(warnLogStub.getCall(0).args, [
		`bundleInfo section name 'my-custom-bundle' is missing a file extension. ` +
		`The info might not work as expected. ` +
		`The name must match the bundle filename (incl. extension such as '.js')`
	]);
});

test("integration: createBundle using predefine calls with source maps and a single, simple source", async (t) => {
	const pool = new ResourcePool();

	// jquery.sap.global-dbg.js:
	// /* Some comment */
	// sap.ui.define([], function (){
	// 	console.log("Put me on a map!");
	// 	return {};
	// });

	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"console",
			"log"
		],
		"mappings": "AACAA,IAAIC,GAAGC,OAAO,GAAI,WACjBC,QAAQC,IAAI,oBACZ,MAAO",
		"file": "jquery.sap.global.js"
	};
	pool.addResource({
		name: "jquery.sap.global.js.map",
		getPath: () => "jquery.sap.global.js.map",
		buffer: async () => JSON.stringify(originalSourceMap)
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		buffer: async () => `sap.ui.define([],function(){console.log("Put me on a map!");return{}});
${SOURCE_MAPPING_URL}=jquery.sap.global.js.map`
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js"
			]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
sap.ui.predefine("jquery.sap.global", [],function(){console.log("Put me on a map!");return{}});
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Correct bundle content");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js"
		], "bundle info subModules are correct");
	const indexMap = JSON.parse(oResult.sourceMap);
	t.is(indexMap.sections.length, 1, "Bundle index source map contains one section");
	t.deepEqual(indexMap.sections[0].offset, {
		line: 1,
		column: 0
	}, "Section has correct offset");

	const expectedSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"console",
			"log"
		],
		"mappings": "AACAA,IAAIC,GAAGC,+BAAO,GAAI,WACjBC,QAAQC,IAAI,oBACZ,MAAO",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[0].map, expectedSourceMap, "Section contains correct map");
});

test("integration: createBundle using predefine calls with source maps and a single, multi-line source", async (t) => {
	const pool = new ResourcePool();

	// jquery.sap.global-dbg.js:
	// /* Some comment */
	// sap.
	// ui.
	// define(
	// [
	// ], function (){
	// 	console.log("Put me on a map!");
	// 	return {};
	// });

	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"console",
			"log"
		],
		"mappings": "AACAA,IACAC,GACAC,OACA,GACG,WACFC,QAAQC,IAAI,oBACZ,MAAO",
		"file": "jquery.sap.global.js"
	};
	pool.addResource({
		name: "jquery.sap.global.js.map",
		getPath: () => "jquery.sap.global.js.map",
		buffer: async () => JSON.stringify(originalSourceMap)
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		buffer: async () => `sap.ui.define([],function(){console.log("Put me on a map!");return{}});
${SOURCE_MAPPING_URL}=jquery.sap.global.js.map`
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js"
			]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		numberOfParts: 1,
		decorateBootstrapModule: true,
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
sap.ui.predefine("jquery.sap.global", [],function(){console.log("Put me on a map!");return{}});
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Correct bundle content");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js"
		], "bundle info subModules are correct");
	const indexMap = JSON.parse(oResult.sourceMap);
	t.is(indexMap.sections.length, 1, "Bundle index source map contains one section");
	t.deepEqual(indexMap.sections[0].offset, {
		line: 1,
		column: 0
	}, "Section has correct offset");

	const expectedSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"console",
			"log"
		],
		"mappings": "AACAA,IACAC,GACAC,+BACA,GACG,WACFC,QAAQC,IAAI,oBACZ,MAAO",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[0].map, expectedSourceMap, "Section contains correct map");
});

test("integration: createBundle using predefine calls with source maps and a single source with non-executable code in 1st line", async (t) => {
	const pool = new ResourcePool();

	// jquery.sap.global-dbg.js:
	// /*!
	//  * OpenUI5
	//  * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
	//  * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
	//  */
	// /*global XMLHttpRequest, localStorage, alert, document */
	// /**
	//  * @namespace jQuery
	//  * @public
	//  */
	// sap.ui.define([
	// 	// new sap/base/* modules
	// 	"sap/base/util/now", "sap/base/util/Version", "sap/base/assert", "sap/base/Log"
	// ], function(now, Version, assert, Log) {
	// 	return now;
	// });

	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": ";;;;;AAYAA,IAAIC,GAAGC,OAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"file": "jquery.sap.global.js"
	};
	pool.addResource({
		name: "jquery.sap.global.js.map",
		getPath: () => "jquery.sap.global.js.map",
		buffer: async () => JSON.stringify(originalSourceMap)
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		buffer: async () => `/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=jquery.sap.global.js.map`
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js"
			]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		numberOfParts: 1,
		decorateBootstrapModule: true,
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.predefine("jquery.sap.global", ["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Correct bundle content");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js"
		], "bundle info subModules are correct");
	const indexMap = JSON.parse(oResult.sourceMap);
	t.is(indexMap.sections.length, 1, "Bundle index source map contains one section");
	t.deepEqual(indexMap.sections[0].offset, {
		line: 1,
		column: 0
	}, "Section has correct offset");

	const expectedSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": "AAAA;;;;;AAYAA,IAAIC,GAAGC,+BAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[0].map, expectedSourceMap, "Section contains correct map");
});

test("integration: createBundle using predefine calls with source maps and multiple sources", async (t) => {
	const pool = new ResourcePool();

	// jquery.sap.global-dbg.js:
	// /*!
	//  * OpenUI5
	//  * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
	//  * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
	//  */
	// /*global XMLHttpRequest, localStorage, alert, document */
	// /**
	//  * @namespace jQuery
	//  * @public
	//  */
	// sap.ui.define([
	// 	// new sap/base/* modules
	// 	"sap/base/util/now", "sap/base/util/Version", "sap/base/assert", "sap/base/Log"
	// ], function(now, Version, assert, Log) {
	// 	return now;
	// });

	const originalGlobalSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": ";;;;;AAYAA,IAAIC,GAAGC,OAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"file": "jquery.sap.global.js"
	};
	pool.addResource({
		name: "jquery.sap.global.js.map",
		getPath: () => "jquery.sap.global.js.map",
		buffer: async () => JSON.stringify(originalGlobalSourceMap)
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		buffer: async () => `/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=jquery.sap.global.js.map`
	});

	// jquery.sap.dom-dbg.js:
	// /*!
	//  * OpenUI5
	//  * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
	//  * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
	//  */
	// // Provides functionality related to DOM analysis and manipulation which is not provided by jQuery itself.
	// sap.ui.define([
	// 	'jquery.sap.global', 'sap/ui/dom/containsOrEquals',
	// 	'sap/ui/core/syncStyleClass', 'sap/ui/dom/getOwnerWindow', 'sap/ui/dom/getScrollbarSize',
	// 	'sap/ui/dom/denormalizeScrollLeftRTL', 'sap/ui/dom/denormalizeScrollBeginRTL',
	// 	'sap/ui/dom/units/Rem', 'sap/ui/dom/jquery/Aria',
	// 	'sap/ui/dom/jquery/Selection', 'sap/ui/dom/jquery/zIndex', 'sap/ui/dom/jquery/parentByAttribute',
	// 	'sap/ui/dom/jquery/cursorPos', 'sap/ui/dom/jquery/selectText', 'sap/ui/dom/jquery/getSelectedText',
	// 	'sap/ui/dom/jquery/rect', 'sap/ui/dom/jquery/rectContains', 'sap/ui/dom/jquery/Focusable',
	// 	'sap/ui/dom/jquery/hasTabIndex', 'sap/ui/dom/jquery/scrollLeftRTL', 'sap/ui/dom/jquery/scrollRightRTL', 'sap/ui/dom/jquery/Selectors'
	// ], function(jQuery, domContainsOrEquals, fnSyncStyleClass, domGetOwnerWindow,
	// 	domGetScrollbarSize, domDenormalizeScrollLeftRTL, domDenormalizeScrollBeginRTL, domUnitsRem
	// 	/*
	// 	jqueryAria,
	// 	jquerySelection,
	// 	jqueryzIndex,
	// 	jqueryParentByAttribute,
	// 	jqueryCursorPos,
	// 	jquerySelectText,
	// 	jqueryGetSelectedText,
	// 	jqueryRect,
	// 	jqueryRectContains,
	// 	jqueryFocusable,
	// 	jqueryHasTabIndex,
	// 	jqueryScrollLeftRTL,
	// 	jqueryScrollRightRTL,
	// 	jquerySelectors*/
	// ) {
	// 	"use strict";
	// 	/**
	// 	 * Shortcut for document.getElementById().
	// 	 *
	// 	 * @param {string} sId The id of the DOM element to return
	// 	 * @param {Window} [oWindow=window] The window (optional)
	// 	 * @return {Element} The DOMNode identified by the given sId
	// 	 * @public
	// 	 * @since 0.9.0
	// 	 * @deprecated since 1.58 use <code>document.getElementById</code> instead
	// 	 */
	// 	jQuery.sap.domById = function domById(sId, oWindow) {
	// 		return sId ? (oWindow || window).document.getElementById(sId) : null;
	// 	};
	// 	return jQuery;
	// });

	const originalDomSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.dom-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"jQuery",
			"domContainsOrEquals",
			"fnSyncStyleClass",
			"domGetOwnerWindow",
			"domGetScrollbarSize",
			"domDenormalizeScrollLeftRTL",
			"domDenormalizeScrollBeginRTL",
			"domUnitsRem",
			"domById",
			"sId",
			"oWindow",
			"window",
			"document",
			"getElementById"
		],
		"mappings": ";;;;;AAOAA,IAAIC,GAAGC,OAAO,CACb,oBAAqB,8BACrB,6BAA8B,4BAA6B,8BAC3D,sCAAuC,uCACvC,uBAAwB,yBACxB,8BAA+B,2BAA4B,sCAC3D,8BAA+B,+BAAgC,oCAC/D,yBAA0B,iCAAkC,8BAC5D,gCAAiC,kCAAmC,mCAAoC,+BACtG,SAASC,OAAQC,EAAqBC,EAAkBC,EAC1DC,EAAqBC,EAA6BC,EAA8BC,GAiBhF,aAYAP,OAAOH,IAAIW,QAAU,SAASA,EAAQC,EAAKC,GAC1C,OAAOD,GAAOC,GAAWC,QAAQC,SAASC,eAAeJ,GAAO,MAGjE,OAAOT",
		"file": "jquery.sap.dom.js"
	};
	pool.addResource({
		name: "jquery.sap.dom.js.map",
		getPath: () => "jquery.sap.dom.js.map",
		buffer: async () => JSON.stringify(originalDomSourceMap)
	});
	pool.addResource({
		name: "jquery.sap.dom.js",
		getPath: () => "jquery.sap.dom.js",
		buffer: async () => `/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["jquery.sap.global","sap/ui/dom/containsOrEquals","sap/ui/core/syncStyleClass","sap/ui/dom/getOwnerWindow","sap/ui/dom/getScrollbarSize","sap/ui/dom/denormalizeScrollLeftRTL","sap/ui/dom/denormalizeScrollBeginRTL","sap/ui/dom/units/Rem","sap/ui/dom/jquery/Aria","sap/ui/dom/jquery/Selection","sap/ui/dom/jquery/zIndex","sap/ui/dom/jquery/parentByAttribute","sap/ui/dom/jquery/cursorPos","sap/ui/dom/jquery/selectText","sap/ui/dom/jquery/getSelectedText","sap/ui/dom/jquery/rect","sap/ui/dom/jquery/rectContains","sap/ui/dom/jquery/Focusable","sap/ui/dom/jquery/hasTabIndex","sap/ui/dom/jquery/scrollLeftRTL","sap/ui/dom/jquery/scrollRightRTL","sap/ui/dom/jquery/Selectors"],function(jQuery,e,u,o,s,i,r,a){"use strict";jQuery.sap.domById=function e(u,o){return u?(o||window).document.getElementById(u):null};return jQuery});
${SOURCE_MAPPING_URL}=jquery.sap.dom.js.map`
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js",
				"jquery.sap.dom.js"
			]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		numberOfParts: 1,
		decorateBootstrapModule: true,
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.predefine("jquery.sap.dom", ["jquery.sap.global","sap/ui/dom/containsOrEquals","sap/ui/core/syncStyleClass","sap/ui/dom/getOwnerWindow","sap/ui/dom/getScrollbarSize","sap/ui/dom/denormalizeScrollLeftRTL","sap/ui/dom/denormalizeScrollBeginRTL","sap/ui/dom/units/Rem","sap/ui/dom/jquery/Aria","sap/ui/dom/jquery/Selection","sap/ui/dom/jquery/zIndex","sap/ui/dom/jquery/parentByAttribute","sap/ui/dom/jquery/cursorPos","sap/ui/dom/jquery/selectText","sap/ui/dom/jquery/getSelectedText","sap/ui/dom/jquery/rect","sap/ui/dom/jquery/rectContains","sap/ui/dom/jquery/Focusable","sap/ui/dom/jquery/hasTabIndex","sap/ui/dom/jquery/scrollLeftRTL","sap/ui/dom/jquery/scrollRightRTL","sap/ui/dom/jquery/Selectors"],function(jQuery,e,u,o,s,i,r,a){"use strict";jQuery.sap.domById=function e(u,o){return u?(o||window).document.getElementById(u):null};return jQuery});
/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.predefine("jquery.sap.global", ["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Correct bundle content");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.dom.js",
			"jquery.sap.global.js"
		], "bundle info subModules are correct");
	const indexMap = JSON.parse(oResult.sourceMap);
	t.is(indexMap.sections.length, 2, "Bundle index source map contains two sections");
	t.deepEqual(indexMap.sections[0].offset, {
		line: 1,
		column: 0
	}, "Section one has correct offset");

	const expectedSourceMap1 = {
		"version": 3,
		"sources":
		[
			"jquery.sap.dom-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"jQuery",
			"domContainsOrEquals",
			"fnSyncStyleClass",
			"domGetOwnerWindow",
			"domGetScrollbarSize",
			"domDenormalizeScrollLeftRTL",
			"domDenormalizeScrollBeginRTL",
			"domUnitsRem",
			"domById",
			"sId",
			"oWindow",
			"window",
			"document",
			"getElementById"
		],
		"mappings": "AAAA;;;;;AAOAA,IAAIC,GAAGC,4BAAO,CACb,oBAAqB,8BACrB,6BAA8B,4BAA6B,8BAC3D,sCAAuC,uCACvC,uBAAwB,yBACxB,8BAA+B,2BAA4B,sCAC3D,8BAA+B,+BAAgC,oCAC/D,yBAA0B,iCAAkC,8BAC5D,gCAAiC,kCAAmC,mCAAoC,+BACtG,SAASC,OAAQC,EAAqBC,EAAkBC,EAC1DC,EAAqBC,EAA6BC,EAA8BC,GAiBhF,aAYAP,OAAOH,IAAIW,QAAU,SAASA,EAAQC,EAAKC,GAC1C,OAAOD,GAAOC,GAAWC,QAAQC,SAASC,eAAeJ,GAAO,MAGjE,OAAOT",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[0].map, expectedSourceMap1, "Section one contains correct map");
	t.deepEqual(indexMap.sections[1].offset, {
		line: 7,
		column: 0
	}, "Section two has correct offset");

	const expectedSourceMap2 = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": "AAAA;;;;;AAYAA,IAAIC,GAAGC,+BAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[1].map, expectedSourceMap2, "Section two contains correct map");
});

test("integration: createBundle using predefine calls with source maps and multiple sources 2", async (t) => {
	const pool = new ResourcePool();

	// jquery.sap.global-dbg.js:
	// /*!
	//  * OpenUI5
	//  * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
	//  * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
	//  */
	// /*global XMLHttpRequest, localStorage, alert, document */
	// /**
	//  * @namespace jQuery
	//  * @public
	//  */
	// sap.ui.define([
	// 	// new sap/base/* modules
	// 	"sap/base/util/now", "sap/base/util/Version", "sap/base/assert", "sap/base/Log"
	// ], function(now, Version, assert, Log) {
	// 	return now;
	// });

	const originalGlobalSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": ";;;;;AAYAA,IAAIC,GAAGC,OAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"file": "jquery.sap.global.js"
	};
	pool.addResource({
		name: "jquery.sap.global.js.map",
		getPath: () => "jquery.sap.global.js.map",
		buffer: async () => JSON.stringify(originalGlobalSourceMap)
	});
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		buffer: async () => `/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=jquery.sap.global.js.map`
	});

	// No source map for "jquery.sap.xom.js" => Transitive source map will be created
	pool.addResource({
		name: "jquery.sap.xom.js",
		getPath: () => "jquery.sap.xom.js",
		buffer: async () => `/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(function() {
	console.log("Test");
});
`
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js",
				"jquery.sap.xom.js"
			]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		numberOfParts: 1,
		decorateBootstrapModule: true,
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.predefine("jquery.sap.global", ["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.predefine("jquery.sap.xom", function() {
	console.log("Test");
});
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Correct bundle content");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js",
			"jquery.sap.xom.js",
		], "bundle info subModules are correct");
	const indexMap = JSON.parse(oResult.sourceMap);
	t.is(indexMap.sections.length, 2, "Bundle index source map contains two sections");
	t.deepEqual(indexMap.sections[0].offset, {
		line: 1,
		column: 0
	}, "Section one has correct offset");

	const expectedSourceMap1 = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": "AAAA;;;;;AAYAA,IAAIC,GAAGC,+BAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[0].map, expectedSourceMap1, "Section one contains correct map");
	t.deepEqual(indexMap.sections[1].offset, {
		line: 7,
		column: 0
	}, "Section two has correct offset");

	const expectedSourceMap2 = { // Transitive source map
		"version": 3,
		"sources":
		[
			"jquery.sap.xom.js"
		],
		"mappings": "AAAA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[1].map, expectedSourceMap2, "Section two contains correct map");
});

test("integration: createBundle using predefine calls with inline source maps and a single source", async (t) => {
	const pool = new ResourcePool();

	// jquery.sap.global-dbg.js:
	// /*!
	//  * OpenUI5
	//  * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
	//  * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
	//  */
	// /*global XMLHttpRequest, localStorage, alert, document */
	// /**
	//  * @namespace jQuery
	//  * @public
	//  */
	// sap.ui.define([
	// 	// new sap/base/* modules
	// 	"sap/base/util/now", "sap/base/util/Version", "sap/base/assert", "sap/base/Log"
	// ], function(now, Version, assert, Log) {
	// 	return now;
	// });

	// Source map should be identical to "single source" test above
	pool.addResource({
		name: "jquery.sap.global.js",
		getPath: () => "jquery.sap.global.js",
		buffer: async () => `/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImpxdWVyeS5zYXAuZ2xvYmFsLWRiZy5qcyJdLCJuYW1lcyI6WyJzYXAiLCJ1aSIsImRlZmluZSIsIm5vdyIsIlZlcnNpb24iLCJhc3NlcnQiLCJMb2ciXSwibWFwcGluZ3MiOiI7Ozs7O0FBWUFBLElBQUlDLEdBQUdDLE9BQU8sQ0FFYixvQkFBcUIsd0JBQXlCLGtCQUFtQixnQkFDL0QsU0FBU0MsRUFBS0MsRUFBU0MsRUFBUUMsR0FDakMsT0FBT0giLCJmaWxlIjoianF1ZXJ5LnNhcC5nbG9iYWwuanMifQ==`
	});

	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js"],
		sections: [{
			mode: "preload",
			name: "preload-section",
			filters: [
				"jquery.sap.global.js"
			]
		}]
	};

	const builder = new Builder(pool);
	const oResult = await builder.createBundle(bundleDefinition, {
		usePredefineCalls: true,
		numberOfParts: 1,
		decorateBootstrapModule: true,
		optimize: false
	});
	t.is(oResult.name, "Component-preload.js");
	const expectedContent = `//@ui5-bundle Component-preload.js
/*!
 * OpenUI5
 * (c) Copyright 2009-2021 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.predefine("jquery.sap.global", ["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log"],function(s,a,e,i){return s});
${SOURCE_MAPPING_URL}=Component-preload.js.map
`;
	t.deepEqual(oResult.content, expectedContent, "Correct bundle content");
	t.is(oResult.bundleInfo.name, "Component-preload.js", "bundle info name is correct");
	t.deepEqual(oResult.bundleInfo.size, expectedContent.length, "bundle info size is correct");
	t.deepEqual(oResult.bundleInfo.subModules,
		[
			"jquery.sap.global.js"
		], "bundle info subModules are correct");
	const indexMap = JSON.parse(oResult.sourceMap);
	t.is(indexMap.sections.length, 1, "Bundle index source map contains one section");
	t.deepEqual(indexMap.sections[0].offset, {
		line: 1,
		column: 0
	}, "Section has correct offset");

	const expectedSourceMap = {
		"version": 3,
		"sources":
		[
			"jquery.sap.global-dbg.js"
		],
		"names":
		[
			"sap",
			"ui",
			"define",
			"now",
			"Version",
			"assert",
			"Log"
		],
		"mappings": "AAAA;;;;;AAYAA,IAAIC,GAAGC,+BAAO,CAEb,oBAAqB,wBAAyB,kBAAmB,gBAC/D,SAASC,EAAKC,EAASC,EAAQC,GACjC,OAAOH",
		"sourceRoot": ""
	};
	t.deepEqual(indexMap.sections[0].map, expectedSourceMap, "Section contains correct map");
});

test("rewriteDefine (without moduleSourceMap)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module.js",
		moduleContent: "sap.ui.define([],(()=>1));",
		moduleSourceMap: undefined
	});

	t.is(moduleContent, `sap.ui.predefine("my/test/module", [],(()=>1));`);
	t.is(moduleSourceMap, undefined);
});

test("rewriteDefine (with moduleSourceMap)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;
	const {encode: encodeMappings, decode: decodeMappings} = require("@jridgewell/sourcemap-codec");

	const inputMappings = [
		[
			[
				0, 0, 0, 0, 0
			],
			[
				4, 0, 0, 4, 1
			],
			[
				7, 0, 0, 7, 2
			],
			[
				14, 0, 0, 14
			],
			[
				18, 0, 0, 18
			],
			[
				22, 0, 1, 8
			]
		]
	];

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module.js",
		moduleContent: "sap.ui.define([],(()=>1));",
		moduleSourceMap: {
			"version": 3,
			"file": "module.js",
			"sources": ["my/test/module-dbg.js"],
			"names": ["sap", "ui", "define"],
			"mappings": encodeMappings(inputMappings)
		}
	});

	const expectedMappings = JSON.parse(JSON.stringify(inputMappings));
	const expectedColumnDiff = `"my/test/module", `.length + "pre".length;
	expectedMappings[0][3][0] += expectedColumnDiff;
	expectedMappings[0][4][0] += expectedColumnDiff;
	expectedMappings[0][5][0] += expectedColumnDiff;

	t.is(moduleContent, `sap.ui.predefine("my/test/module", [],(()=>1));`);
	t.deepEqual(decodeMappings(moduleSourceMap.mappings), expectedMappings);
	t.deepEqual(moduleSourceMap, {
		"version": 3,
		"sources": ["my/test/module-dbg.js"],
		"names": ["sap", "ui", "define"],
		"mappings": encodeMappings(expectedMappings)
	});
});

test("rewriteDefine (with empty moduleSourceMap)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;
	const {encode: encodeMappings, decode: decodeMappings} = require("@jridgewell/sourcemap-codec");

	const inputMappings = [
		[
			[
				0, 0, 0, 0
			]
		]
	];

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module.js",
		moduleContent: `sap
.ui.define([], () => {
	return 1;
});`,
		moduleSourceMap: {
			"version": 3,
			"sources": ["my/test/module.js"],
			"mappings": encodeMappings(inputMappings)
		}
	});

	const expectedMappings = JSON.parse(JSON.stringify(inputMappings));

	t.is(moduleContent, `sap
.ui.predefine("my/test/module", [], () => {
	return 1;
});`);
	t.deepEqual(decodeMappings(moduleSourceMap.mappings), expectedMappings);
	t.deepEqual(moduleSourceMap, {
		"version": 3,
		"sources": ["my/test/module.js"],
		"mappings": encodeMappings(expectedMappings)
	});
});

test("rewriteDefine (with same module name)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module.js",
		moduleContent: "sap.ui.define(\"my/test/module\", [],(()=>1));",
		moduleSourceMap: undefined
	});

	t.is(moduleContent, `sap.ui.predefine("my/test/module", [],(()=>1));`);
	t.is(moduleSourceMap, undefined);
});

test("rewriteDefine (with other module name)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module1.js",
		moduleContent: "sap.ui.define(\"my/test/module\", [],(()=>1));",
		moduleSourceMap: undefined
	});

	t.is(moduleContent, `sap.ui.predefine("my/test/module", [],(()=>1));`);
	t.is(moduleSourceMap, undefined);
});

test("rewriteDefine (with same module name as template literal)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module.js",
		moduleContent: "sap.ui.define(`my/test/module`, [],(()=>1));",
		moduleSourceMap: undefined
	});

	t.is(moduleContent, "sap.ui.predefine(`my/test/module`, [],(()=>1));");
	t.is(moduleSourceMap, undefined);
});

test("rewriteDefine (with other module name as template literal)", async (t) => {
	const {rewriteDefine} = Builder.__localFunctions__;

	const {moduleContent, moduleSourceMap} = await rewriteDefine({
		moduleName: "my/test/module1.js",
		moduleContent: "sap.ui.define(`my/test/module`, [],(()=>1));",
		moduleSourceMap: undefined
	});

	t.is(moduleContent, "sap.ui.predefine(`my/test/module`, [],(()=>1));");
	t.is(moduleSourceMap, undefined);
});

test("getSourceMapForModule: Source map resource named after module resource (no sourceMappingURL)", async (t) => {
	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"module-dbg.js"
		],
		"names":
		[
		],
		"mappings": "XXXX",
		"file": "module.js"
	};
	const pool = new ResourcePool();
	pool.addResource({
		name: "my/test/module.js.map",
		getPath: () => "my/test/module.js.map",
		string: function() {
			return this.buffer();
		},
		buffer: async () => JSON.stringify(originalSourceMap)
	});

	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, originalSourceMap, "Correct source map retrieved via relative URL");
});
test("getSourceMapForModule: No source map available for debug variant", async (t) => {
	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"module-dbg.js"
		],
		"names":
		[
		],
		"mappings": "XXXX",
		"file": "module.js"
	};
	const pool = new ResourcePool();
	pool.addResource({
		name: "my/test/module.js.map",
		getPath: () => "my/test/module.js.map",
		string: function() {
			return this.buffer();
		},
		buffer: async () => JSON.stringify(originalSourceMap)
	});

	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module-dbg.js",
		moduleContent: `// Some content
`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, {
		mappings: "AAAA;AACA",
		sources: [
			"module-dbg.js",
		],
		version: 3,
	}, "Expected transitive source map has been generated");
});

test("getSourceMapForModule: Relative URL", async (t) => {
	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"module-dbg.js"
		],
		"names":
		[
		],
		"mappings": "XXXX",
		"file": "module.js"
	};
	const pool = new ResourcePool();
	pool.addResource({
		name: "my/test/module.js.map",
		getPath: () => "my/test/module.js.map",
		string: function() {
			return this.buffer();
		},
		buffer: async () => JSON.stringify(originalSourceMap)
	});

	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
${SOURCE_MAPPING_URL}=module.js.map`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, originalSourceMap, "Correct source map retrieved via relative URL");
});

test("getSourceMapForModule: Relative URL to resource that cannot be found", async (t) => {
	const pool = new ResourcePool();

	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
${SOURCE_MAPPING_URL}=module.js.map`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, {
		mappings: "AAAA;AACA",
		sources: [
			"module.js",
		],
		version: 3,
	}, "Expected transitive source map has been generated");
});

test("getSourceMapForModule: Full URL (not supported)", async (t) => {
	const pool = new ResourcePool();
	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
${SOURCE_MAPPING_URL}=https://ui5.sap.com/resources/my/test/module.js.map`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, {
		mappings: "AAAA;AACA",
		sources: [
			"module.js",
		],
		version: 3,
	}, "Expected transitive source map has been generated");
});

test("getSourceMapForModule: Absolute URL (not supported)", async (t) => {
	const pool = new ResourcePool();
	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
${SOURCE_MAPPING_URL}=/resources/my/test/module.js.map`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, {
		mappings: "AAAA;AACA",
		sources: [
			"module.js",
		],
		version: 3,
	}, "Expected transitive source map has been generated");
});

test("getSourceMapForModule: Data URI", async (t) => {
	const pool = new ResourcePool();
	const builder = new Builder(pool);
	const originalSourceMap = {
		"version": 3,
		"sources":
		[
			"module-dbg.js"
		],
		"names":
		[
		],
		"mappings": "XXXX",
		"file": "module.js"
	};
	const encodedSourceMap = Buffer.from(JSON.stringify(originalSourceMap)).toString("base64");
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
${SOURCE_MAPPING_URL}=data:application/json;charset=utf-8;base64,${encodedSourceMap}`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, originalSourceMap, "Encoded source map has been parsed correctly");
});

test("getSourceMapForModule: Data URI with incorrect encoding", async (t) => {
	const pool = new ResourcePool();
	const builder = new Builder(pool);
	const {moduleContent, moduleSourceMap} = await builder.getSourceMapForModule({
		moduleName: "my/test/module",
		resourcePath: "/resources/my/test/module.js",
		moduleContent: `// Some content
${SOURCE_MAPPING_URL}=data:application/pony;charset=utf-8;base64,AAAA`
	});

	t.is(moduleContent, "// Some content\n", "Source map URL has been removed from module content");
	t.deepEqual(moduleSourceMap, {
		mappings: "AAAA;AACA",
		sources: [
			"module.js",
		],
		version: 3,
	}, "Expected transitive source map has been generated");
});

test("createTransientSourceMap: includeContent=false", (t) => {
	const {createTransientSourceMap} = Builder.__localFunctions__;

	const res = createTransientSourceMap({
		moduleName: "my/test/module.js",
		moduleContent: `Some content
With
Multiple
Lines`,
		includeContent: false
	});
	t.deepEqual(res, {
		"version": 3,
		"sources": ["my/test/module.js"],
		"mappings": "AAAA;AACA;AACA;AACA"
	}, "Expected source map has been created");
});

test("createTransientSourceMap: includeContent=true", (t) => {
	const {createTransientSourceMap} = Builder.__localFunctions__;

	const moduleContent = `Some content
With
Multiple
Lines`;
	const res = createTransientSourceMap({
		moduleName: "my/test/module.js",
		moduleContent,
		includeContent: true
	});
	t.deepEqual(res, {
		version: 3,
		sources: ["my/test/module.js"],
		mappings: "AAAA;AACA;AACA;AACA",
		sourcesContent: [moduleContent]
	}, "Expected source map has been created");
});
