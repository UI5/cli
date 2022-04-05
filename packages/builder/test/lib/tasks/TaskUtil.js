const test = require("ava");
const sinon = require("sinon");
const TaskUtil = require("../../../lib/tasks/TaskUtil");

test.afterEach.always((t) => {
	sinon.restore();
});

test("Instantiation", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag", "some other tag", "Thursday"]
		}
	});

	t.deepEqual(taskUtil.STANDARD_TAGS, ["some tag", "some other tag", "Thursday"], "Correct standard tags exposed");
});

test("setTag", async (t) => {
	const setTagStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"],
			getResourceTagCollection: () => {
				return {
					setTag: setTagStub
				};
			}
		}
	});

	taskUtil.setTag("my resource", "my tag", "my value");

	t.is(setTagStub.callCount, 1, "ResourceTagCollection#setTag got called once");
	t.deepEqual(setTagStub.getCall(0).args[0], "my resource", "Correct resource parameter supplied");
	t.deepEqual(setTagStub.getCall(0).args[1], "my tag", "Correct tag parameter supplied");
	t.deepEqual(setTagStub.getCall(0).args[2], "my value", "Correct value parameter supplied");
});

test("getTag", async (t) => {
	const getTagStub = sinon.stub().returns(42);
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"],
			getResourceTagCollection: () => {
				return {
					getTag: getTagStub
				};
			}
		}
	});

	const res = taskUtil.getTag("my resource", "my tag", "my value");

	t.is(getTagStub.callCount, 1, "ResourceTagCollection#getTag got called once");
	t.deepEqual(getTagStub.getCall(0).args[0], "my resource", "Correct resource parameter supplied");
	t.deepEqual(getTagStub.getCall(0).args[1], "my tag", "Correct tag parameter supplied");
	t.is(res, 42, "Correct result");
});

test("clearTag", async (t) => {
	const clearTagStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"],
			getResourceTagCollection: () => {
				return {
					clearTag: clearTagStub
				};
			}
		}
	});

	taskUtil.clearTag("my resource", "my tag", "my value");

	t.is(clearTagStub.callCount, 1, "ResourceTagCollection#clearTag got called once");
	t.deepEqual(clearTagStub.getCall(0).args[0], "my resource", "Correct resource parameter supplied");
	t.deepEqual(clearTagStub.getCall(0).args[1], "my tag", "Correct tag parameter supplied");
});

test("isRootProject", async (t) => {
	const isRootProjectStub = sinon.stub().returns(true);
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"],
			isRootProject: isRootProjectStub
		}
	});

	const res = taskUtil.isRootProject();

	t.is(isRootProjectStub.callCount, 1, "ProjectBuildContext#isRootProject got called once");
	t.is(res, true, "Correct result");
});

test("getBuildOption", (t) => {
	const getOptionStub = sinon.stub().returns("Pony");
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"],
			getOption: getOptionStub
		}
	});

	const res = taskUtil.getBuildOption("friend");

	t.is(getOptionStub.callCount, 1, "ProjectBuildContext#getBuildOption got called once");
	t.is(res, "Pony", "Correct result");
});

test("registerCleanupTask", async (t) => {
	const registerCleanupTaskStub = sinon.stub();
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"],
			registerCleanupTask: registerCleanupTaskStub
		}
	});

	taskUtil.registerCleanupTask("my callback");

	t.is(registerCleanupTaskStub.callCount, 1, "ProjectBuildContext#registerCleanupTask got called once");
	t.deepEqual(registerCleanupTaskStub.getCall(0).args[0], "my callback", "Correct callback parameter supplied");
});

test("getInterface: specVersion 1.0", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface("1.0");

	t.is(interfacedTaskUtil, undefined, "no interface provided");
});

test("getInterface: specVersion 2.2", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface("2.2");

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, ["some tag"], "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.3", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface("2.3");

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, ["some tag"], "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.4", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface("2.4");

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, ["some tag"], "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.5", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface("2.5");

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, ["some tag"], "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion 2.6", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const interfacedTaskUtil = taskUtil.getInterface("2.6");

	t.deepEqual(Object.keys(interfacedTaskUtil), [
		"STANDARD_TAGS",
		"setTag",
		"clearTag",
		"getTag",
		"isRootProject",
		"registerCleanupTask"
	], "Correct methods are provided");

	t.deepEqual(interfacedTaskUtil.STANDARD_TAGS, ["some tag"], "attribute STANDARD_TAGS is provided");
	t.is(typeof interfacedTaskUtil.setTag, "function", "function setTag is provided");
	t.is(typeof interfacedTaskUtil.clearTag, "function", "function clearTag is provided");
	t.is(typeof interfacedTaskUtil.getTag, "function", "function getTag is provided");
	t.is(typeof interfacedTaskUtil.isRootProject, "function", "function isRootProject is provided");
	t.is(typeof interfacedTaskUtil.registerCleanupTask, "function", "function registerCleanupTask is provided");
});

test("getInterface: specVersion undefined", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});

	const err = t.throws(() => {
		taskUtil.getInterface();
	});

	t.is(err.message, "TaskUtil: Unknown or unsupported Specification Version undefined",
		"Throw with correct error message");
});

test("getInterface: specVersion unknown", async (t) => {
	const taskUtil = new TaskUtil({
		projectBuildContext: {
			STANDARD_TAGS: ["some tag"]
		}
	});
	const err = t.throws(() => {
		taskUtil.getInterface("1.5");
	});

	t.is(err.message, "TaskUtil: Unknown or unsupported Specification Version 1.5",
		"Throw with correct error message");
});
