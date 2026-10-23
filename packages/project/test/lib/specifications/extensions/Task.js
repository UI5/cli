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

test("getDetermineBuildSignatureCallback (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsTaskInput));
	const callback = await extension.getDetermineBuildSignatureCallback();
	t.is(callback, undefined, "Returns undefined when not exported");
});

test("getDetermineBuildSignatureCallback (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmTaskInput));
	const callback = await extension.getDetermineBuildSignatureCallback();
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

test.serial("getDescriptor memoizes descriptors per project and runtime task name", async (t) => {
	const taskInput = clone(basicEsmTaskInput);
	taskInput.configuration.specVersion = "5.0";
	const extension = await Specification.create(taskInput);
	const factory = sinon.stub().callsFake((options) => ({
		task: async () => options.projectName,
		determineBuildSignature: async () => options.projectName
	}));
	sinon.stub(extension, "_getImplementation").resolves({default: factory});

	const projectAOptions = {
		projectName: "project.a",
		projectNamespace: "project/a",
		configuration: {value: "a"}
	};
	const projectBOptions = {
		projectName: "project.b",
		projectNamespace: "project/b",
		configuration: {value: "b"}
	};

	const projectASignature =
		await extension.getDetermineBuildSignatureCallback("task-a", projectAOptions);
	const projectBSignature =
		await extension.getDetermineBuildSignatureCallback("task-a", projectBOptions);
	const projectADescriptor = await extension.getDescriptor("task-a", projectAOptions);
	const projectASecondCall = await extension.getDescriptor("task-a", {...projectAOptions});
	const projectBDescriptor = await extension.getDescriptor("task-a", projectBOptions);
	const projectASecondTask = await extension.getDescriptor("task-a--2", projectAOptions);

	t.is(projectASecondCall, projectADescriptor, "Reused the descriptor within one project");
	t.not(projectBDescriptor, projectADescriptor, "Created a separate descriptor for another project");
	t.not(projectASecondTask, projectADescriptor, "Created a separate descriptor for another runtime task");
	t.is(await projectASignature(), "project.a", "The first signature callback captured project A's options");
	t.is(await projectBSignature(), "project.b", "The second signature callback captured project B's options");
	t.is(await projectADescriptor.task(), "project.a", "The first descriptor captured project A's options");
	t.is(await projectBDescriptor.task(), "project.b", "The second descriptor captured project B's options");
	t.is(factory.callCount, 3, "Called the factory once per project and runtime task");
});

test("Extension abstract class cannot be directly instantiated", (t) => {
	t.throws(() => new Extension({configuration: {}}), {
		instanceOf: TypeError,
		message: /Class 'Extension' is abstract/
	});
});
