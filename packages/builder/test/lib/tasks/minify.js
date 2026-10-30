import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";
import runTask from "../../../lib/tasks/runTask.js";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	// Input resources returned by the glob. The minify step reads getPath() on each to detect an existing
	// -dbg.js sibling; these plain paths have none, so every input is processed.
	const inputA = t.context.inputA = {getPath: () => "/resources/a.js"};
	const inputB = t.context.inputB = {getPath: () => "/resources/b.js"};
	t.context.workspace = {
		byGlob: sinon.stub().resolves([inputA, inputB]),
		write: sinon.stub().resolves()
	};
	t.context.taskUtil = {
		setTag: sinon.stub(),
		getTag: sinon.stub(),
		getEnv: sinon.stub().returns(undefined),
		STANDARD_TAGS: {
			HasDebugVariant: "has debug variant",
			IsDebugVariant: "is debug variant",
			OmitFromBuildResult: "omit from build result"
		},
		registerCleanupTask: sinon.stub()
	};

	t.context.fsInterfaceStub = sinon.stub().returns("fs interface");
	t.context.minifierStub = sinon.stub();
	t.context.log = {
		warn: sinon.stub()
	};
	t.context.minify = await esmock.p("../../../lib/tasks/minify.js", {
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"../../../lib/processors/minifier.js": t.context.minifierStub,
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:tasks:minify").returns(t.context.log)
		}
	});
});
test.afterEach.always(async (t) => {
	const {registerCleanupTask} = t.context.taskUtil;

	if (registerCleanupTask.callCount === 1) {
		// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
		const cleanupTask = registerCleanupTask.getCall(0).args[0];
		await cleanupTask();
	}

	esmock.purge(t.context.minify);
	t.context.sinon.restore();
});

test("minify: Default params", async (t) => {
	const {minify, workspace, taskUtil, minifierStub, inputA, inputB} = t.context;
	// One step per resource: the processor is called once per input resource.
	const processedByInput = new Map([
		[inputA, {
			resource: "resource A",
			dbgResource: "dbgResource A",
			sourceMapResource: "sourceMapResource A",
			dbgSourceMapResource: "dbgSourceMapResource A" // optional
		}],
		[inputB, {
			resource: "resource B",
			dbgResource: "dbgResource B",
			sourceMapResource: "sourceMapResource B",
		}]
	]);
	minifierStub.callsFake(({resources}) => Promise.resolve([processedByInput.get(resources[0])]));
	await runTask(minify, {
		workspace,
		taskUtil,
		options: {
			pattern: "**"
		}
	});

	t.is(minifierStub.callCount, 2, "minifier got called once per resource");
	const minifierCallArgs = minifierStub.firstCall.firstArg;
	t.deepEqual(minifierCallArgs.resources, [inputA], "First step processes the first resource");
	t.deepEqual(minifierStub.secondCall.firstArg.resources, [inputB], "Second step: second resource");
	t.is(minifierCallArgs.fs, "fs interface", "Correct fs interface provided to processor");
	t.is(minifierCallArgs.taskUtil, taskUtil, "Correct taskUtil provided to processor");
	t.deepEqual(minifierCallArgs.options, {
		addSourceMappingUrl: true,
		readSourceMappingUrl: true,
		useWorkers: true
	}, "minifier got called with expected options");

	t.is(taskUtil.setTag.callCount, 7, "taskUtil#setTag got called 12 times");
	t.is(taskUtil.setTag.getCall(0).args[0], "resource A", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(0).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(1).args[0], "dbgResource A", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(1).args[1], "is debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(2).args[0], "sourceMapResource A",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(2).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(3).args[0], "dbgSourceMapResource A",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(3).args[1], "is debug variant", "taskUtil#setTag got called with the correct tag");

	t.is(taskUtil.setTag.getCall(4).args[0], "resource B", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(4).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(5).args[0], "dbgResource B", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(5).args[1], "is debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(6).args[0], "sourceMapResource B",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(6).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");

	t.is(workspace.write.callCount, 7, "workspace#write got called seven times");
	[
		"resource A", "dbgResource A", "sourceMapResource A", "dbgSourceMapResource A",
		"resource B", "dbgResource B", "sourceMapResource B"
	].forEach((resName, idx) => {
		t.is(workspace.write.getCall(idx).firstArg, resName, "workspace#write got called for expected resource");
	});
});

test("minify: omitSourceMapResources: true, useInputSourceMaps: false", async (t) => {
	const {minify, workspace, taskUtil, minifierStub, inputA, inputB} = t.context;
	// One step per resource: the processor is called once per input resource.
	const processedByInput = new Map([
		[inputA, {
			resource: "resource A",
			dbgResource: "dbgResource A",
			sourceMapResource: "sourceMapResource A",
			dbgSourceMapResource: "dbgSourceMapResource A" // optional
		}],
		[inputB, {
			resource: "resource B",
			dbgResource: "dbgResource B",
			sourceMapResource: "sourceMapResource B",
		}]
	]);
	minifierStub.callsFake(({resources}) => Promise.resolve([processedByInput.get(resources[0])]));
	await runTask(minify, {
		workspace,
		taskUtil,
		options: {
			pattern: "**",
			omitSourceMapResources: true,
			useInputSourceMaps: false
		}
	});

	t.is(minifierStub.callCount, 2, "minifier got called once per resource");
	const minifierCallArgs = minifierStub.firstCall.firstArg;
	t.deepEqual(minifierCallArgs.resources, [inputA], "First step processes the first resource");
	t.deepEqual(minifierStub.secondCall.firstArg.resources, [inputB], "Second step: second resource");
	t.is(minifierCallArgs.fs, "fs interface", "Correct fs interface provided to processor");
	t.is(minifierCallArgs.taskUtil, taskUtil, "Correct taskUtil provided to processor");
	t.deepEqual(minifierCallArgs.options, {
		addSourceMappingUrl: false,
		readSourceMappingUrl: false,
		useWorkers: true
	}, "minifier got called with expected options");

	t.is(taskUtil.setTag.callCount, 10, "taskUtil#setTag got called 12 times");
	t.is(taskUtil.setTag.getCall(0).args[0], "resource A", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(0).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(1).args[0], "dbgResource A", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(1).args[1], "is debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(2).args[0], "sourceMapResource A",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(2).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(3).args[0], "sourceMapResource A",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(3).args[1], "omit from build result",
		"taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(4).args[0], "dbgSourceMapResource A",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(4).args[1], "is debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(5).args[0], "dbgSourceMapResource A",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(5).args[1], "omit from build result",
		"taskUtil#setTag got called with the correct tag");

	t.is(taskUtil.setTag.getCall(6).args[0], "resource B", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(6).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(7).args[0], "dbgResource B", "taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(7).args[1], "is debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(8).args[0], "sourceMapResource B",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(8).args[1], "has debug variant", "taskUtil#setTag got called with the correct tag");
	t.is(taskUtil.setTag.getCall(9).args[0], "sourceMapResource B",
		"taskUtil#setTag got called with the correct resource");
	t.is(taskUtil.setTag.getCall(9).args[1], "omit from build result",
		"taskUtil#setTag got called with the correct tag");

	t.is(workspace.write.callCount, 7, "workspace#write got called seven times");
	[
		"resource A", "dbgResource A", "sourceMapResource A", "dbgSourceMapResource A",
		"resource B", "dbgResource B", "sourceMapResource B"
	].forEach((resName, idx) => {
		t.is(workspace.write.getCall(idx).firstArg, resName, "workspace#write got called for expected resource");
	});
});

test("minify: No taskUtil", async (t) => {
	const {minify, workspace, minifierStub, inputA, inputB} = t.context;
	// One step per resource: the processor is called once per input resource.
	const processedByInput = new Map([
		[inputA, {
			resource: "resource A",
			dbgResource: "dbgResource A",
			sourceMapResource: "sourceMapResource A",
			dbgSourceMapResource: "dbgSourceMapResource A" // optional
		}],
		[inputB, {
			resource: "resource B",
			dbgResource: "dbgResource B",
			sourceMapResource: "sourceMapResource B",
		}]
	]);
	minifierStub.callsFake(({resources}) => Promise.resolve([processedByInput.get(resources[0])]));
	await runTask(minify, {
		workspace,
		options: {
			pattern: "**"
		}
	});

	t.is(minifierStub.callCount, 2, "minifier got called once per resource");
	const minifierCallArgs = minifierStub.firstCall.firstArg;
	t.deepEqual(minifierCallArgs.resources, [inputA], "First step processes the first resource");
	t.deepEqual(minifierStub.secondCall.firstArg.resources, [inputB], "Second step: second resource");
	t.is(minifierCallArgs.fs, "fs interface", "Correct fs interface provided to processor");
	t.is(minifierCallArgs.taskUtil, undefined, "No taskUtil provided to processor");
	t.deepEqual(minifierCallArgs.options, {
		addSourceMappingUrl: true,
		readSourceMappingUrl: true,
		useWorkers: false
	}, "minifier got called with expected options");

	t.is(workspace.write.callCount, 7, "workspace#write got called seven times");
	[
		"resource A", "dbgResource A", "sourceMapResource A", "dbgSourceMapResource A",
		"resource B", "dbgResource B", "sourceMapResource B"
	].forEach((resName, idx) => {
		t.is(workspace.write.getCall(idx).firstArg, resName, "workspace#write got called for expected resource");
	});
});

test("minify: Skips, tags and warns for an existing -dbg.js next to its .js", async (t) => {
	const {minify, workspace, taskUtil, minifierStub, log} = t.context;
	// A .js with an existing -dbg.js sibling (broken input state), plus a plain .js without a sibling.
	const normal = {getPath: () => "/resources/normal.js"};
	const withDbg = {getPath: () => "/resources/withDbg.js"};
	const existingDbg = {getPath: () => "/resources/withDbg-dbg.js"};
	workspace.byGlob.resolves([normal, withDbg, existingDbg]);

	const processedByInput = new Map([
		[normal, {
			resource: "resource normal",
			dbgResource: "dbgResource normal",
			sourceMapResource: "sourceMapResource normal",
		}]
	]);
	minifierStub.callsFake(({resources}) => Promise.resolve([processedByInput.get(resources[0])]));

	await runTask(minify, {
		workspace,
		taskUtil,
		options: {
			pattern: "**"
		}
	});

	// Only the plain .js is minified; the .js with a sibling and that -dbg.js are both skipped.
	t.is(minifierStub.callCount, 1, "minifier got called once - only for the plain .js");
	t.deepEqual(minifierStub.firstCall.firstArg.resources, [normal], "minifier processed the plain .js only");

	t.is(log.warn.callCount, 1, "One warning got logged for the existing -dbg.js");
	t.true(log.warn.firstCall.firstArg.includes("/resources/withDbg.js") &&
		log.warn.firstCall.firstArg.includes("/resources/withDbg-dbg.js"),
	"Warning names the .js and its existing debug variant");
	t.true(log.warn.firstCall.firstArg.includes("builder.minification.excludes"),
		"Warning hints at the minification excludes configuration");

	// TODO: is testing setTag() enough? (testing getTag() would be cleaner)
	t.true(taskUtil.setTag.calledWithExactly(withDbg, taskUtil.STANDARD_TAGS.HasDebugVariant),
		"Skipped .js is tagged as having a debug variant");
	t.true(taskUtil.setTag.calledWithExactly(existingDbg, taskUtil.STANDARD_TAGS.IsDebugVariant),
		"Existing -dbg.js is tagged as a debug variant");

	// Neither the skipped .js nor its -dbg.js got written back.
	t.is(workspace.write.callCount, 3, "workspace#write got called only for the plain .js and its derived resources");
	["resource normal", "dbgResource normal", "sourceMapResource normal"].forEach((resName, idx) => {
		t.is(workspace.write.getCall(idx).firstArg, resName, "workspace#write got called for expected resource");
	});
});
