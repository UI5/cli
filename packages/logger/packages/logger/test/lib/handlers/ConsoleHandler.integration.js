import test from "ava";
import sinon from "sinon";
import stripAnsi from "strip-ansi";
import figures from "figures";
import ConsoleHandler from "../../../lib/handlers/ConsoleHandler.js";
import Logger from "../../../lib/loggers/Logger.js";
import BuildLogger from "../../../lib/loggers/BuildLogger.js";
import ProjectBuildLogger from "../../../lib/loggers/ProjectBuildLogger.js";

test.serial.beforeEach((t) => {
	t.context.consoleHandler = ConsoleHandler.init();
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");
	t.context.originalIsTty = process.stderr.isTTY;
	process.env.UI5_LOG_LVL = "silly";
});

test.serial.afterEach.always((t) => {
	t.context.consoleHandler.disable();
	sinon.restore();
	process.stderr.isTTY = t.context.originalIsTty;
	delete process.env.UI5_LOG_LVL;
});

async function findMessageInProgressBarLog(t, indicator) {
	const {stderrWriteStub} = t.context;

	await new Promise((resolve) => {
		// Wait for progress bar to flush log buffer
		setTimeout(resolve, 20);
	});

	const allWriteCalls = stderrWriteStub.getCalls();
	t.true(allWriteCalls.length > 2, "Multiple write calls indicate progress bar is active");

	const call = allWriteCalls.find((call) => {
		return call.firstArg.includes(indicator);
	});
	return call && call.firstArg;
}

test.serial("Log standard messages", (t) => {
	const {stderrWriteStub} = t.context;
	const myLogger = new Logger("my:module");

	Logger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		myLogger[level]("Message 1");
		if (level === "verbose") {
			// "verbose" is abbreviated
			level = "verb";
		}
		t.is(stderrWriteStub.callCount, 1, "Logged one message");
		t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `${level} my:module: Message 1\n`,
			"Logged expected message");
		stderrWriteStub.resetHistory();
	});
});

test.serial("Log restricted by log level setting", (t) => {
	const {stderrWriteStub} = t.context;
	const myLogger = new Logger("my:module");

	process.env.UI5_LOG_LVL = "info";

	myLogger.verbose("Message 1");
	t.is(stderrWriteStub.callCount, 0, "Logged no message");
});

test.serial("Log Build messages", (t) => {
	const {stderrWriteStub} = t.context;
	const myLogger = new BuildLogger("Builder");

	BuildLogger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		myLogger[level]("Message 1");
		if (level === "verbose") {
			// "verbose" is abbreviated
			level = "verb";
		}
		t.is(stderrWriteStub.callCount, 1, "Logged one message");
		t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `${level} Builder: Message 1\n`,
			"Logged expected message");
		stderrWriteStub.resetHistory();
	});
});

test.serial("Log Build status", (t) => {
	const {stderrWriteStub} = t.context;
	const myLogger = new BuildLogger("Builder");

	myLogger.setProjects(["project.a", "project.b"]);
	myLogger.skipProjectBuild("project.a", "project-type");
	myLogger.startProjectBuild("project.b", "project-type");
	myLogger.endProjectBuild("project.b", "project-type");

	t.is(stderrWriteStub.callCount, 3, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]),
		`info Project 1 of 2: ${figures.tick} Skipping build of project-type project project.a\n`,
		"Logged expected message");
	t.is(stripAnsi(stderrWriteStub.getCall(1).args[0]),
		`info Project 2 of 2: ${figures.pointer} Building project-type project project.b...\n`,
		"Logged expected message");
	t.is(stripAnsi(stderrWriteStub.getCall(2).args[0]),
		`verb Project 2 of 2: ${figures.tick} Finished building project-type project project.b\n`,
		"Logged expected message");
});
test.serial("Build status log restricted by log level", (t) => {
	const {stderrWriteStub} = t.context;
	const myLogger = new BuildLogger("Builder");

	process.env.UI5_LOG_LVL = "silent";

	myLogger.setProjects(["project.a", "project.b"]);
	myLogger.skipProjectBuild("project.a", "project-type");
	myLogger.startProjectBuild("project.b", "project-type");
	myLogger.endProjectBuild("project.b", "project-type");

	t.is(stderrWriteStub.callCount, 0, "Logged zero message");
});

test.serial("Log ProjectBuild messages", (t) => {
	const {stderrWriteStub} = t.context;
	const myLogger = new ProjectBuildLogger({
		moduleName: "project:build",
		projectName: "project.name",
		projectType: "project-type"
	});

	ProjectBuildLogger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		myLogger[level]("Message 1");
		if (level === "verbose") {
			// "verbose" is abbreviated
			level = "verb";
		}
		t.is(stderrWriteStub.callCount, 1, "Logged one message");
		t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `${level} project:build: Message 1\n`,
			"Logged expected message");
		stderrWriteStub.resetHistory();
	});
});

test.serial("Log ProjectBuild status", (t) => {
	const {stderrWriteStub} = t.context;

	// Make ConsoleHandler aware of the project first
	const buildLogger = new BuildLogger("Builder");
	buildLogger.setProjects(["project.a"]);

	const myLogger = new ProjectBuildLogger({
		moduleName: "build:module",
		projectName: "project.a",
		projectType: "project-type"
	});

	myLogger.setTasks(["task.a", "task.b"]);
	myLogger.startTask("task.a");
	myLogger.endTask("task.a");
	myLogger.startTask("task.b");
	myLogger.endTask("task.b");

	t.is(stderrWriteStub.callCount, 4, "Logged four messages");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]),
		`info project.a Task 1 of 2 › Running task task.a...\n`,
		"Logged expected message");
	t.is(stripAnsi(stderrWriteStub.getCall(1).args[0]),
		`verb project.a Task 1 of 2 ${figures.tick} Finished task task.a\n`,
		"Logged expected message");
	t.is(stripAnsi(stderrWriteStub.getCall(2).args[0]),
		`info project.a Task 2 of 2 › Running task task.b...\n`,
		"Logged expected message");
	t.is(stripAnsi(stderrWriteStub.getCall(3).args[0]),
		`verb project.a Task 2 of 2 ${figures.tick} Finished task task.b\n`,
		"Logged expected message");
});

test.serial("ProjectBuild status restricted by log level", (t) => {
	const {stderrWriteStub} = t.context;

	// Make ConsoleHandler aware of the project first
	const buildLogger = new BuildLogger("Builder");
	buildLogger.setProjects(["project.a"]);

	const myLogger = new ProjectBuildLogger({
		moduleName: "build:module",
		projectName: "project.a",
		projectType: "project-type"
	});

	process.env.UI5_LOG_LVL = "silent";

	myLogger.setTasks(["task.a", "task.b"]);
	myLogger.startTask("task.a");
	myLogger.endTask("task.a");
	myLogger.startTask("task.b");
	myLogger.endTask("task.b");

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Log through progress bar", async (t) => {
	const buildLogger = new BuildLogger("Builder");

	process.env.UI5_LOG_LVL = "info";

	// Force TTY in test env to enable progress bar
	process.stderr.isTTY = true;

	buildLogger.setProjects(["project.a", "project.b"]);
	const myLogger = new Logger("my:module");
	myLogger.info("Message 1");

	const msg = await findMessageInProgressBarLog(t, "Message 1");
	t.truthy(msg, "Logged expected message");
	t.is(stripAnsi(msg),
		`info my:module: Message 1\n`,
		"Logged expected message");
});

test.serial("Do not use progress bar for log level verbose", async (t) => {
	const {stderrWriteStub} = t.context;
	const buildLogger = new BuildLogger("Builder");

	process.env.UI5_LOG_LVL = "verbose";

	// Forced TTY would enable progress bar, however verbose log level disables it again
	process.stderr.isTTY = true;

	buildLogger.setProjects(["project.a", "project.b"]);
	const myLogger = new Logger("my:module");
	myLogger.info("Message 1");

	await new Promise((resolve) => {
		setTimeout(resolve, 20);
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one messages");
	t.is(stripAnsi(stderrWriteStub.firstCall.firstArg),
		`info my:module: Message 1\n`,
		"Logged expected message");
});

test.serial("Return to direct logging once progress bar stopped", async (t) => {
	const {consoleHandler, stderrWriteStub} = t.context;
	const buildLogger = new BuildLogger("Builder");

	process.env.UI5_LOG_LVL = "info";

	// Force TTY in test env to enable progress bar
	process.stderr.isTTY = true;

	buildLogger.setProjects(["project.a", "project.b"]);
	const pb = consoleHandler._getProgressBar();

	t.true(pb.isActive, "Progress bar is active");

	// Complete all projects (note that here are no tasks to complete)
	buildLogger.skipProjectBuild("project.a", "project-type");
	buildLogger.startProjectBuild("project.b", "project-type");
	buildLogger.endProjectBuild("project.b", "project-type");

	t.false(pb.isActive, "Progress bar is not active anymore");

	// Wait for async progress bar completion (also fires stop event)
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});

	// Clear stub history
	stderrWriteStub.resetHistory();

	// Log a normal message
	const myLogger = new Logger("my:module");
	myLogger.info("Message 1");

	t.is(stderrWriteStub.callCount, 1, "Logged one messages");
	t.is(stripAnsi(stderrWriteStub.firstCall.firstArg),
		`info my:module: Message 1\n`,
		"Logged expected message");
});

test.serial("Progress bar progress", (t) => {
	const {consoleHandler} = t.context;
	const buildLogger = new BuildLogger("Builder");
	const projectBuildLoggerA = new ProjectBuildLogger({
		moduleName: "ProjectBuilder",
		projectName: "project.a",
		projectType: "project-type",
	});
	const projectBuildLoggerB = new ProjectBuildLogger({
		moduleName: "ProjectBuilder",
		projectName: "project.b",
		projectType: "project-type",
	});

	process.env.UI5_LOG_LVL = "info";

	// Force TTY in test env to enable progress bar
	process.stderr.isTTY = true;

	const pb = consoleHandler._getProgressBar();
	buildLogger.setProjects(["project.a", "project.b"]);
	t.is(pb.getTotal(), 4, "Correct progress total after setting projects");
	t.is(pb.getProgress(), 0, "No progress after setting projects to build");

	// Set tasks
	projectBuildLoggerA.setTasks(["task.a", "task.b", "task.c"]);
	t.is(pb.getTotal(), 7, "Correct progress total after setting tasks");
	projectBuildLoggerB.setTasks(["task.a", "task.b", "task.c"]);
	t.is(pb.getTotal(), 10, "Correct progress total after setting tasks");
	t.is(pb.getProgress(), 0, "No progress after setting all projects and tasks");

	// Complete all projects
	buildLogger.skipProjectBuild("project.a", "project-type");
	t.is(pb.getProgress(), 0.5, "Correct progress after skipping project.a and all it's tasks");

	buildLogger.startProjectBuild("project.b", "project-type");
	t.is(pb.getProgress(), 0.5, "Unchanged progress after starting project.b");

	projectBuildLoggerB.startTask("task.a");
	projectBuildLoggerB.endTask("task.a");
	t.is(pb.getProgress(), 0.6, "Correct progress after ending task.a");

	projectBuildLoggerB.startTask("task.b");
	projectBuildLoggerB.endTask("task.b");
	t.is(pb.getProgress(), 0.7, "Correct progress after ending task.b");

	projectBuildLoggerB.startTask("task.c");
	projectBuildLoggerB.endTask("task.c");
	t.is(pb.getProgress(), 0.8, "Correct progress after ending task.c");

	buildLogger.endProjectBuild("project.b", "project-type");
	t.is(pb.getProgress(), 1, "Correct progress after starting project.b");
});
