import test from "ava";
import sinon from "sinon";
import ProjectBuildLogger from "../../../lib/loggers/ProjectBuildLogger.js";

test.serial.beforeEach((t) => {
	t.context.projectBuildLogger = new ProjectBuildLogger({
		moduleName: "my:module:name",
		projectName: "projectName",
		projectType: "projectType",
	});
	t.context.logStub = sinon.stub(t.context.projectBuildLogger, "_log");

	t.context.logHandler = sinon.stub();
	t.context.metadataHandler = sinon.stub();
	t.context.statusHandler = sinon.stub();
	process.on(ProjectBuildLogger.LOG_EVENT_NAME, t.context.logHandler);
	process.on(ProjectBuildLogger.PROJECT_BUILD_METADATA_EVENT_NAME, t.context.metadataHandler);
	process.on(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, t.context.statusHandler);
	process.env.UI5_LOG_LVL = "silent"; // Should have no impact
});

test.serial.afterEach.always((t) => {
	process.off(ProjectBuildLogger.LOG_EVENT_NAME, t.context.logHandler);
	process.off(ProjectBuildLogger.PROJECT_BUILD_METADATA_EVENT_NAME, t.context.metadataHandler);
	process.off(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, t.context.statusHandler);
	delete process.env.UI5_LOG_LVL;
	sinon.restore();
});

test.serial("Correct build metadata event name", (t) => {
	t.is(ProjectBuildLogger.PROJECT_BUILD_METADATA_EVENT_NAME, "ui5.project-build-metadata",
		"Correct build metadata event name exposed");
});

test.serial("Correct build status event name", (t) => {
	t.is(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, "ui5.project-build-status",
		"Correct build status event name exposed");
});

test.serial("Missing parameters", (t) => {
	t.throws(() => {
		new ProjectBuildLogger({});
	}, {
		message: "Logger: Missing moduleName parameter"
	}, "Threw with expected error message");

	t.throws(() => {
		new ProjectBuildLogger({
			moduleName: "module:name",
			projectName: "projectName",
		});
	}, {
		message: "ProjectBuildLogger: Missing projectType parameter"
	}, "Threw with expected error message");

	t.throws(() => {
		new ProjectBuildLogger({
			moduleName: "module:name",
			projectType: "projectType",
		});
	}, {
		message: "ProjectBuildLogger: Missing projectName parameter"
	}, "Threw with expected error message");
});

test.serial("Log messages", (t) => {
	const {projectBuildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;

	ProjectBuildLogger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		projectBuildLogger[level]("Message 1");
		t.is(logHandler.callCount, 1, "Emitted and captured one log event");
		t.deepEqual(logHandler.getCall(0).args[0], {
			level,
			message: "Message 1",
			moduleName: "my:module:name",
		}, "Emitted correct log event");
		logHandler.reset();
	});

	t.is(metadataHandler.callCount, 0, "No build-metadata event emitted");
	t.is(statusHandler.callCount, 0, "No build-status event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("Set tasks", (t) => {
	const {projectBuildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	projectBuildLogger.setTasks(["task.a", "task.b"]);

	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.deepEqual(metadataHandler.getCall(0).args[0], {
		projectName: "projectName",
		projectType: "projectType",
		tasksToRun: ["task.a", "task.b"]
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(statusHandler.callCount, 0, "No build-status event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("Start task", (t) => {
	const {projectBuildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	projectBuildLogger.setTasks(["task.a"]);

	projectBuildLogger.startTask("task.a");

	t.is(statusHandler.callCount, 1, "One build-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		projectName: "projectName",
		projectType: "projectType",
		status: "task-start",
		taskName: "task.a",
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("End task", (t) => {
	const {projectBuildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	projectBuildLogger.setTasks(["task.a"]);

	projectBuildLogger.endTask("task.a");

	t.is(statusHandler.callCount, 1, "One build-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "verbose",
		projectName: "projectName",
		projectType: "projectType",
		status: "task-end",
		taskName: "task.a",
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("No event listener: Start task", (t) => {
	const {projectBuildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	process.off(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, statusHandler);
	projectBuildLogger.setTasks(["task.a"]);

	projectBuildLogger.startTask("task.a");
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"projectName: Running task task.a...",
		"Logged expected message");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
});

test.serial("No event listener: End task", (t) => {
	const {projectBuildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	process.off(ProjectBuildLogger.PROJECT_BUILD_STATUS_EVENT_NAME, statusHandler);
	projectBuildLogger.setTasks(["task.a"]);

	projectBuildLogger.endTask("task.a");
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "verbose", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"projectName: Finished task task.a",
		"Logged expected message");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
});

test.serial("Set tasks: Missing parameter", (t) => {
	const {projectBuildLogger} = t.context;

	t.throws(() => {
		projectBuildLogger.setTasks();
	}, {
		message: `ProjectBuildLogger#setTasks: Missing or incorrect tasks parameter`
	}, "Threw with expected error message");

	t.throws(() => {
		projectBuildLogger.setTasks(new Set("no array"));
	}, {
		message: `ProjectBuildLogger#setTasks: Missing or incorrect tasks parameter`
	}, "Threw with expected error message");
});

test.serial("Start task: Unknown task", (t) => {
	const {projectBuildLogger} = t.context;

	// Throws because no projects are set
	t.throws(() => {
		projectBuildLogger.startTask("task.x");
	}, {
		message: `ProjectBuildLogger#startTask: Unknown task task.x`
	}, "Threw with expected error message");

	projectBuildLogger.setTasks(["task.a"]);
	// Throws because given project is unknown
	t.throws(() => {
		projectBuildLogger.startTask("task.x");
	}, {
		message: `ProjectBuildLogger#startTask: Unknown task task.x`
	}, "Threw with expected error message");
});

test.serial("End task: Unknown task", (t) => {
	const {projectBuildLogger} = t.context;

	// Throws because no projects are set
	t.throws(() => {
		projectBuildLogger.endTask("task.x");
	}, {
		message: `ProjectBuildLogger#endTask: Unknown task task.x`
	}, "Threw with expected error message");

	projectBuildLogger.setTasks(["task.a"]);
	// Throws because given project is unknown
	t.throws(() => {
		projectBuildLogger.endTask("task.x");
	}, {
		message: `ProjectBuildLogger#endTask: Unknown task task.x`
	}, "Threw with expected error message");
});

