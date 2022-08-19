const test = require("ava");
const sinon = require("sinon");
const {pd} = require("pretty-data");
const BundleResolver = require("../../../../lib/lbt/bundle/Resolver");
const AutoSplitter = require("../../../../lib/lbt/bundle/AutoSplitter");
const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");

function createMockPool(dependencies) {
	return {
		async findResourceWithInfo(name) {
			const info = new ModuleInfo(name);
			dependencies.forEach((dependency) => {
				info.addDependency(dependency);
			});
			if (name === "c.js") {
				info.compressedSize = 512;
			}
			return {
				info,
				buffer: async () => Buffer.from(name.padStart(2048, "*")),
				getProject: () => {
					return {
						getPropertiesFileSourceEncoding: () => "ISO-8859-1"
					};
				},
				resource: {
					getBuffer: async () => Buffer.from(name.padStart(2048, "*"))
				}
			};
		},
		resources: [{
			name: "a.js"
		}, {
			name: "c.js"
		}, {
			name: "b.json"
		}, {
			name: "x.view.xml"
		}, {
			name: "c.properties"
		}]
	};
}

test("integration: AutoSplitter with numberOfParts 1", async (t) => {
	const pool = createMockPool(["mydep"]);
	const autoSplitter = new AutoSplitter(pool, new BundleResolver(pool));
	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
		sections: [{
			mode: "preload",
			filters: ["x.view.xml", "c.properties", "b.json"], // intentionally unsorted
			resolve: false,
			resolveConditional: false,
			renderer: false
		}]
	};
	const oResult = await autoSplitter.run(bundleDefinition, {numberOfParts: 1});
	t.is(oResult.length, 1, "There should be only one part created since numberOfParts option is 1");
	t.deepEqual(oResult[0], {
		name: `Component-preload-0.js`,
		sections: [{
			mode: "preload",
			filters: ["b.json", "c.properties", "x.view.xml"], // preload section modules should be sorted
			name: undefined
		}]
	});
});

test("integration: AutoSplitter with numberOfParts 2", async (t) => {
	const pool = createMockPool(["a.js", "b.json"]);
	const autoSplitter = new AutoSplitter(pool, new BundleResolver(pool));
	const bundleDefinition = {
		name: `Component-preload.js`,
		defaultFileTypes: [".js", ".fragment.xml", ".view.xml", ".properties", ".json"],
		sections: [{
			mode: "preload",
			filters: ["a.js", "b.json", "x.view.xml"],
			resolve: false,
			resolveConditional: false,
			renderer: false,
			modules: ["a.js", "b.json", "x.view.xml"]
		}, {
			mode: "preload",
			filters: ["c.js", "c.properties"],
			resolve: false,
			resolveConditional: false,
			renderer: false,
			modules: ["c.js", "c.properties"]
		}, {
			mode: "provided"
		}, {
			mode: "raw",
			modules: ["a.js", "b.json"],
			filters: ["a.js", "b.json"],
			sectionDefinition: {
				declareRawModules: [],
				sort: false
			}
		}, {
			mode: "require",
			filters: ["a.js", "c.js"],
			modules: ["a.js", "c.js"]
		}],
		configuration: {}
	};
	const oResult = await autoSplitter.run(bundleDefinition, {numberOfParts: 2, optimize: false});
	t.is(oResult.length, 2, "2 parts expected");
	t.deepEqual(oResult[0], {
		name: `Component-preload-0.js`,
		sections: [{
			mode: "preload",
			filters: ["a.js"],
			name: undefined
		}],
		configuration: {}
	}, "first part should contain only a.js since its size is only 2048");
	t.deepEqual(oResult[1], {
		name: `Component-preload-1.js`,
		sections: [{
			mode: "preload",
			filters: ["b.json", "x.view.xml"],
			name: undefined
		}, {
			mode: "preload",
			filters: ["c.js", "c.properties"],
			name: undefined
		}, {
			declareRawModules: undefined,
			mode: "raw",
			filters: [],
			sort: undefined
		}, {
			mode: "require",
			filters: ["a.js", "c.js"]
		}]
	}, "second part should contain the other resources");
});


test("_calcMinSize: compressedSize", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return {
				info: {
					compressedSize: 123,
					size: 333
				}
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	t.is(await autoSplitter._calcMinSize("mymodule.js"), 123);
});

test("_calcMinSize: js resource (optimize=false)", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return {
				info: {
					size: 333,
					compressedSize: 333
				},
				buffer: async () => "var test = 5;",
				getProject: () => undefined
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	t.is(await autoSplitter._calcMinSize("mymodule.js"), 13);
});

test.serial("_calcMinSize: js resource (optimize=true)", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return {
				info: {
					size: 333,
					compressedSize: 333
				},
				buffer: async () => "var test = 5;",
				getProject: () => undefined
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);

	// The optimize flag should not be taken into account and the resource
	// should not get optimized by the AutoSplitter.
	autoSplitter.optimize = true;

	t.is(await autoSplitter._calcMinSize("mymodule.js"), 13);
});

test("_calcMinSize: properties resource", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			let content = "1234ß";
			return {
				buffer: async () => Buffer.from(content),
				resource: {
					setString: (string) => {
						content = string;
					},
					getBuffer: async () => Buffer.from(content, "latin1")
				},
				getProject: () => {
					return {
						getPropertiesFileSourceEncoding: () => "ISO-8859-1"
					};
				}
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	t.is(await autoSplitter._calcMinSize("mymodule.properties"), 10, "length of 1234\\u00df");
});

test("_calcMinSize: xml view resource", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return {
				buffer: async () => "12345",
				getProject: () => undefined
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	autoSplitter.optimizeXMLViews = true;
	t.is(await autoSplitter._calcMinSize("mymodule.view.xml"), 5);
});

test("_calcMinSize: xml view resource without optimizeXMLViews", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return {
				buffer: async () => "123456",
				getProject: () => undefined
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	t.is(await autoSplitter._calcMinSize("mymodule.view.xml"), 6);
});

test.serial("_calcMinSize: optimize xml view resource", async (t) => {
	const stubXmlmin = sinon.stub(pd, "xmlmin").returns("xxx123");
	const pool = {
		findResourceWithInfo: function() {
			return {
				buffer: async () => "xxx",
				getProject: () => undefined
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	autoSplitter.optimizeXMLViews = true;
	autoSplitter.optimize = true;
	t.is(await autoSplitter._calcMinSize("mymodule.view.xml"), 6);
	stubXmlmin.restore();
});

test.serial("_calcMinSize: optimize xml view resource and pre tag", async (t) => {
	const stubXmlmin = sinon.spy(pd, "xmlmin");
	const pool = {
		findResourceWithInfo: function() {
			return {
				buffer: async () => "<xml><pre>asd</pre>",
				getProject: () => undefined
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	autoSplitter.optimizeXMLViews = true;
	autoSplitter.optimize = true;
	t.false(stubXmlmin.called, "xmlmin should not be called");
	t.is(await autoSplitter._calcMinSize("mymodule.view.xml"), 19);
	stubXmlmin.restore();
});

test("_calcMinSize: no resource", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return null;
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	t.is(await autoSplitter._calcMinSize("mymodule.properties"), 0);
});

test("_calcMinSize: unknown resource with info", async (t) => {
	const pool = {
		findResourceWithInfo: function() {
			return {
				info: {
					size: 47
				}
			};
		}
	};
	const autoSplitter = new AutoSplitter(pool);
	t.is(await autoSplitter._calcMinSize("mymodule.mjs"), 47);
});
