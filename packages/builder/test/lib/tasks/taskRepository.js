const path = require("path");
const test = require("ava");

const taskRepository = require("../../../lib/tasks/taskRepository");

test("task retrieval", (t) => {
	const taksPath = path.posix.join(__dirname, "..", "..", "..", "lib", "tasks", "escapeNonAsciiCharacters");
	taskRepository.addTask({
		name: "myTask",
		specVersion: "2.0",
		taskPath: taksPath
	});
	const taskInfo = taskRepository.getTask("myTask");
	t.deepEqual(taskInfo, {
		task: require(taksPath),
		specVersion: "2.0"
	});
});

test("Unknown task retrieval", (t) => {
	const error = t.throws(() => {
		taskRepository.getTask("not-existing");
	}, Error);
	t.deepEqual(error.message, "taskRepository: Unknown Task not-existing", "Correct exception");
});

test("Duplicate task", (t) => {
	const myTask = {};
	taskRepository.addTask("myTask", myTask);
	const error = t.throws(() => {
		taskRepository.addTask("myTask", myTask);
	}, Error);
	t.deepEqual(error.message, "taskRepository: A task with the name undefined has already been registered",
		"Correct exception");
});
