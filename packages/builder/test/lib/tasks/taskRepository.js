const path = require("path");
const test = require("ava");

const taskRepository = require("../../../lib/tasks/taskRepository");

test.serial("task retrieval", (t) => {
	const taskPath = path.join(__dirname, "..", "..", "..", "lib", "tasks", "escapeNonAsciiCharacters");
	taskRepository.addTask({
		name: "myTask",
		specVersion: "2.0",
		taskPath: taskPath
	});
	const taskInfo = taskRepository.getTask("myTask");
	t.deepEqual(taskInfo, {
		task: require(taskPath),
		specVersion: "2.0"
	});
});

test("Unknown task retrieval", (t) => {
	const error = t.throws(() => {
		taskRepository.getTask("not-existing");
	}, Error);
	t.deepEqual(error.message, "taskRepository: Unknown Task not-existing", "Correct exception");
});

test.serial("Duplicate task", (t) => {
	const myTask = {};
	taskRepository.addTask("myTask", myTask);
	const error = t.throws(() => {
		taskRepository.addTask("myTask", myTask);
	}, Error);
	t.deepEqual(error.message, "taskRepository: A task with the name undefined has already been registered",
		"Correct exception");
});
