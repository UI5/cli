const test = require("ava");

const minifier = require("../../../lib/processors/minifier");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;

// Node.js itself tries to parse sourceMappingURLs in all JavaScript files. This is unwanted and might even lead to
// obscure errors when dynamically generating Data-URI soruceMappingURL values.
// Therefore use this constant to never write the actual string.
const SOURCE_MAPPING_URL = "//" + "# sourceMappingURL";


test("Basic minifier", async (t) => {
	const content = `/*!
 * \${copyright}
 */
 function myFunc(myArg) {
 	jQuery.sap.require("something");
 	console.log("Something required")
 }
myFun();
`;
	const testResource = resourceFactory.createResource({
		path: "/test.controller.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource}] = await minifier({
		resources: [testResource]
	});

	const expected = `/*!
 * \${copyright}
 */
function myFunc(e){jQuery.sap.require("something");console.log("Something required")}myFun();
${SOURCE_MAPPING_URL}=test.controller.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	t.deepEqual(await dbgResource.getString(), content, "Correct debug content");
	const expectedSourceMap = `{"version":3,"file":"test.controller.js",` +
		`"names":["myFunc","myArg","jQuery","sap","require","console","log","myFun"],` +
		`"sources":["test-dbg.controller.js"],` +
		`"mappings":";;;AAGC,SAASA,OAAOC,GACfC,OAAOC,IAAIC,QAAQ,aACnBC,QAAQC,IAAI,sBAEdC"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
});

test("Multiple resources", async (t) => {
	const content1 = `
function test1(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test1();`;
	const content2 = `
function test2(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test2();`;
	const content3 = `
function test3(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test3();`;

	const testResources = [
		resourceFactory.createResource({
			path: "/test1.controller.js",
			string: content1
		}),
		resourceFactory.createResource({
			path: "/test2.fragment.js",
			string: content2
		}),
		resourceFactory.createResource({
			path: "/test3.designtime.js",
			string: content3
		})
	];

	const resources = await minifier({
		resources: testResources
	});

	const expectedMinified1 = `function test1(t){var o=t;console.log(o)}test1();
${SOURCE_MAPPING_URL}=test1.controller.js.map`;
	const expectedMinified2 = `function test2(t){var o=t;console.log(o)}test2();
${SOURCE_MAPPING_URL}=test2.fragment.js.map`;
	const expectedMinified3 = `function test3(t){var o=t;console.log(o)}test3();
${SOURCE_MAPPING_URL}=test3.designtime.js.map`;

	const expectedSourceMap1 =
		`{"version":3,"file":"test1.controller.js",` +
		`"names":["test1","paramA","variableA","console","log"],"sources":["test1-dbg.controller.js"],` +
		`"mappings":"AACA,SAASA,MAAMC,GACd,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,GAEbF"}`;
	const expectedSourceMap2 =
		`{"version":3,"file":"test2.fragment.js",` +
		`"names":["test2","paramA","variableA","console","log"],"sources":["test2-dbg.fragment.js"],` +
		`"mappings":"AACA,SAASA,MAAMC,GACd,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,GAEbF"}`;
	const expectedSourceMap3 =
		`{"version":3,"file":"test3.designtime.js",` +
		`"names":["test3","paramA","variableA","console","log"],"sources":["test3-dbg.designtime.js"],` +
		`"mappings":"AACA,SAASA,MAAMC,GACd,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,GAEbF"}`;

	t.deepEqual(resources[0].resource.getPath(), "/test1.controller.js",
		"Correct resource path for minified content of resource 1");
	t.deepEqual(await resources[0].resource.getString(), expectedMinified1, "Correct minified content for resource 1");
	t.deepEqual(resources[0].dbgResource.getPath(), "/test1-dbg.controller.js",
		"Correct resource path for debug content of resource 1");
	t.deepEqual(await resources[0].dbgResource.getString(), content1, "Correct debug content for resource 1");
	t.deepEqual(resources[0].sourceMapResource.getPath(), "/test1.controller.js.map",
		"Correct resource path for source map content of resource 1");
	t.deepEqual(await resources[0].sourceMapResource.getString(), expectedSourceMap1,
		"Correct source map content for resource 1");

	t.deepEqual(resources[1].resource.getPath(), "/test2.fragment.js",
		"Correct resource path for minified content of resource 2");
	t.deepEqual(await resources[1].resource.getString(), expectedMinified2, "Correct minified content for resource 2");
	t.deepEqual(resources[1].dbgResource.getPath(), "/test2-dbg.fragment.js",
		"Correct resource path for debug content of resource 2");
	t.deepEqual(await resources[1].dbgResource.getString(), content2, "Correct debug content for resource 2");
	t.deepEqual(resources[1].sourceMapResource.getPath(), "/test2.fragment.js.map",
		"Correct resource path for source map content of resource 2");
	t.deepEqual(await resources[1].sourceMapResource.getString(), expectedSourceMap2,
		"Correct source map content for resource 2");

	t.deepEqual(resources[2].resource.getPath(), "/test3.designtime.js",
		"Correct resource path for minified content of resource 3");
	t.deepEqual(await resources[2].resource.getString(), expectedMinified3, "Correct minified content for resource 3");
	t.deepEqual(resources[2].dbgResource.getPath(), "/test3-dbg.designtime.js",
		"Correct resource path for debug content of resource 3");
	t.deepEqual(await resources[2].dbgResource.getString(), content3, "Correct debug content for resource 3");
	t.deepEqual(resources[2].sourceMapResource.getPath(), "/test3.designtime.js.map",
		"Correct resource path for source map content of resource 3");
	t.deepEqual(await resources[2].sourceMapResource.getString(), expectedSourceMap3,
		"Correct source map content for resource 3");
});

test("Different copyright", async (t) => {
	const content = `
/*
 * Copyright SAPUI5 Developers and other contributors
 */
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();
`;
	const testResource = resourceFactory.createResource({
		path: "/test.view.js",
		string: content
	});
	const [{resource, dbgResource, sourceMapResource}] = await minifier({
		resources: [testResource]
	});

	const expected = `/*
 * Copyright SAPUI5 Developers and other contributors
 */
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.view.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
	t.deepEqual(await dbgResource.getString(), content, "Correct debug content");
	const expectedSourceMap =
		`{"version":3,"file":"test.view.js",` +
		`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.view.js"],` +
		`"mappings":";;;AAIA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,GAEbF"}`;
	t.deepEqual(await sourceMapResource.getString(), expectedSourceMap, "Correct source map content");
});

test("minify raw module (@ui5-bundle-raw-include)", async (t) => {
	const content = `
//@ui5-bundle-raw-include sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource]
	});

	const expected = `//@ui5-bundle-raw-include sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("minify raw module (@ui5-bundle)", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource]
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("addSourceMappingUrl=false", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {
			addSourceMappingUrl: false
		}
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("addSourceMappingUrl=true", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {
			addSourceMappingUrl: true
		}
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("empty options object (addSourceMappingUrl defaults to true)", async (t) => {
	const content = `
//@ui5-bundle sap/ui/my/module.js
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;

	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const [{resource}] = await minifier({
		resources: [testResource],
		options: {}
	});

	const expected = `//@ui5-bundle sap/ui/my/module.js
function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	t.deepEqual(await resource.getString(), expected, "Correct minified content");
});

test("minification error", async (t) => {
	const content = `
this code can't be parsed!`;

	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	const error = await t.throwsAsync(minifier({
		resources: [testResource]
	}));

	t.regex(error.message, /Minification failed with error/, "Error should contain expected message");
	t.regex(error.message, /test\.js/, "Error should contain filename");
	t.regex(error.message, /col/, "Error should contain col");
	t.regex(error.message, /pos/, "Error should contain pos");
	t.regex(error.message, /line/, "Error should contain line");
});
