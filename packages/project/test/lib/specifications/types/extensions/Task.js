const test = require("ava");
const path = require("path");
const sinon = require("sinon");
const Specification = require("../../../../../lib/specifications/Specification");
const Task = require("../../../../../lib/specifications/types/extensions/Task");

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const genericExtensionPath = path.join(__dirname, "..", "..", "..", "..", "fixtures", "extension.a");
const basicTaskInput = {
	id: "task.a",
	version: "1.0.0",
	modulePath: genericExtensionPath,
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

test("Correct class", async (t) => {
	const extension = await Specification.create(clone(basicTaskInput));
	t.true(extension instanceof Task, `Is an instance of the Task class`);
});

test("getTask", async (t) => {
	const extension = await Specification.create(clone(basicTaskInput));
	t.is(extension.getTask(), "extension module",
		"Returned correct module");
});

test("Task with illegal suffix", async (t) => {
	const TaskInput = clone(basicTaskInput);
	TaskInput.configuration.metadata.name += "--1";
	const err = await t.throwsAsync(Specification.create(TaskInput));
	t.is(err.message,
		"Failed to validate configuration of task extension task-a--1: " +
		"Task name must not end with '--<number>'",
		"Threw with expected error message");
});
