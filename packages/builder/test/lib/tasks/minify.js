const test = require("ava");
const sinon = require("sinon");

const minify = require("../../../lib/tasks/minify");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test.afterEach.always((t) => {
	sinon.restore();
});

test("integration: minify", async (t) => {
	const taskUtil = {
		setTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣"
		}
	};
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const duplexCollection = new DuplexCollection({reader: reader, writer: writer});
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
		workspace: duplexCollection,
		taskUtil,
		options: {
			pattern: "/test.js"
		}
	});

	const expected = `function test(t){var o=t;console.log(o)}test();
//# sourceMappingURL=test.js.map`;
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
		`{"version":3,"sources":["test-dbg.js"],"names":["test","paramA","variableA","console","log"],` +
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,GAEbF","file":"test.js"}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");

	t.is(taskUtil.setTag.callCount, 2, "taskUtil.setTag was called twice");
	t.deepEqual(taskUtil.setTag.getCall(0).args, [res, "1️⃣"], "First taskUtil.setTag call with expected arguments");
	t.deepEqual(taskUtil.setTag.getCall(1).args, [resDbg, "2️⃣"],
		"Second taskUtil.setTag call with expected arguments");
});

