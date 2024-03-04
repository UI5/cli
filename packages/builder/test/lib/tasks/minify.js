import test from "ava";
import sinonGlobal from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.workspace = {
		byGlob: sinon.stub().resolves(["resource A", "resource B"]),
		write: sinon.stub().resolves()
	};
	t.context.taskUtil = {
		setTag: sinon.stub(),
		STANDARD_TAGS: {
			HasDebugVariant: "has debug variant",
			IsDebugVariant: "is debug variant",
			OmitFromBuildResult: "omit from build result"
		},
		registerCleanupTask: sinon.stub()
	};

	t.context.fsInterfaceStub = sinon.stub().returns("fs interface");
	t.context.minifierStub = sinon.stub();
	t.context.minify = await esmock("../../../lib/tasks/minify.js", {
		"@ui5/fs/fsInterface": t.context.fsInterfaceStub,
		"../../../lib/processors/minifier.js": t.context.minifierStub
	});
});
test.afterEach.always(async (t) => {
	const {registerCleanupTask} = t.context.taskUtil;

	if (registerCleanupTask.callCount === 1) {
		// Ensure to call cleanup task so that workerpool is terminated - otherwise the test will time out!
		const cleanupTask = registerCleanupTask.getCall(0).args[0];
		await cleanupTask();
	}

	t.context.sinon.restore();
});

test("minify: Default params", async (t) => {
	const {minify, workspace, taskUtil, minifierStub} = t.context;
	minifierStub.resolves([{
		resource: "resource A",
		dbgResource: "dbgResource A",
		sourceMapResource: "sourceMapResource A",
		dbgSourceMapResource: "dbgSourceMapResource A" // optional
	}, {
		resource: "resource B",
		dbgResource: "dbgResource B",
		sourceMapResource: "sourceMapResource B",
	}]);
	await minify({
		workspace,
		taskUtil,
		options: {
			pattern: "**"
		}
	});

	t.is(minifierStub.callCount, 1, "minifier got called once");
	const minifierCallArgs = minifierStub.firstCall.firstArg;
	t.deepEqual(minifierCallArgs.resources, ["resource A", "resource B"], "Correct resources provided to processor");
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
	const {minify, workspace, taskUtil, minifierStub} = t.context;
	minifierStub.resolves([{
		resource: "resource A",
		dbgResource: "dbgResource A",
		sourceMapResource: "sourceMapResource A",
		dbgSourceMapResource: "dbgSourceMapResource A" // optional
	}, {
		resource: "resource B",
		dbgResource: "dbgResource B",
		sourceMapResource: "sourceMapResource B",
	}]);
	await minify({
		workspace,
		taskUtil,
		options: {
			pattern: "**",
			omitSourceMapResources: true,
			useInputSourceMaps: false
		}
	});

	t.is(minifierStub.callCount, 1, "minifier got called once");
	const minifierCallArgs = minifierStub.firstCall.firstArg;
	t.deepEqual(minifierCallArgs.resources, ["resource A", "resource B"], "Correct resources provided to processor");
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
	const {minify, workspace, minifierStub} = t.context;
	minifierStub.resolves([{
		resource: "resource A",
		dbgResource: "dbgResource A",
		sourceMapResource: "sourceMapResource A",
		dbgSourceMapResource: "dbgSourceMapResource A" // optional
	}, {
		resource: "resource B",
		dbgResource: "dbgResource B",
		sourceMapResource: "sourceMapResource B",
	}]);
	await minify({
		workspace,
		options: {
			pattern: "**"
		}
	});

	t.is(minifierStub.callCount, 1, "minifier got called once");
	const minifierCallArgs = minifierStub.firstCall.firstArg;
	t.deepEqual(minifierCallArgs.resources, ["resource A", "resource B"], "Correct resources provided to processor");
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
