const test = require("ava");
const sinon = require("sinon");

const minify = require("../../../lib/tasks/minify");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

// Node.js itself tries to parse sourceMappingURLs in all JavaScript files. This is unwanted and might even lead to
// obscure errors when dynamically generating Data-URI soruceMappingURL values.
// Therefore use this constant to never write the actual string.
const SOURCE_MAPPING_URL = "//" + "# sourceMappingURL";

function createWorkspace() {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader: reader, writer: writer});
	return {reader, writer, workspace};
}

test.afterEach.always((t) => {
	sinon.restore();
});

test("integration: minify", async (t) => {
	const taskUtil = {
		setTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣",
			OmitFromBuildResult: "3️⃣"
		}
	};
	const {reader, writer, workspace} = createWorkspace();
	const content = `
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	await reader.write(testResource);

	await minify({
		workspace,
		taskUtil,
		options: {
			pattern: "/test.js"
		}
	});

	const expected = `function test(t){var o=t;console.log(o)}test();`;
	const res = await writer.byPath("/test.js");
	if (!res) {
		t.fail("Could not find /test.js in target locator");
	}
	t.deepEqual(await res.getString(), expected, "Correct file content");

	const resDbg = await writer.byPath("/test-dbg.js");
	if (!resDbg) {
		t.fail("Could not find /test-dbg.js in target locator");
	}
	t.deepEqual(await resDbg.getString(), content, "Correct debug-file content");

	const expectedSourceMap =
		`{"version":3,"file":"test.js",` +
		`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.js"],` +
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");

	t.is(taskUtil.setTag.callCount, 4, "taskUtil.setTag was called 4 times");
	t.deepEqual(taskUtil.setTag.getCall(0).args, [res, "1️⃣"], "First taskUtil.setTag call with expected arguments");
	t.deepEqual(taskUtil.setTag.getCall(1).args, [resDbg, "2️⃣"],
		"Second taskUtil.setTag call with expected arguments");
	t.deepEqual(taskUtil.setTag.getCall(2).args, [resSourceMap, "1️⃣"],
		"Third taskUtil.setTag call with expected arguments");
	t.deepEqual(taskUtil.setTag.getCall(3).args, [resSourceMap, "3️⃣"],
		"Fourth taskUtil.setTag call with expected arguments");
});

test("integration: minify omitSourceMapResources=false", async (t) => {
	const taskUtil = {
		setTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣",
			OmitFromBuildResult: "3️⃣"
		}
	};
	const {reader, writer, workspace} = createWorkspace();
	const content = `
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	await reader.write(testResource);

	await minify({
		workspace,
		taskUtil,
		options: {
			pattern: "/test.js",
			omitSourceMapResources: false
		}
	});

	const expected = `function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	const res = await writer.byPath("/test.js");
	if (!res) {
		t.fail("Could not find /test.js in target locator");
	}
	t.deepEqual(await res.getString(), expected, "Correct file content");

	const resDbg = await writer.byPath("/test-dbg.js");
	if (!resDbg) {
		t.fail("Could not find /test-dbg.js in target locator");
	}
	t.deepEqual(await resDbg.getString(), content, "Correct debug-file content");

	const expectedSourceMap =
		`{"version":3,"file":"test.js",` +
		`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.js"],` +
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");

	t.is(taskUtil.setTag.callCount, 3, "taskUtil.setTag was called 3 times");
	t.deepEqual(taskUtil.setTag.getCall(0).args, [res, "1️⃣"], "First taskUtil.setTag call with expected arguments");
	t.deepEqual(taskUtil.setTag.getCall(1).args, [resDbg, "2️⃣"],
		"Second taskUtil.setTag call with expected arguments");
	t.deepEqual(taskUtil.setTag.getCall(2).args, [resSourceMap, "1️⃣"],
		"Third taskUtil.setTag call with expected arguments");
});

test("integration: minify (without taskUtil)", async (t) => {
	const {reader, writer, workspace} = createWorkspace();
	const content = `
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	await reader.write(testResource);

	await minify({
		workspace,
		options: {
			pattern: "/test.js"
		}
	});

	const expected = `function test(t){var o=t;console.log(o)}test();`;
	const res = await writer.byPath("/test.js");
	if (!res) {
		t.fail("Could not find /test.js in target locator");
	}
	t.deepEqual(await res.getString(), expected, "Correct file content");

	const resDbg = await writer.byPath("/test-dbg.js");
	if (!resDbg) {
		t.fail("Could not find /test-dbg.js in target locator");
	}
	t.deepEqual(await resDbg.getString(), content, "Correct debug-file content");

	const expectedSourceMap =
		`{"version":3,"file":"test.js",` +
		`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.js"],` +
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");
});

test("integration: minify omitSourceMapResources=false (without taskUtil)", async (t) => {
	const {reader, writer, workspace} = createWorkspace();
	const content = `
function test(paramA) {
	var variableA = paramA;
	console.log(variableA);
}
test();`;
	const testResource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});
	await reader.write(testResource);

	await minify({
		workspace,
		options: {
			pattern: "/test.js",
			omitSourceMapResources: false
		}
	});

	const expected = `function test(t){var o=t;console.log(o)}test();
${SOURCE_MAPPING_URL}=test.js.map`;
	const res = await writer.byPath("/test.js");
	if (!res) {
		t.fail("Could not find /test.js in target locator");
	}
	t.deepEqual(await res.getString(), expected, "Correct file content");

	const resDbg = await writer.byPath("/test-dbg.js");
	if (!resDbg) {
		t.fail("Could not find /test-dbg.js in target locator");
	}
	t.deepEqual(await resDbg.getString(), content, "Correct debug-file content");

	const expectedSourceMap =
		`{"version":3,"file":"test.js",` +
		`"names":["test","paramA","variableA","console","log"],"sources":["test-dbg.js"],` +
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF"}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");
});
