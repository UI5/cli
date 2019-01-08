const {test} = require("ava");
const path = require("path");
const chai = require("chai");
chai.use(require("chai-fs"));
const sinon = require("sinon");

test.afterEach.always((t) => {
	sinon.restore();
});

const taskRepository = require("../../../lib/tasks/taskRepository");
const parentLogger = require("@ui5/logger").getGroupLogger("mygroup");

const AbstractBuilder = require("../../../lib/types/AbstractBuilder");


function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

const applicationBPath = path.join(__dirname, "..", "..", "..", "fixtures", "application.b");
const applicationBTree = {
	id: "application.b",
	version: "1.0.0",
	path: applicationBPath,
	dependencies: [],
	builder: {},
	_level: 0,
	specVersion: "0.1",
	type: "application",
	metadata: {
		name: "application.b"
	},
	resources: {
		configuration: {
			paths: {
				webapp: "webapp"
			}
		}
	}
};

test("Instantiation of AbstractBuilder", (t) => {
	const project = clone(applicationBTree);
	const error = t.throws(() => {
		new AbstractBuilder({project});
	}, TypeError, "abstract builder cannot be instantiated since it is abstract");
	t.deepEqual(error.message, "Class 'AbstractBuilder' is abstract",
		"Correct exception thrown");
});

class CustomBuilderWithoutStandardTasks extends AbstractBuilder {
	constructor({project}) {
		super({parentLogger, project});
	}
}

test("Instantiation of class with addStandardTasks not overwritten", (t) => {
	const project = clone(applicationBTree);
	const error = t.throws(() => {
		new CustomBuilderWithoutStandardTasks({project});
	}, Error, "Has to implement 'addStandardTasks'");
	t.deepEqual(error.message, "Function 'addStandardTasks' is not implemented",
		"Correct exception thrown");
});

class CustomBuilder extends AbstractBuilder {
	constructor({project, resourceCollections}) {
		super({parentLogger, project, resourceCollections});
	}

	addStandardTasks({resourceCollections, project}) {
		this.addTask("myStandardTask", function() {});
		this.addTask("createDebugFiles", function() {});
		this.addTask("replaceVersion", function() {});
	}
}

test("Instantiation with standard tasks only", (t) => {
	const project = clone(applicationBTree);

	const customBuilder = new CustomBuilder({project});
	t.deepEqual(customBuilder.taskExecutionOrder,
		["myStandardTask", "createDebugFiles", "replaceVersion"],
		"Order of tasks is correct");
	t.deepEqual(customBuilder.project.id, "application.b", "Project correctly set");
});

test("Instantiation with custom task without a name", (t) => {
	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: ""
		}]
	};
	const error = t.throws(() => {
		new CustomBuilder({project});
	}, Error);
	t.deepEqual(error.message, "Missing name for custom task definition of project application.b at index 0",
		"Correct exception thrown");
});

test("Instantiation with custom task with neither beforeTask nor afterTask", (t) => {
	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask"
		}]
	};
	const error = t.throws(() => {
		new CustomBuilder({project});
	}, Error);
	t.deepEqual(error.message, `Custom task definition myTask of project application.b defines ` +
		`neither a "beforeTask" nor an "afterTask" parameter. One must be defined.`, "Correct exception thrown");
});

test("Instantiation with custom task with both: beforeTask and afterTask", (t) => {
	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "myTaskB",
			afterTask: "myTaskA",
		}]
	};
	const error = t.throws(() => {
		new CustomBuilder({project});
	}, Error);
	t.deepEqual(error.message, `Custom task definition myTask of project application.b defines ` +
		`both "beforeTask" and "afterTask" parameters. Only one must be defined.`, "Correct exception thrown");
});

test("Instantiation with custom task that is unknown", (t) => {
	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "myOtherTask"
		}]
	};
	const error = t.throws(() => {
		new CustomBuilder({project});
	}, Error);
	t.deepEqual(error.message, "taskRepository: Unknown Task myTask", "Correct exception thrown");
});

test("Instantiation with custom task and unknown beforeTask", (t) => {
	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "uglify",
			beforeTask: "someTask"
		}]
	};
	const error = t.throws(() => {
		new CustomBuilder({project});
	}, Error);
	t.deepEqual(error.message, "Could not find task someTask, referenced by custom task uglify, " +
		"to be scheduled for project application.b", "Correct exception thrown");
});

test("Instantiation with custom task", (t) => {
	const customTask = function() {};
	sinon.stub(taskRepository, "getTask").returns(customTask);

	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "replaceVersion"
		}]
	};
	const customBuilder = new CustomBuilder({project});
	t.truthy(customBuilder.tasks["myTask"], "Custom task has been added to task array");
	t.deepEqual(customBuilder.taskExecutionOrder,
		["myStandardTask", "createDebugFiles", "myTask", "replaceVersion"],
		"Order of tasks is correct");
});

test("Instantiation with custom task defined three times", (t) => {
	const customTask = function() {};
	sinon.stub(taskRepository, "getTask").returns(customTask);

	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "myStandardTask"
		}, {
			name: "myTask",
			afterTask: "replaceVersion"
		}, {
			name: "myTask",
			beforeTask: "myStandardTask"
		}]
	};
	const customBuilder = new CustomBuilder({project});
	t.truthy(customBuilder.tasks["myTask"], "Custom task myTask has been added to task array");
	t.truthy(customBuilder.tasks["myTask--1"], "Custom task myTask--1 has been added to task array");
	t.truthy(customBuilder.tasks["myTask--2"], "Custom task myTask--2 has been added to task array");
	t.deepEqual(customBuilder.taskExecutionOrder,
		["myTask", "myTask--2", "myStandardTask", "createDebugFiles", "replaceVersion", "myTask--1"],
		"Order of tasks is correct");
});

test("Instantiation with custom task: Custom task called correctly", (t) => {
	const customTask = function({workspace, dependencies, options}) {
		t.deepEqual(options.projectName, "application.b", "Correct project name passed to custom task");
		t.deepEqual(options.configuration, "pony", "Correct configuration passed to custom task");
		t.deepEqual(workspace, "myWorkspace", "Correct workspace passed to custom task");
		t.deepEqual(dependencies, "myDependencies", "Correct dependency collection passed to custom task");
	};
	sinon.stub(taskRepository, "getTask").returns(customTask);

	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "replaceVersion",
			configuration: "pony"
		}]
	};
	const resourceCollections = {
		workspace: "myWorkspace",
		dependencies: "myDependencies"
	};
	const customBuilder = new CustomBuilder({project, resourceCollections});
	customBuilder.tasks["myTask"]();
});

test("Instantiation with custom task: Two custom tasks called correctly", (t) => {
	const customTask1 = function({workspace, dependencies, options}) {
		t.deepEqual(options.configuration, "pony", "Correct configuration passed to first custom task");
	};
	const customTask2 = function({workspace, dependencies, options}) {
		t.deepEqual(options.configuration, "donkey", "Correct configuration passed to second custom task");
	};
	const stubGetTask = sinon.stub(taskRepository, "getTask");
	stubGetTask.onCall(0).returns(customTask1);
	stubGetTask.onCall(1).returns(customTask2);

	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask",
			beforeTask: "replaceVersion",
			configuration: "pony"
		}, {
			name: "myTask",
			beforeTask: "myStandardTask",
			configuration: "donkey"
		}]
	};
	const resourceCollections = {
		workspace: "myWorkspace",
		dependencies: "myDependencies"
	};
	const customBuilder = new CustomBuilder({project, resourceCollections});
	customBuilder.tasks["myTask"]();
	customBuilder.tasks["myTask--1"]();
});

test("addTask: Add task", (t) => {
	const project = clone(applicationBTree);
	const customBuilder = new CustomBuilder({project});
	const myFunction = function() {};
	customBuilder.addTask("myTask", myFunction);
	t.is(customBuilder.tasks["myTask"], myFunction, "Task has been added to task array");
	t.deepEqual(customBuilder.taskExecutionOrder[customBuilder.taskExecutionOrder.length - 1], "myTask",
		"Task has been added to end of execution order array");
});

test("addTask: Add duplicate task", (t) => {
	const project = clone(applicationBTree);
	const customBuilder = new CustomBuilder({project});
	const myFunction = function() {};
	customBuilder.addTask("myTask", myFunction);
	const error = t.throws(() => {
		customBuilder.addTask("myTask", myFunction);
	}, Error);
	t.deepEqual(error.message, "Failed to add duplicate task myTask for project application.b",
		"Correct exception thrown");
});

test("addTask: Add task already added to execution order", (t) => {
	const project = clone(applicationBTree);
	const customBuilder = new CustomBuilder({project});
	const myFunction = function() {};
	customBuilder.taskExecutionOrder.push("myTask");
	const error = t.throws(() => {
		customBuilder.addTask("myTask", myFunction);
	}, Error);
	t.deepEqual(error.message, "Builder: Failed to add task myTask for project application.b. " +
		"It has already been scheduled for execution.", "Correct exception thrown");
});
