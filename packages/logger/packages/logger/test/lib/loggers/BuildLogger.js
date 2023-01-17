import test from "ava";
import sinon from "sinon";
import BuildLogger from "../../../lib/loggers/BuildLogger.js";

test.serial.beforeEach((t) => {
	t.context.buildLogger = new BuildLogger("my:module:name");
	t.context.logStub = sinon.stub(t.context.buildLogger, "_log");

	t.context.logHandler = sinon.stub();
	t.context.metadataHandler = sinon.stub();
	t.context.statusHandler = sinon.stub();
	process.on(BuildLogger.LOG_EVENT_NAME, t.context.logHandler);
	process.on(BuildLogger.BUILD_METADATA_EVENT_NAME, t.context.metadataHandler);
	process.on(BuildLogger.BUILD_STATUS_EVENT_NAME, t.context.statusHandler);
	process.env.UI5_LOG_LVL = "silent"; // Should have no impact
});

test.serial.afterEach.always((t) => {
	process.off(BuildLogger.LOG_EVENT_NAME, t.context.logHandler);
	process.off(BuildLogger.BUILD_METADATA_EVENT_NAME, t.context.metadataHandler);
	process.off(BuildLogger.BUILD_STATUS_EVENT_NAME, t.context.statusHandler);
	delete process.env.UI5_LOG_LVL;
	sinon.restore();
});

test.serial("Correct build metadata event name", (t) => {
	t.is(BuildLogger.BUILD_METADATA_EVENT_NAME, "ui5.build-metadata", "Correct build metadata event name exposed");
});

test.serial("Correct build status event name", (t) => {
	t.is(BuildLogger.BUILD_STATUS_EVENT_NAME, "ui5.build-status", "Correct build status event name exposed");
});

test.serial("Log messages", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;

	BuildLogger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		buildLogger[level]("Message 1");
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

test.serial("Set projects", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	buildLogger.setProjects(["project.a", "project.b"]);

	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.deepEqual(metadataHandler.getCall(0).args[0], {
		projectsToBuild: ["project.a", "project.b"]
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(statusHandler.callCount, 0, "No build-status event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("Start project build", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	buildLogger.setProjects(["project.a"]);

	buildLogger.startProjectBuild("project.a", "project type");

	t.is(statusHandler.callCount, 1, "One build-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		projectName: "project.a",
		projectType: "project type",
		status: "project-build-start",
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("End project build", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	buildLogger.setProjects(["project.a"]);

	buildLogger.endProjectBuild("project.a", "project type");

	t.is(statusHandler.callCount, 1, "One build-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "verbose",
		projectName: "project.a",
		projectType: "project type",
		status: "project-build-end",
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("Skip project build", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	buildLogger.setProjects(["project.a"]);

	buildLogger.skipProjectBuild("project.a", "project type");

	t.is(statusHandler.callCount, 1, "One build-status event emitted");
	t.deepEqual(statusHandler.getCall(0).args[0], {
		level: "info",
		projectName: "project.a",
		projectType: "project type",
		status: "project-build-skip",
	}, "Metadata event has expected payload");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("No event listener: Set projects", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	process.off(BuildLogger.BUILD_METADATA_EVENT_NAME, metadataHandler);
	buildLogger.setProjects(["project.a", "project.b"]);

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(statusHandler.callCount, 0, "No build-status event emitted");
	t.is(logStub.callCount, 0, "_log was never called");
});

test.serial("No event listener: Start project build", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	process.off(BuildLogger.BUILD_STATUS_EVENT_NAME, statusHandler);
	buildLogger.setProjects(["project.a"]);

	buildLogger.startProjectBuild("project.a", "project type");
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"Building project type project project.a...",
		"Logged expected message");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
});

test.serial("No event listener: End project build", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	process.off(BuildLogger.BUILD_STATUS_EVENT_NAME, statusHandler);
	buildLogger.setProjects(["project.a"]);

	buildLogger.endProjectBuild("project.a", "project type");
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "verbose", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"Finished building project type project project.a",
		"Logged expected message");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
});

test.serial("No event listener: Skip project build", (t) => {
	const {buildLogger, logHandler, metadataHandler, statusHandler, logStub} = t.context;
	process.off(BuildLogger.BUILD_STATUS_EVENT_NAME, statusHandler);
	buildLogger.setProjects(["project.a"]);

	buildLogger.skipProjectBuild("project.a", "project type");
	t.is(logStub.callCount, 1, "_log got called once");
	t.is(logStub.getCall(0).args[0], "info", "Logged with expected log-level");
	t.is(logStub.getCall(0).args[1],
		"Skipping build of project type project project.a",
		"Logged expected message");

	t.is(logHandler.callCount, 0, "No log event emitted");
	t.is(metadataHandler.callCount, 1, "One build-metadata event emitted");
});

test.serial("Set projects: Missing parameter", (t) => {
	const {buildLogger} = t.context;

	t.throws(() => {
		buildLogger.setProjects();
	}, {
		message: `BuildLogger#setProjects: Missing or incorrect projects parameter`
	}, "Threw with expected error message");

	t.throws(() => {
		buildLogger.setProjects(new Set("no array"));
	}, {
		message: `BuildLogger#setProjects: Missing or incorrect projects parameter`
	}, "Threw with expected error message");
});

test.serial("Start project build: Unknown project", (t) => {
	const {buildLogger} = t.context;

	// Throws because no projects are set
	t.throws(() => {
		buildLogger.startProjectBuild("project.x", "application");
	}, {
		message: `BuildLogger#startProjectBuild: Unknown project project.x`
	}, "Threw with expected error message");

	buildLogger.setProjects(["project.a"]);
	// Throws because given project is unknown
	t.throws(() => {
		buildLogger.startProjectBuild("project.x", "application");
	}, {
		message: `BuildLogger#startProjectBuild: Unknown project project.x`
	}, "Threw with expected error message");
});

test.serial("End project build: Unknown project", (t) => {
	const {buildLogger} = t.context;

	// Throws because no projects are set
	t.throws(() => {
		buildLogger.endProjectBuild("project.x", "application");
	}, {
		message: `BuildLogger#endProjectBuild: Unknown project project.x`
	}, "Threw with expected error message");

	buildLogger.setProjects(["project.a"]);
	// Throws because given project is unknown
	t.throws(() => {
		buildLogger.endProjectBuild("project.x", "application");
	}, {
		message: `BuildLogger#endProjectBuild: Unknown project project.x`
	}, "Threw with expected error message");
});

test.serial("Skip project build: Unknown project", (t) => {
	const {buildLogger} = t.context;

	// Throws because no projects are set
	t.throws(() => {
		buildLogger.skipProjectBuild("project.x", "application");
	}, {
		message: `BuildLogger#skipProjectBuild: Unknown project project.x`
	}, "Threw with expected error message");

	buildLogger.setProjects(["project.a"]);
	// Throws because given project is unknown
	t.throws(() => {
		buildLogger.skipProjectBuild("project.x", "application");
	}, {
		message: `BuildLogger#skipProjectBuild: Unknown project project.x`
	}, "Threw with expected error message");
});

test.serial("Start project build: Missing projectType parameter", (t) => {
	const {buildLogger} = t.context;

	buildLogger.setProjects(["project.a"]);
	t.throws(() => {
		buildLogger.startProjectBuild("project.a");
	}, {
		message: `BuildLogger#startProjectBuild: Missing projectType parameter`
	}, "Threw with expected error message");
});

test.serial("End project build: Missing projectType parameter", (t) => {
	const {buildLogger} = t.context;

	buildLogger.setProjects(["project.a"]);
	t.throws(() => {
		buildLogger.endProjectBuild("project.a");
	}, {
		message: `BuildLogger#endProjectBuild: Missing projectType parameter`
	}, "Threw with expected error message");
});

test.serial("Skip project build: Missing projectType parameter", (t) => {
	const {buildLogger} = t.context;

	buildLogger.setProjects(["project.a"]);
	t.throws(() => {
		buildLogger.skipProjectBuild("project.a");
	}, {
		message: `BuildLogger#skipProjectBuild: Missing projectType parameter`
	}, "Threw with expected error message");
});
