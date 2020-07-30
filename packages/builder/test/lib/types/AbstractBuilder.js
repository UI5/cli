const test = require("ava");
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
	_isRoot: true,
	specVersion: "0.1",
	type: "application",
	metadata: {
		name: "application.b",
		namespace: "application/b"
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
	t.throws(() => {
		new AbstractBuilder({project});
	}, {
		instanceOf: TypeError,
		message: "Class 'AbstractBuilder' is abstract"
	});
});

class CustomBuilderWithoutStandardTasks extends AbstractBuilder {
	constructor({project}) {
		super({parentLogger, project});
	}
}

test("Instantiation of class with addStandardTasks not overwritten", (t) => {
	const project = clone(applicationBTree);
	t.throws(() => {
		new CustomBuilderWithoutStandardTasks({project});
	}, {message: "Function 'addStandardTasks' is not implemented"});
});

class CustomBuilder extends AbstractBuilder {
	constructor({project, resourceCollections, taskUtil}) {
		super({parentLogger, project, resourceCollections, taskUtil});
	}

	addStandardTasks({resourceCollections, project}) {
		this.addTask("myStandardTask", function() {});
		this.addTask("createDebugFiles", function() {});
		this.addTask("replaceVersion", function() {});
	}
}

class EmptyBuilder extends AbstractBuilder {
	constructor({project, resourceCollections, taskUtil}) {
		super({parentLogger, project, resourceCollections, taskUtil});
	}

	addStandardTasks({resourceCollections, project}) {
		// None - like the ModuleBuilder
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
	});
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
	});
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
	});
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
	});
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
	});
	t.deepEqual(error.message, "Could not find task someTask, referenced by custom task uglify, " +
		"to be scheduled for project application.b", "Correct exception thrown");
});

test.serial("Instantiation with custom task", (t) => {
	sinon.stub(taskRepository, "getTask").returns({
		task: function() {},
		specVersion: undefined
	});

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

test.serial("Instantiation of empty builder with custom tasks", (t) => {
	sinon.stub(taskRepository, "getTask").returns({
		task: function() {},
		specVersion: undefined
	});

	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask"
		}, {
			name: "myTask2",
			beforeTask: "myTask"
		}]
	};
	const customBuilder = new EmptyBuilder({project});
	t.truthy(customBuilder.tasks["myTask"], "Custom task has been added to task array");
	t.truthy(customBuilder.tasks["myTask2"], "Custom task 2 has been added to task array");
	t.deepEqual(customBuilder.taskExecutionOrder,
		["myTask2", "myTask"],
		"Order of tasks is correct");
});

test.serial("Instantiation of empty builder with 2nd custom tasks defining neither beforeTask nor afterTask", (t) => {
	sinon.stub(taskRepository, "getTask").returns({
		task: function() {},
		specVersion: "2.0"
	});

	const project = clone(applicationBTree);
	project.builder = {
		customTasks: [{
			name: "myTask"
		}, {
			name: "myTask2" // should define before- or afterTask
		}]
	};
	const error = t.throws(() => {
		new EmptyBuilder({project});
	});
	t.deepEqual(error.message, `Custom task definition myTask2 of project application.b defines ` +
		`neither a "beforeTask" nor an "afterTask" parameter. One must be defined.`, "Correct exception thrown");
});

test.serial("Instantiation of empty builder with custom task: Custom task called correctly", (t) => {
	const customTaskStub = sinon.stub();
	sinon.stub(taskRepository, "getTask").returns({
		task: customTaskStub,
		specVersion: "2.0"
	});

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
	const getInterfaceStub = sinon.stub().returns(undefined);
	const taskUtil = {
		getInterface: getInterfaceStub
	};
	const customBuilder = new EmptyBuilder({project, resourceCollections, taskUtil});
	customBuilder.tasks["myTask"]();

	t.is(getInterfaceStub.callCount, 1, "taskUtil.getInterface got called once");
	t.deepEqual(getInterfaceStub.getCall(0).args[0], "2.0", "taskUtil.getInterface got called with correct argument");

	t.is(customTaskStub.callCount, 1, "Custom task got called once");
	t.deepEqual(customTaskStub.getCall(0).args[0], {
		options: {
			projectName: "application.b",
			projectNamespace: "application/b",
			configuration: "pony"
		},
		workspace: "myWorkspace",
		dependencies: "myDependencies"
	}, "Custom task got called with expected arguments");
});

test.serial("Instantiation with custom task defined three times", (t) => {
	sinon.stub(taskRepository, "getTask").returns({
		task: function() {},
		specVersion: "2.0"
	});

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

test.serial("Instantiation with custom task: Custom task called correctly", (t) => {
	const customTaskStub = sinon.stub();
	sinon.stub(taskRepository, "getTask").returns({
		task: customTaskStub,
		specVersion: "2.0"
	});

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
	const getInterfaceStub = sinon.stub().returns(undefined);
	const taskUtil = {
		getInterface: getInterfaceStub
	};
	const customBuilder = new CustomBuilder({project, resourceCollections, taskUtil});
	customBuilder.tasks["myTask"]();

	t.is(getInterfaceStub.callCount, 1, "taskUtil.getInterface got called once");
	t.deepEqual(getInterfaceStub.getCall(0).args[0], "2.0", "taskUtil.getInterface got called with correct argument");

	t.is(customTaskStub.callCount, 1, "Custom task got called once");
	t.deepEqual(customTaskStub.getCall(0).args[0], {
		options: {
			projectName: "application.b",
			projectNamespace: "application/b",
			configuration: "pony"
		},
		workspace: "myWorkspace",
		dependencies: "myDependencies"
	}, "Custom task got called with expected arguments");
});

test.serial("Instantiation with custom task specVersion 2.2: Custom task called correctly", (t) => {
	const customTaskStub = sinon.stub();
	sinon.stub(taskRepository, "getTask").returns({
		task: customTaskStub,
		specVersion: "2.2"
	});

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
	const getInterfaceStub = sinon.stub().returns("myTaskUtilInterface");
	const taskUtil = {
		getInterface: getInterfaceStub
	};
	const customBuilder = new CustomBuilder({project, resourceCollections, taskUtil});
	customBuilder.tasks["myTask"]();

	t.is(getInterfaceStub.callCount, 1, "taskUtil.getInterface got called once");
	t.deepEqual(getInterfaceStub.getCall(0).args[0], "2.2", "taskUtil.getInterface got called with correct argument");

	t.is(customTaskStub.callCount, 1, "Custom task got called once");
	t.deepEqual(customTaskStub.getCall(0).args[0], {
		options: {
			projectName: "application.b",
			projectNamespace: "application/b",
			configuration: "pony"
		},
		workspace: "myWorkspace",
		dependencies: "myDependencies",
		taskUtil: "myTaskUtilInterface"
	}, "Custom task got called with expected arguments");
});

test.serial("Instantiation with custom task: Two custom tasks called correctly", (t) => {
	const customTaskStub1 = sinon.stub();
	const customTaskStub2 = sinon.stub();
	const stubGetTask = sinon.stub(taskRepository, "getTask");
	stubGetTask.onCall(0).returns({
		task: customTaskStub1,
		specVersion: "2.0"
	});
	stubGetTask.onCall(1).returns({
		task: customTaskStub2,
		specVersion: "2.0"
	});

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
	const getInterfaceStub = sinon.stub().returns(undefined);
	const taskUtil = {
		getInterface: getInterfaceStub
	};
	const customBuilder = new CustomBuilder({project, resourceCollections, taskUtil});
	customBuilder.tasks["myTask"]();
	customBuilder.tasks["myTask--1"]();

	t.is(getInterfaceStub.callCount, 2, "taskUtil.getInterface got called once");
	t.deepEqual(getInterfaceStub.getCall(0).args[0], "2.0", "taskUtil.getInterface got called with correct argument");
	t.deepEqual(getInterfaceStub.getCall(1).args[0], "2.0", "taskUtil.getInterface got called with correct argument");

	t.is(customTaskStub1.callCount, 1, "Custom task got called once");
	t.deepEqual(customTaskStub1.getCall(0).args[0], {
		options: {
			projectName: "application.b",
			projectNamespace: "application/b",
			configuration: "pony"
		},
		workspace: "myWorkspace",
		dependencies: "myDependencies"
	}, "Custom task got called with expected arguments");

	t.is(customTaskStub2.callCount, 1, "Custom task got called once");
	t.deepEqual(customTaskStub2.getCall(0).args[0], {
		options: {
			projectName: "application.b",
			projectNamespace: "application/b",
			configuration: "donkey"
		},
		workspace: "myWorkspace",
		dependencies: "myDependencies"
	}, "Custom task got called with expected arguments");
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
	});
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
	});
	t.deepEqual(error.message, "Builder: Failed to add task myTask for project application.b. " +
		"It has already been scheduled for execution.", "Correct exception thrown");
});
