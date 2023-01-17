import test from "ava";
import sinon from "sinon";
import stripAnsi from "strip-ansi";
import figures from "figures";
import ConsoleHandler from "../../../lib/handlers/ConsoleHandler.js";

test.serial.beforeEach((t) => {
	t.context.consoleHandler = ConsoleHandler.init();
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");
	t.context.originalIsTty = process.stderr.isTTY;
	process.env.UI5_LOG_LVL = "info";
});

test.serial.afterEach.always((t) => {
	t.context.consoleHandler.disable();
	sinon.restore();
	process.stderr.isTTY = t.context.originalIsTty;
	delete process.env.UI5_LOG_LVL;
});

test.serial("Log event", (t) => {
	const {stderrWriteStub} = t.context;

	process.emit("ui5.log", {
		level: "info",
		message: "Message 1",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info my:module: Message 1\n`,
		"Logged expected message");
});

test.serial("Disable", (t) => {
	const {consoleHandler, stderrWriteStub} = t.context;
	consoleHandler.disable();

	process.emit("ui5.log", {
		level: "info",
		message: "Message 1",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged no message");
});

test.serial("Enable", (t) => {
	const {consoleHandler, stderrWriteStub} = t.context;
	consoleHandler.disable();

	process.emit("ui5.log", {
		level: "info",
		message: "Message 1",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged no message");

	consoleHandler.enable();
	process.emit("ui5.log", {
		level: "info",
		message: "Message 2",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 1, "Logged no message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]),
		`info my:module: Message 2\n`,
		"Logged expected message");
});

test.serial("Logging restricted by log level setting", (t) => {
	const {stderrWriteStub} = t.context;

	process.emit("ui5.log", {
		level: "verbose",
		message: "Message 1",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged no message");
});

test.serial("Logging with unknown log level", (t) => {
	const {stderrWriteStub} = t.context;

	t.throws(() => {
		process.emit("ui5.log", {
			level: "foo",
			message: "Message 1",
			moduleName: "my:module"
		});
	}, {
		message: `Unknown log level "foo"`
	});

	t.is(stderrWriteStub.callCount, 0, "Logged no message");
});

test.serial("Build status events", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "verbose", // Should not get logged
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-start",
	});

	process.emit("ui5.build-status", {
		level: "info",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-end",
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]),
		`info Project 1 of 1: ${figures.tick} Finished building project-type project project.a\n`,
		"Logged expected message");
});

test.serial("Build status: Unknown project", (t) => {
	const {stderrWriteStub} = t.context;

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-start",
		});
	}, {
		message: "ConsoleHandler: Unknown project project.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (start): Duplicate project build start", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-start",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-start",
		});
	}, {
		message: "ConsoleHandler: Unexpected duplicate project-build-start event for project project.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (start): Project build already ended", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-start",
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-end",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-start",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected project-build-start event for project project.a. Project build already ended"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (start): Project build already skipped", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-skip",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-start",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected project-build-start event for project project.a. " +
			"Project build already skipped"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (end): Duplicate project build end", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-start",
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-end",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-end",
		});
	}, {
		message: "ConsoleHandler: Unexpected duplicate project-build-end event for project project.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (end): Project build not started", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-end",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected project-build-end event for project project.a. " +
			"No corresponding project-build-start event handled"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (end): Project build already skipped", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-skip",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-end",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected project-build-end event for project project.a. " +
			"Project build already skipped"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (skip): Duplicate project build skip", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-skip",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-skip",
		});
	}, {
		message: "ConsoleHandler: Unexpected duplicate project-build-skip event for project project.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (skip): Project build already started", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-start",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-skip",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected project-build-skip event for project project.a. " +
			"Project build already started"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status (skip): Project build already ended", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-start",
	});

	process.emit("ui5.build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-end",
	});

	t.throws(() => {
		process.emit("ui5.build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			status: "project-build-skip",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected project-build-skip event for project project.a. " +
			"Project build already ended"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("Build status: Unknown status", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.env.UI5_LOG_LVL = "verbose";
	process.emit("ui5.build-status", {
		level: "info",
		projectName: "project.a",
		projectType: "project-type",
		status: "foo",
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.firstCall.firstArg),
		`verb ConsoleHandler: Received unknown build-status foo for project project.a\n`,
		"Logged expected message");
});

test.serial("ProjectBuild status events", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.project-build-metadata", {
		projectName: "project.a",
		projectType: "project-type",
		tasksToRun: ["task.a"]
	});

	process.emit("ui5.project-build-status", {
		level: "verbose", // Should not get logged
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-start",
	});

	process.emit("ui5.project-build-status", {
		level: "info",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-end",
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]),
		`info project.a ${figures.tick} Finished task task.a\n`,
		"Logged expected message");
});

test.serial("ProjectBuild status: Unknown project", (t) => {
	const {stderrWriteStub} = t.context;

	t.throws(() => {
		process.emit("ui5.project-build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			taskName: "task.a",
			status: "task-end",
		});
	}, {
		message: "ConsoleHandler: Unknown project project.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("ProjectBuild status: Unknown task", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	t.throws(() => {
		process.emit("ui5.project-build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			taskName: "task.a",
			status: "task-end",
		});
	}, {
		message: "ConsoleHandler: Unknown task task.a for project project.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("ProjectBuild status (start): Duplicate task execution start", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.project-build-metadata", {
		projectName: "project.a",
		projectType: "project-type",
		tasksToRun: ["task.a"]
	});

	process.emit("ui5.project-build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-start",
	});

	t.throws(() => {
		process.emit("ui5.project-build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			taskName: "task.a",
			status: "task-start",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected duplicate task-start event for project project.a, task task.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("ProjectBuild status (start): Task execution already ended", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.project-build-metadata", {
		projectName: "project.a",
		projectType: "project-type",
		tasksToRun: ["task.a"]
	});

	process.emit("ui5.project-build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-start",
	});

	process.emit("ui5.project-build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-end",
	});

	t.throws(() => {
		process.emit("ui5.project-build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			taskName: "task.a",
			status: "task-start",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected task-start event for project project.a, task task.a. " +
			"Task execution already ended"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("ProjectBuild status (end): Duplicate task execution end", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.project-build-metadata", {
		projectName: "project.a",
		projectType: "project-type",
		tasksToRun: ["task.a"]
	});

	process.emit("ui5.project-build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-start",
	});

	process.emit("ui5.project-build-status", {
		level: "silly",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "task-end",
	});

	t.throws(() => {
		process.emit("ui5.project-build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			taskName: "task.a",
			status: "task-end",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected duplicate task-end event for project project.a, task task.a"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("ProjectBuild status (end): Task execution not started", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.project-build-metadata", {
		projectName: "project.a",
		projectType: "project-type",
		tasksToRun: ["task.a"]
	});

	t.throws(() => {
		process.emit("ui5.project-build-status", {
			level: "info",
			projectName: "project.a",
			projectType: "project-type",
			taskName: "task.a",
			status: "task-end",
		});
	}, {
		message:
			"ConsoleHandler: Unexpected task-end event for project project.a, task task.a. " +
			"No corresponding task-start event handled"
	});

	t.is(stderrWriteStub.callCount, 0, "Logged zero messages");
});

test.serial("ProjectBuild status: Unknown status", (t) => {
	const {stderrWriteStub} = t.context;
	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	process.emit("ui5.project-build-metadata", {
		projectName: "project.a",
		projectType: "project-type",
		tasksToRun: ["task.a"]
	});

	process.env.UI5_LOG_LVL = "verbose";
	process.emit("ui5.project-build-status", {
		level: "info",
		projectName: "project.a",
		projectType: "project-type",
		taskName: "task.a",
		status: "foo",
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.firstCall.firstArg),
		`verb ConsoleHandler: Received unknown project-build-status foo for project project.a\n`,
		"Logged expected message");
});

test.serial("No progress bar in test environment", (t) => {
	const {consoleHandler} = t.context;

	// Since there is no interactive terminal, progress bar should not be used/returned
	t.falsy(consoleHandler._getProgressBar(), "No progress bar returned");
});

test.serial("No progress bar for log level verbose", (t) => {
	const {consoleHandler} = t.context;

	process.stderr.isTTY = true;
	process.env.UI5_LOG_LVL = "verbose";

	// Since there is no interactive terminal, progress bar should not be used/returned
	t.falsy(consoleHandler._getProgressBar(), "No progress bar returned");
});

test.serial("Progress bar completion does not drop any logs", async (t) => {
	const {consoleHandler, stderrWriteStub} = t.context;

	// Force TTY in test env to enable progress bar
	process.stderr.isTTY = true;

	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	const pb = consoleHandler._getProgressBar();

	t.true(pb.isActive, "Progress bar is active");

	process.emit("ui5.log", {
		level: "info",
		message: "Message 1",
		moduleName: "my:module"
	});

	// Complete all progress
	process.emit("ui5.build-status", {
		level: "info",
		projectName: "project.a",
		projectType: "project-type",
		status: "project-build-skip",
	});

	process.emit("ui5.log", {
		level: "info",
		message: "Message 2",
		moduleName: "my:module"
	});

	t.false(pb.isActive, "Progress bar is not active anymore");

	// Wait for async progress bar completion (also fires stop event)
	await new Promise((resolve) => {
		setTimeout(resolve, 10);
	});

	process.emit("ui5.log", {
		level: "info",
		message: "Message 3",
		moduleName: "my:module"
	});

	const allWriteCalls = stderrWriteStub.getCalls();
	t.true(allWriteCalls.length > 2, "Multiple write calls indicate progress bar was active");

	const firstMessage = allWriteCalls.find((call) => {
		return call.firstArg.includes("Message 1");
	});
	t.truthy(firstMessage, "Logged first message");
	t.is(stripAnsi(firstMessage.firstArg),
		`info my:module: Message 1\n`,
		"Logged expected first message");

	const secondMessage = allWriteCalls.find((call) => {
		return call.firstArg.includes("Message 2");
	});
	t.truthy(secondMessage, "Logged second message");
	t.is(stripAnsi(secondMessage.firstArg),
		`info my:module: Message 2\n`,
		"Logged expected second message");

	const thirdMessage = allWriteCalls.find((call) => {
		return call.firstArg.includes("Message 3");
	});
	t.truthy(thirdMessage, "Logged third message");
	t.is(stripAnsi(thirdMessage.firstArg),
		`info my:module: Message 3\n`,
		"Logged expected third message");
});

test.serial("Disable: Stops progress bar", (t) => {
	const {consoleHandler, stderrWriteStub} = t.context;

	// Force TTY in test env to enable progress bar
	process.stderr.isTTY = true;

	process.emit("ui5.build-metadata", {
		projectsToBuild: ["project.a"]
	});

	const pb = consoleHandler._getProgressBar();

	t.true(pb.isActive, "Progress bar is active");

	consoleHandler.disable();
	stderrWriteStub.resetHistory();

	t.false(pb.isActive, "Progress bar is not active anymore");

	// Re-enable and log a message
	consoleHandler.enable();
	process.emit("ui5.log", {
		level: "info",
		message: "Message 1",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
});

