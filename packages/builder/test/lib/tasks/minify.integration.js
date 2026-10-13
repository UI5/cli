import test from "ava";
import sinonGlobal from "sinon";
import minify from "../../../lib/tasks/minify.js";
import runSteps from "../../../lib/tasks/runSteps.js";
import * as resourceFactory from "@ui5/fs/resourceFactory";
import DuplexCollection from "@ui5/fs/DuplexCollection";

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

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});


test.serial("integration: minify omitSourceMapResources=true", async (t) => {
	const taskUtil = {
		getEnv: (name) => process.env[name],
		setTag: t.context.sinon.stub(),
		getTag: t.context.sinon.stub().returns(false),
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣",
			OmitFromBuildResult: "3️⃣"
		},
		registerCleanupTask: t.context.sinon.stub()
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

	await runSteps(minify, {
		workspace,
		taskUtil,
		options: {
			pattern: "/test.js",
			omitSourceMapResources: true
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
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF","ignoreList":[]}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");

	t.is(taskUtil.setTag.callCount, 4, "taskUtil.setTag was called 4 times");
	t.is(taskUtil.setTag.getCall(0).args[0].getPath(), res.getPath(),
		"First taskUtil.setTag call with expected first argument");
	t.is(taskUtil.setTag.getCall(0).args[1], "1️⃣", "First taskUtil.setTag call with expected second argument");
	t.is(taskUtil.setTag.getCall(1).args[0].getPath(), resDbg.getPath(),
		"Second taskUtil.setTag call with expected first arguments");
	t.is(taskUtil.setTag.getCall(1).args[1], "2️⃣",
		"Second taskUtil.setTag call with expected second arguments");
	t.is(taskUtil.setTag.getCall(2).args[0].getPath(), resSourceMap.getPath(),
		"Third taskUtil.setTag call with expected first arguments");
	t.is(taskUtil.setTag.getCall(2).args[1], "1️⃣",
		"Third taskUtil.setTag call with expected second arguments");
	t.is(taskUtil.setTag.getCall(3).args[0].getPath(), resSourceMap.getPath(),
		"Fourth taskUtil.setTag call with expected first arguments");
	t.is(taskUtil.setTag.getCall(3).args[1], "3️⃣",
		"Fourth taskUtil.setTag call with expected second arguments");

	// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
	const cleanupTask = taskUtil.registerCleanupTask.getCall(0).args[0];
	await cleanupTask();
});

test.serial("integration: minify omitSourceMapResources=false", async (t) => {
	const taskUtil = {
		getEnv: (name) => process.env[name],
		setTag: t.context.sinon.stub(),
		getTag: t.context.sinon.stub().returns(false),
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣",
			OmitFromBuildResult: "3️⃣"
		},
		registerCleanupTask: t.context.sinon.stub()
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

	await runSteps(minify, {
		workspace,
		taskUtil,
		options: {
			pattern: "/test.js"
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
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF","ignoreList":[]}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");

	t.is(taskUtil.setTag.callCount, 3, "taskUtil.setTag was called 3 times");
	t.is(taskUtil.setTag.getCall(0).args[0].getPath(), res.getPath(),
		"First taskUtil.setTag call with expected first argument");
	t.is(taskUtil.setTag.getCall(0).args[1], "1️⃣", "First taskUtil.setTag call with expected second argument");
	t.is(taskUtil.setTag.getCall(1).args[0].getPath(), resDbg.getPath(),
		"Second taskUtil.setTag call with expected first arguments");
	t.is(taskUtil.setTag.getCall(1).args[1], "2️⃣",
		"Second taskUtil.setTag call with expected second arguments");
	t.is(taskUtil.setTag.getCall(2).args[0].getPath(), resSourceMap.getPath(),
		"Third taskUtil.setTag call with expected first arguments");
	t.is(taskUtil.setTag.getCall(2).args[1], "1️⃣",
		"Third taskUtil.setTag call with expected second arguments");

	// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
	const cleanupTask = taskUtil.registerCleanupTask.getCall(0).args[0];
	await cleanupTask();
});

test("integration: minify omitSourceMapResources=true (without taskUtil)", async (t) => {
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

	await runSteps(minify, {
		workspace,
		options: {
			pattern: "/test.js",
			omitSourceMapResources: true
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
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF","ignoreList":[]}`;

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

	await runSteps(minify, {
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
		`"mappings":"AACA,SAASA,KAAKC,GACb,IAAIC,EAAYD,EAChBE,QAAQC,IAAIF,EACb,CACAF","ignoreList":[]}`;

	const resSourceMap = await writer.byPath("/test.js.map");
	if (!resSourceMap) {
		t.fail("Could not find /test-dbg.js.map in target locator");
	}
	t.deepEqual(await resSourceMap.getString(), expectedSourceMap, "Correct source map content");
});

test.serial("integration: minify error", async (t) => {
	const taskUtil = {
		getEnv: (name) => process.env[name],
		setTag: t.context.sinon.stub(),
		getTag: t.context.sinon.stub().returns(false),
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣",
			OmitFromBuildResult: "3️⃣"
		},
		registerCleanupTask: t.context.sinon.stub()
	};
	const {reader, workspace} = createWorkspace();
	const content = `
// Top level return will cause a parsing error
return;`;
	const testResource = resourceFactory.createResource({
		path: "/resources/my/namespace/test.js",
		string: content
	});
	await reader.write(testResource);

	await t.throwsAsync(() => {
		return runSteps(minify, {
			workspace,
			taskUtil,
			options: {
				pattern: "/resources/my/namespace/test.js",
				omitSourceMapResources: true
			}
		});
	}, {
		message:
			`Minification failed with error: 'return' outside of function in file ` +
			`/resources/my/namespace/test.js (line 3, col 0, pos 48)`
	}, `Threw with expected error message`);

	// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
	const cleanupTask = taskUtil.registerCleanupTask.getCall(0).args[0];
	await cleanupTask();
});


test.serial("integration: minify error (without taskUtil)", async (t) => {
	const {reader, workspace} = createWorkspace();
	const content = `
// Top level return will cause a parsing error
return;`;
	const testResource = resourceFactory.createResource({
		path: "/resources/my/namespace/test.js",
		string: content
	});
	await reader.write(testResource);

	await t.throwsAsync(() => {
		return runSteps(minify, {
			workspace,
			options: {
				pattern: "/resources/my/namespace/test.js",
				omitSourceMapResources: true
			}
		});
	}, {
		message:
			`Minification failed with error: 'return' outside of function in file ` +
			`/resources/my/namespace/test.js (line 3, col 0, pos 48)`
	}, `Threw with expected error message`);
});

test.serial("integration: minify with taskUtil and resources tagged with OmitFromBuildResult", async (t) => {
	const {reader, workspace} = createWorkspace();

	const testFilePath1 = "/resources/my/namespace/test1.js";
	const testFilePath2 = "/resources/my/namespace/test2.js";
	const testFileContent1 = "function test(param1) { var variableA = param1; console.log(variableA); } test();";
	const testFileContent2 = "function test(param2) { var variableB = param2; console.log(variableB); } test();";

	const testResource1 = resourceFactory.createResource({
		path: testFilePath1,
		string: testFileContent1
	});
	const testResource2 = resourceFactory.createResource({
		path: testFilePath2,
		string: testFileContent2
	});

	await reader.write(testResource1);
	await reader.write(testResource2);

	const taskUtil = {
		getEnv: (name) => process.env[name],
		STANDARD_TAGS: {
			HasDebugVariant: "1️⃣",
			IsDebugVariant: "2️⃣",
			OmitFromBuildResult: "3️⃣"
		},
		setTag: t.context.sinon.stub(),
		getTag: t.context.sinon.stub().callsFake((resource, tag) => {
			if (resource.getPath() === testFilePath1 &&
				tag === taskUtil.STANDARD_TAGS.OmitFromBuildResult) {
				return true; // OmitFromBuildResult for testFilePath1
			}
			return false; // No OmitFromBuildResult for testFilePath2
		}),
		registerCleanupTask: t.context.sinon.stub()
	};

	await runSteps(minify, {
		workspace,
		taskUtil,
		options: {
			pattern: "/**/*.js",
		}
	});

	t.is(taskUtil.setTag.callCount, 8, "taskUtil.setTag was called 8 times");

	const taggedResources = [];
	for (const call of taskUtil.setTag.getCalls()) {
		const resourcePath = call.args[0].getPath();
		const tag = call.args[1];
		taggedResources.push({resourcePath, tag});
	}

	taggedResources.sort((a, b) => a.resourcePath.localeCompare(b.resourcePath));

	t.deepEqual(taggedResources, [{
		resourcePath: "/resources/my/namespace/test1-dbg.js",
		tag: taskUtil.STANDARD_TAGS.OmitFromBuildResult,
	}, {
		resourcePath: "/resources/my/namespace/test1-dbg.js",
		tag: taskUtil.STANDARD_TAGS.IsDebugVariant,
	}, {
		resourcePath: "/resources/my/namespace/test1.js",
		tag: taskUtil.STANDARD_TAGS.HasDebugVariant,
	}, {
		resourcePath: "/resources/my/namespace/test1.js.map",
		tag: taskUtil.STANDARD_TAGS.OmitFromBuildResult,
	}, {
		resourcePath: "/resources/my/namespace/test1.js.map",
		tag: taskUtil.STANDARD_TAGS.HasDebugVariant,
	}, {
		resourcePath: "/resources/my/namespace/test2-dbg.js",
		tag: taskUtil.STANDARD_TAGS.IsDebugVariant,
	}, {
		resourcePath: "/resources/my/namespace/test2.js",
		tag: taskUtil.STANDARD_TAGS.HasDebugVariant,
	}, {
		resourcePath: "/resources/my/namespace/test2.js.map",
		tag: taskUtil.STANDARD_TAGS.HasDebugVariant,
	}], "Correct tags set on resources");

	// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
	const cleanupTask = taskUtil.registerCleanupTask.getCall(0).args[0];
	await cleanupTask();
});

// A -dbg.js next to its .js in the sources is a broken input state: the minify task owns and generates
// the -dbg.js, so a pre-existing one must not be there. The glob then matches both the .js and the -dbg.js
// as separate map-step keys, and the .js key would write its generated debug variant to the -dbg.js path
// that the -dbg.js key also writes - two concurrent keys writing one path, which crashes the build. To
// stay robust, the .js and that -dbg.js are both skipped. Other .js files are minified as usual.
test.serial("integration: minify skips a .js with an existing -dbg.js sibling and that -dbg.js",
	async (t) => {
		const {reader, writer, workspace} = createWorkspace();
		const base = "/resources/my/namespace";
		const content = `function a(x){return x;}\n`;

		// A .js with an existing -dbg.js sibling - both must be skipped
		await reader.write(resourceFactory.createResource({
			path: `${base}/withDbg.js`,
			string: content
		}));
		await reader.write(resourceFactory.createResource({
			path: `${base}/withDbg-dbg.js`,
			string: content
		}));
		// A plain .js without a sibling - must be minified as usual
		await reader.write(resourceFactory.createResource({
			path: `${base}/plain.js`,
			string: content
		}));

		await runSteps(minify, {
			workspace,
			options: {
				pattern: "/resources/**/*.js"
			}
		});

		// The skipped .js and its -dbg.js are left untouched - the task writes neither them nor any derived
		// resource (no source map, no overwrite of the existing -dbg.js).
		t.is(await writer.byPath(`${base}/withDbg.js`), null, "Skipped .js is not written");
		t.is(await writer.byPath(`${base}/withDbg-dbg.js`), null, "Existing -dbg.js is not written");
		t.is(await writer.byPath(`${base}/withDbg.js.map`), null, "No source map for the skipped .js");

		// The plain .js is minified as usual, producing a minified result, a debug variant and a source map.
		const minified = await writer.byPath(`${base}/plain.js`);
		t.truthy(minified, "Plain .js is written");
		t.is(await minified.getString(), `function a(n){return n}\n${SOURCE_MAPPING_URL}=plain.js.map`,
			"Plain .js is minified");
		const dbg = await writer.byPath(`${base}/plain-dbg.js`);
		t.truthy(dbg, "Debug variant for the plain .js is written");
		t.is(await dbg.getString(), content, "Debug variant keeps the original content");
		t.truthy(await writer.byPath(`${base}/plain.js.map`), "Source map for the plain .js is written");
	});
