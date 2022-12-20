import test from "ava";
import {strict as esmock} from "esmock";
import sinon from "sinon";

function getNpmLogStub() {
	return {
		newGroup: sinon.stub().callsFake(() => getNpmLogStub()),
		newItem: sinon.stub().callsFake(() => getNpmLogStub()),
		addWork: sinon.stub(),
		completeWork: sinon.stub(),
		finish: sinon.stub(),
		silly: sinon.stub(),
		verbose: sinon.stub(),
		perf: sinon.stub(),
		info: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub()
	};
}

test.beforeEach(async (t) => {
	t.context.npmLogStub = {
		enableProgress: sinon.stub(),
		disableProgress: sinon.stub(),
		enableUnicode: sinon.stub(),
		on: sinon.stub().onFirstCall().callsFake((name, fn) => {
			t.context.npmLogOnEventName = name;
			t.context.npmLogOnEventFn = fn;
		}),
		newGroup: sinon.stub().callsFake(() => getNpmLogStub()),
		newItem: sinon.stub().callsFake(() => getNpmLogStub()),
		addLevel: sinon.stub(),
		silly: sinon.stub(),
		verbose: sinon.stub(),
		perf: sinon.stub(),
		info: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub()
	};

	t.context.consoleLog = sinon.stub(console, "log");
	t.context.consoleTrace = sinon.stub(console, "trace");

	t.context.logger = await esmock("../../lib/logger", {
		npmlog: t.context.npmLogStub
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	delete process.env.UI5_LOG_LVL;
});

test.serial("getLogger", (t) => {
	const {logger} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = logger.getLogger("my-module");
	t.true(myLogger instanceof Logger, "Returned logger should be Logger instance");
});

test.serial("getGroupLogger throws (deprecated)", (t) => {
	const {logger} = t.context;

	t.throws(() => {
		logger.getGroupLogger("my-module");
	}, {
		message: "Deprecated call to @ui5/logger#getGroupLogger. " +
			"This function has been deprecated in @ui5/logger version 3 and will be " +
			"removed in the final release"
	});
});

test.serial("setLevel", (t) => {
	const {logger} = t.context;

	logger.setLevel("silly");
	t.is(t.context.npmLogStub.level, "silly", "npmlog.level should be set to 'silly'");

	t.throws(() => logger.setLevel("fancy"), {message: `Unknown log level "fancy"`});
	t.is(t.context.npmLogStub.level, "silly", "npmlog.level should still be set to 'silly'");
});

test.serial("isLevelEnabled", (t) => {
	const {logger, npmLogStub} = t.context;

	// On silly all levels should be enabled
	logger.setLevel("silly");
	t.true(logger.isLevelEnabled("silly"));
	t.true(logger.isLevelEnabled("verbose"));
	t.true(logger.isLevelEnabled("perf"));
	t.true(logger.isLevelEnabled("info"));
	t.true(logger.isLevelEnabled("warn"));
	t.true(logger.isLevelEnabled("error"));
	t.true(logger.isLevelEnabled("silent"));

	// On silent only silent should be enabled
	logger.setLevel("silent");
	t.false(logger.isLevelEnabled("silly"));
	t.false(logger.isLevelEnabled("verbose"));
	t.false(logger.isLevelEnabled("perf"));
	t.false(logger.isLevelEnabled("info"));
	t.false(logger.isLevelEnabled("warn"));
	t.false(logger.isLevelEnabled("error"));
	t.true(logger.isLevelEnabled("silent"));

	// On info only info,warn,error,silent should be enabled
	logger.setLevel("info");
	t.false(logger.isLevelEnabled("silly"));
	t.false(logger.isLevelEnabled("verbose"));
	t.false(logger.isLevelEnabled("perf"));
	t.true(logger.isLevelEnabled("info"));
	t.true(logger.isLevelEnabled("warn"));
	t.true(logger.isLevelEnabled("error"));
	t.true(logger.isLevelEnabled("silent"));

	t.throws(() => {
		logger.isLevelEnabled("all");
	}, {message: `Unknown log level "all"`});

	// Just to test the error handling
	npmLogStub.level = "level should not be set here";
	t.throws(() => {
		logger.isLevelEnabled("warn");
	}, {message: `Failed to find current log level "level should not be set here" in list of expected log levels`});
});

test.serial("setShowProgress (deprecated)", (t) => {
	const {logger, npmLogStub} = t.context;

	t.is(npmLogStub.enableProgress.callCount, 0, "enableProgress should not be called initially");
	t.is(npmLogStub.disableProgress.callCount, 0, "disableProgress should not be called initially");


	t.throws(() => {
		logger.setShowProgress(true);
	}, {
		message: "Deprecated call to @ui5/logger#setShowProgress. " +
			"This function has been deprecated in @ui5/logger version 3 and will be " +
			"removed in the final release"
	});
});

test.serial("npmlog.level default", (t) => {
	t.is(t.context.npmLogStub.level, "info", "Default level should be info");
});

test.serial("Environment variable UI5_LOG_LVL", async (t) => {
	const levels = ["silly", "verbose", "perf", "info", "warn", "error", "silent"];

	for (const level of levels) {
		process.env.UI5_LOG_LVL = level;
		t.context.logger = await esmock("../../lib/logger", {
			npmlog: t.context.npmLogStub
		});
		t.is(t.context.npmLogStub.level, level, `Level should be set to ${level}`);
	}
});

test.serial("Environment variable UI5_LOG_LVL (invalid)", async (t) => {
	process.env.UI5_LOG_LVL = "all";
	await t.throwsAsync(esmock("../../lib/logger"), {
		message: `UI5 Logger: Environment variable UI5_LOG_LVL is set to an unknown log level "all". ` +
			`Valid levels are silly, verbose, perf, info, warn, error, silent`
	});
});

test.serial("Logger", (t) => {
	const {logger, npmLogStub, consoleLog} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = new Logger("myModule");

	sinon.spy(logger, "isLevelEnabled");

	myLogger.isLevelEnabled("error");
	t.true(logger.isLevelEnabled.calledOnce, "Logger#isLevelEnabled should call static isLevelEnabled");

	const _logger = myLogger._getLogger();
	t.is(_logger, npmLogStub, "_getLogger should return npmlog");
	t.is(consoleLog.callCount, 1, "console.log got called once");
	t.is(consoleLog.getCall(0).args[0],
		"⚠️ Deprecated call to Logger#_getLogger. Internal method Logger#_getLogger " +
		"has been deprecated and will be removed.",
		"Correct log message");
	consoleLog.reset();

	["silly", "verbose", "perf", "info", "warn", "error"].forEach((level) => {
		myLogger[level]("Message 1");
		t.is(consoleLog.callCount, 0, "console.log did not get called");
		t.true(_logger[level].calledOnce, `npmlog.${level} should be called`);
		t.deepEqual(_logger[level].getCall(0).args, [
			"myModule",
			"Message 1",
		], `npmlog.${level} should be called with module name and message`);
		consoleLog.reset();
	});
});

test.serial("Logger: Two arguments", (t) => {
	const {logger, npmLogStub, consoleLog} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = new Logger("myModule");

	const _logger = myLogger._getLogger();
	t.is(_logger, npmLogStub, "_getLogger should return npmlog");
	t.is(consoleLog.callCount, 1, "console.log got called once");
	t.is(consoleLog.getCall(0).args[0],
		"⚠️ Deprecated call to Logger#_getLogger. Internal method Logger#_getLogger " +
		"has been deprecated and will be removed.",
		"Correct log message");
	consoleLog.reset();

	["silly", "verbose", "perf", "info", "warn", "error"].forEach((level) => {
		myLogger[level]("Message 1", {status: "running"});
		t.is(consoleLog.callCount, 0, "console.log has not been called");
		consoleLog.reset();
		t.true(_logger[level].calledOnce, `npmlog.${level} should be called`);
		t.deepEqual(_logger[level].getCall(0).args, [
			"myModule",
			"Message 1",
			{status: "running"}
		], `npmlog.${level} should be called with module name, first- and second argument`);
	});
});

test.serial("Logger: Multiple arguments", (t) => {
	const {logger, npmLogStub, consoleLog} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = new Logger("myModule");

	const _logger = myLogger._getLogger();
	t.is(_logger, npmLogStub, "_getLogger should return npmlog");
	t.is(consoleLog.callCount, 1, "console.log got called once");
	t.is(consoleLog.getCall(0).args[0],
		"⚠️ Deprecated call to Logger#_getLogger. Internal method Logger#_getLogger " +
		"has been deprecated and will be removed.",
		"Correct log message");
	consoleLog.reset();

	["silly", "verbose", "perf", "info", "warn", "error"].forEach((level) => {
		myLogger[level]("Message 1", {status: "running"}, 123);
		t.is(consoleLog.callCount, 1, "console.log got called once");
		t.is(consoleLog.getCall(0).args[0],
			`⚠️ @ui5/logger: Deprecated log.${level}() call with multiple arguments. @ui5/logger version 3 ` +
			`does not accept more than two argument. Call stack of this invocation:`,
			"Correct log message");
		consoleLog.reset();
		t.true(_logger[level].calledOnce, `npmlog.${level} should be called`);
		t.deepEqual(_logger[level].getCall(0).args, [
			"myModule",
			"Message 1",
			{status: "running"}
		], `npmlog.${level} should be called with module name, first- and second argument`);
	});
});

test.serial("Logger: String substitution characters", (t) => {
	const {logger, npmLogStub, consoleLog} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = new Logger("myModule");

	const _logger = myLogger._logger;
	t.is(_logger, npmLogStub, "_getLogger should return npmlog");

	["Hello %s", "Hello %d", "Hello %o", "Hello %O", "Hello %f", "Hello %c"].forEach((message) => {
		myLogger.info(message, "World");
		t.is(consoleLog.callCount, 0, "console.log has not been called");
		consoleLog.reset();
		t.true(_logger.info.calledOnce, `npmlog.info should be called`);
		t.deepEqual(_logger.info.getCall(0).args, [
			"myModule",
			"Hello <deprecated string substitution char>",
			"World",
		], `npmlog.info should be called with module name, first- and second argument`);
		_logger.info.reset();
	});
});

test.serial("npmlog errors are send to console", (t) => {
	const {npmLogOnEventName, npmLogOnEventFn, consoleLog} = t.context;

	t.is(consoleLog.callCount, 0);
	t.is(npmLogOnEventName, "error", "npmlog.on should be called with event name 'error'");

	npmLogOnEventFn("some message");

	t.is(consoleLog.callCount, 1);
	t.deepEqual(consoleLog.getCall(0).args, ["some message"]);
});
