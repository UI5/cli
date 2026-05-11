import test from "ava";
import path from "node:path";
import sinon from "sinon";
import Specification from "../../../../lib/specifications/Specification.js";
import Task from "../../../../lib/specifications/extensions/Task.js";
import Extension from "../../../../lib/specifications/Extension.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = import.meta.dirname;

const genericCjsExtensionPath = path.join(__dirname, "..", "..", "..", "fixtures", "extension.a");
const genericEsmExtensionPath = path.join(__dirname, "..", "..", "..", "fixtures", "extension.a.esm");

const basicCjsTaskInput = {
	id: "task.a",
	version: "1.0.0",
	modulePath: genericCjsExtensionPath,
	configuration: {
		specVersion: "2.6",
		kind: "extension",
		type: "task",
		metadata: {
			name: "task-a"
		},
		task: {
			path: "lib/extensionModule.js"
		}
	}
};

const basicEsmTaskInput = {
	id: "task.a",
	version: "1.0.0",
	modulePath: genericEsmExtensionPath,
	configuration: {
		specVersion: "2.6",
		kind: "extension",
		type: "task",
		metadata: {
			name: "task-a"
		},
		task: {
			path: "lib/extensionModule.js"
		}
	}
};

test.afterEach.always((t) => {
	sinon.restore();
});

test("Correct class (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	t.true(extension instanceof Task, `Is an instance of the Task class`);
});

test("Correct class (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	t.true(extension instanceof Task, `Is an instance of the Task class`);
});

test("getTask (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	const task = await extension.getTask();
	t.is(task(), "extension module",
		"Returned correct module");
});

test("getTask (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	const task = await extension.getTask();
	t.is(task(), "extension module",
		"Returned correct module");
});

test("getRequiredDependenciesCallback (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	const requiredDependenciesCallback = await extension.getRequiredDependenciesCallback();
	t.is(requiredDependenciesCallback(), "required dependencies function",
		"Returned correct module");
});

test("getRequiredDependenciesCallback (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	const requiredDependenciesCallback = await extension.getRequiredDependenciesCallback();
	t.is(requiredDependenciesCallback(), "required dependencies function",
		"Returned correct module");
});

test("Task with illegal suffix", async (t) => {
	const TaskInput = clone(basicCjsTaskInput);
	TaskInput.configuration.metadata.name += "--1";
	const err = await t.throwsAsync(Specification.create(TaskInput));
	t.is(err.message,
		"Failed to validate configuration of task extension task-a--1: " +
		"Task name must not end with '--<number>'",
		"Threw with expected error message");
});

test("getBuildSignatureCallback (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	const callback = await extension.getBuildSignatureCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("getBuildSignatureCallback (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	const callback = await extension.getBuildSignatureCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("getSupportsDifferentialBuildsCallback (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	const callback = await extension.getSupportsDifferentialBuildsCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("getSupportsDifferentialBuildsCallback (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	const callback = await extension.getSupportsDifferentialBuildsCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("getExpectedOutputCallback (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	const callback = await extension.getExpectedOutputCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("getExpectedOutputCallback (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	const callback = await extension.getExpectedOutputCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("Extension abstract class cannot be directly instantiated", (t) => {
	t.throws(() => new Extension({configuration: {}}), {
		instanceOf: TypeError,
		message: /Class 'Extension' is abstract/
	});
});
