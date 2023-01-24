import test from "ava";
import sinon from "sinon";
import Logger from "../../../lib/loggers/Logger.js";

test.serial.beforeEach((t) => {
	t.context.logHandler = sinon.stub();
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");
	process.on(Logger.LOG_EVENT_NAME, t.context.logHandler);
});

test.serial.afterEach.always((t) => {
	process.off(Logger.LOG_EVENT_NAME, t.context.logHandler);
	delete process.env.UI5_LOG_LVL;
	sinon.restore();
});

test.serial("isLevelEnabled", (t) => {
	// On silly all levels should be enabled
	process.env.UI5_LOG_LVL = "silly";
	t.true(Logger.isLevelEnabled("silly"));
	t.true(Logger.isLevelEnabled("verbose"));
	t.true(Logger.isLevelEnabled("perf"));
	t.true(Logger.isLevelEnabled("info"));
	t.true(Logger.isLevelEnabled("warn"));
	t.true(Logger.isLevelEnabled("error"));
	t.true(Logger.isLevelEnabled("silent"));

	// On silent only silent should be enabled
	// (which does not allow any logging)
	process.env.UI5_LOG_LVL = "silent";
	t.false(Logger.isLevelEnabled("silly"));
	t.false(Logger.isLevelEnabled("verbose"));
	t.false(Logger.isLevelEnabled("perf"));
	t.false(Logger.isLevelEnabled("info"));
	t.false(Logger.isLevelEnabled("warn"));
	t.false(Logger.isLevelEnabled("error"));
	t.true(Logger.isLevelEnabled("silent"));

	// On info only info,warn,error,silent should be enabled
	process.env.UI5_LOG_LVL = "info";
	t.false(Logger.isLevelEnabled("silly"));
	t.false(Logger.isLevelEnabled("verbose"));
	t.false(Logger.isLevelEnabled("perf"));
	t.true(Logger.isLevelEnabled("info"));
	t.true(Logger.isLevelEnabled("warn"));
	t.true(Logger.isLevelEnabled("error"));
	t.true(Logger.isLevelEnabled("silent"));

	t.throws(() => {
		Logger.isLevelEnabled("all");
	}, {message: `Unknown log level "all"`});

	process.env.UI5_LOG_LVL = "unknown level";
	t.throws(() => {
		Logger.isLevelEnabled("warn");
	}, {message: `UI5 Logger: Environment variable UI5_LOG_LVL is set to an unknown log level "unknown level". ` +
			`Valid levels are silly, verbose, perf, info, warn, error, silent`});
});

test.serial("Correct log event name", (t) => {
	t.is(Logger.LOG_EVENT_NAME, "ui5.log", "Correct log event name exposed");
});

test.serial("Setting all log levels via API", (t) => {
	const levels = ["silly", "verbose", "perf", "info", "warn", "error", "silent"];

	for (const level of levels) {
		Logger.setLevel(level);
		t.is(process.env.UI5_LOG_LVL, level, "Environment variable updated correctly");
		t.true(Logger.isLevelEnabled(level), `Set level ${level} should be enabled`);
	}
});

test.serial("Setting all log levels via environment variable)", (t) => {
	const levels = ["silly", "verbose", "perf", "info", "warn", "error", "silent"];

	for (const level of levels) {
		process.env.UI5_LOG_LVL = level;
		t.true(Logger.isLevelEnabled(level), `Set level ${level} should be enabled`);
	}
});

test.serial("Missing parameter: module name", (t) => {
	t.throws(() => {
		new Logger();
	}, {
		message: "Logger: Missing moduleName parameter"
	}, "Threw with expected error message");
});

test.serial("Legal module names", (t) => {
	function testNotThrows(moduleName) {
		t.notThrows(() => {
			new Logger(moduleName);
		}, "Did not throw");
	}
	testNotThrows("Module:Name");
	testNotThrows("@module");
	testNotThrows("m0-dule_.nAme");
	testNotThrows("module/name");
});

test.serial("Illegal module names", (t) => {
	function testThrows(moduleName) {
		t.throws(() => {
			new Logger(moduleName);
		}, {
			message: `Logger: Invalid module name: ${moduleName}`
		}, "Threw with expected error message");
	}
	testThrows("module name");
	testThrows("module\\name");
	testThrows("näme");
	testThrows("🧗");
});

test.serial("Log messages", (t) => {
	const {logHandler, stderrWriteStub} = t.context;
	const myLogger = new Logger("my:module:name");

	// Log level does not influence events
	process.env.UI5_LOG_LVL = "error";

	Logger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		myLogger[level]("Message 1");
		t.is(logHandler.callCount, 1, "Emitted and captured one log event");
		t.deepEqual(logHandler.getCall(0).args[0], {
			level,
			message: "Message 1",
			moduleName: "my:module:name",
		}, "Emitted correct log event");
		logHandler.reset();
	});

	t.is(stderrWriteStub.callCount, 0, "stderr.write was never called");
});

test.serial("Log object", (t) => {
	const {logHandler} = t.context;
	const myLogger = new Logger("my:module:name");

	myLogger.error({
		this: {
			is: {
				a: {
					deep: [
						"object"
					]
				}
			}
		}
	});
	t.is(logHandler.callCount, 1, "Emitted and captured one log event");
	t.deepEqual(logHandler.getCall(0).args[0], {
		level: "error",
		message: `{
  this: {
    is: { a: { deep: [Array] } }
  }
}`,
		moduleName: "my:module:name",
	}, "Emitted correct log event");
});

test.serial("Log other non-strings", (t) => {
	const {logHandler} = t.context;
	const myLogger = new Logger("my:module:name");

	function compareLog(value, expectdMessage) {
		myLogger.info(value);
		t.is(logHandler.callCount, 1, "Emitted and captured one log event");
		t.deepEqual(logHandler.getCall(0).args[0], {
			level: "info",
			message: expectdMessage,
			moduleName: "my:module:name",
		}, "Emitted correct log event");
		logHandler.reset();
	}

	compareLog(undefined, "undefined");
	compareLog(null, "null");
	compareLog(0, "0");
});

test.serial("Log multiple arguments", (t) => {
	const {logHandler} = t.context;
	const myLogger = new Logger("my:module:name");

	// eslint-disable-next-line no-new-wrappers
	myLogger.info("This", new String("is"), "a", ["test"]);
	t.is(logHandler.callCount, 1, "Emitted and captured one log event");
	t.deepEqual(logHandler.getCall(0).args[0], {
		level: "info",
		message: `This is a [ 'test' ]`,
		moduleName: "my:module:name",
	}, "Emitted correct log event");
});

test.serial("No string substitution", (t) => {
	const {logHandler} = t.context;
	const myLogger = new Logger("my:module:name");

	myLogger.info("Some message %s with a placeholder", "project.a");
	t.is(logHandler.callCount, 1, "Emitted and captured one log event");
	t.deepEqual(logHandler.getCall(0).args[0], {
		level: "info",

		// Placeholder not replaced
		message: `Some message %s with a placeholder project.a`,
		moduleName: "my:module:name",
	}, "Emitted correct log event");
});

test.serial("No event listener", (t) => {
	const {logHandler, stderrWriteStub} = t.context;
	const myLogger = new Logger("my:module:name");
	process.off(Logger.LOG_EVENT_NAME, logHandler);

	myLogger.info("Message 1");
	myLogger.verbose("Message 2"); // Not logged for default log-level "info"
	myLogger.error("Message 3");
	t.is(stderrWriteStub.callCount, 2, "stderr.write got called twice");
	t.is(stderrWriteStub.getCall(0).args[0], "[info] my:module:name: Message 1\n", "Logged expected message");
	t.is(stderrWriteStub.getCall(1).args[0], "[error] my:module:name: Message 3\n", "Logged expected message");
});

test.serial("No logging for silent level", (t) => {
	const {logHandler, stderrWriteStub} = t.context;
	const myLogger = new Logger("my:module:name");
	process.off(Logger.LOG_EVENT_NAME, logHandler); // Remove listener to get direct console logging
	process.env.UI5_LOG_LVL = "silent";

	Logger.LOG_LEVELS.forEach((level) => {
		if (level === "silent") {
			// Can't log silent messages
			return;
		}
		myLogger[level]("Message");
	});
	t.is(stderrWriteStub.callCount, 0, "stderr.write never got called");
});
