const test = require("ava");
const mock = require("mock-require");
const sinon = require("sinon");

function getNpmLogStub() {
	return {
		newGroup: sinon.stub().callsFake(() => getNpmLogStub()),
		newItem: sinon.stub().callsFake(() => getNpmLogStub()),
		addWork: sinon.stub(),
		completeWork: sinon.stub(),
		finish: sinon.stub(),
		silly: sinon.stub(),
		verbose: sinon.stub(),
		info: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub()
	};
}

test.beforeEach((t) => {
	t.context.npmLogStub = {
		enableProgress: sinon.stub(),
		disableProgress: sinon.stub(),
		enableUnicode: sinon.stub(),
		on: sinon.stub(),
		newGroup: sinon.stub().callsFake(() => getNpmLogStub()),
		newItem: sinon.stub().callsFake(() => getNpmLogStub()),
		silly: sinon.stub(),
		verbose: sinon.stub(),
		info: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub()
	};
	mock("npmlog", t.context.npmLogStub);

	t.context.logger = mock.reRequire("../../lib/logger");
});

test.afterEach.always((t) => {
	mock.stopAll();
	sinon.restore();
	delete process.env.UI5_LOG_LVL;
});

test.serial("getLogger", (t) => {
	const {logger} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = logger.getLogger("my-module");
	t.true(myLogger instanceof Logger, "Returned logger should be Logger instance");
});

test.serial("getGroupLogger", (t) => {
	const {logger} = t.context;
	const {GroupLogger} = logger.__test__;

	const myLogger = logger.getGroupLogger("my-module");
	t.true(myLogger instanceof GroupLogger, "Returned logger should be Logger instance");
});

test.serial("setLevel", (t) => {
	const {logger} = t.context;

	logger.setLevel("silly");
	t.is(t.context.npmLogStub.level, "silly", "npmlog.level should be set to 'silly'");

	t.throws(() => logger.setLevel("fancy"), {message: `Unkown log level "fancy"`});
	t.is(t.context.npmLogStub.level, "silly", "npmlog.level should still be set to 'silly'");
});

test.serial("isLevelEnabled", (t) => {
	const {logger, npmLogStub} = t.context;

	// On silly all levels should be enabled
	logger.setLevel("silly");
	t.true(logger.isLevelEnabled("silly"));
	t.true(logger.isLevelEnabled("verbose"));
	t.true(logger.isLevelEnabled("info"));
	t.true(logger.isLevelEnabled("warn"));
	t.true(logger.isLevelEnabled("error"));
	t.true(logger.isLevelEnabled("silent"));

	// On silent only silent should be enabled
	logger.setLevel("silent");
	t.false(logger.isLevelEnabled("silly"));
	t.false(logger.isLevelEnabled("verbose"));
	t.false(logger.isLevelEnabled("info"));
	t.false(logger.isLevelEnabled("warn"));
	t.false(logger.isLevelEnabled("error"));
	t.true(logger.isLevelEnabled("silent"));

	// On info only info,warn,error,silent should be enabled
	logger.setLevel("info");
	t.false(logger.isLevelEnabled("silly"));
	t.false(logger.isLevelEnabled("verbose"));
	t.true(logger.isLevelEnabled("info"));
	t.true(logger.isLevelEnabled("warn"));
	t.true(logger.isLevelEnabled("error"));
	t.true(logger.isLevelEnabled("silent"));

	t.throws(() => {
		logger.isLevelEnabled("all");
	}, {message: `Unkown log level "all"`});

	// Just to test the error handling
	npmLogStub.level = "level should not be set here";
	t.throws(() => {
		logger.isLevelEnabled("warn");
	}, {message: `Failed to find current log level "level should not be set here" in list of expected log levels`});
});

test.serial("setShowProgress", (t) => {
	const {logger, npmLogStub} = t.context;

	t.is(npmLogStub.enableProgress.callCount, 0, "enableProgress should not be called initially");
	t.is(npmLogStub.disableProgress.callCount, 0, "disableProgress should not be called initially");

	logger.setShowProgress(true);

	t.is(npmLogStub.enableProgress.callCount, 1, "enableProgress should be called once");
	t.is(npmLogStub.disableProgress.callCount, 0, "disableProgress should still not be called");

	logger.setShowProgress(false);

	t.is(npmLogStub.enableProgress.callCount, 1, "enableProgress should still be called once");
	t.is(npmLogStub.disableProgress.callCount, 1, "disableProgress should be called once");
});

test.serial("npmlog.level default", (t) => {
	t.is(t.context.npmLogStub.level, "info", "Default level should be info");
});

test.serial("Environment variable UI5_LOG_LVL", (t) => {
	["silly", "verbose", "info", "warn", "error", "silent"].forEach((level) => {
		process.env.UI5_LOG_LVL = level;
		t.context.logger = mock.reRequire("../../lib/logger");
		t.is(t.context.npmLogStub.level, level, "Level should be set to " + level);
	});
});

test.serial("Environment variable UI5_LOG_LVL (invalid)", (t) => {
	process.env.UI5_LOG_LVL = "all";
	t.throws(() => {
		mock.reRequire("../../lib/logger");
	}, {
		message: `UI5 Logger: Environment variable UI5_LOG_LVL is set to an unkown log level "all". ` +
			`Valid levels are silly, verbose, info, warn, error, silent`
	});
});

test.serial("Logger", (t) => {
	const {logger, npmLogStub} = t.context;
	const {Logger} = logger.__test__;

	const myLogger = new Logger("myModule");

	sinon.spy(logger, "isLevelEnabled");

	myLogger.isLevelEnabled("error");
	t.true(logger.isLevelEnabled.calledOnce, "Logger#isLevelEnabled should call static isLevelEnabled");

	const _logger = myLogger._getLogger();
	t.is(_logger, npmLogStub, "_getLogger should return npmlog");

	["silly", "verbose", "info", "warn", "error"].forEach((level) => {
		myLogger[level]("Message 1", "Message 2", "Message 3");
		t.true(_logger[level].calledOnce, `npmlog.${level} should be called`);
		t.deepEqual(_logger[level].getCall(0).args, [
			"myModule",
			"Message 1",
			"Message 2",
			"Message 3"
		], `npmlog.${level} should be called with module name and arguments`);
	});
});

test.serial("GroupLogger", (t) => {
	const {logger} = t.context;
	const {GroupLogger} = logger.__test__;

	const myLogger = new GroupLogger("myModule");

	sinon.spy(logger, "isLevelEnabled");

	myLogger.isLevelEnabled("error");
	t.true(logger.isLevelEnabled.calledOnce, "Logger#isLevelEnabled should call static isLevelEnabled");

	const _logger = myLogger._getLogger();

	["silly", "verbose", "info", "warn", "error"].forEach((level) => {
		myLogger[level]("Message 1", "Message 2", "Message 3");
		t.true(_logger[level].calledOnce, `npmlog.${level} should be called`);
		t.deepEqual(_logger[level].getCall(0).args, [
			"myModule",
			"Message 1",
			"Message 2",
			"Message 3"
		], `npmlog.${level} should be called with module name and arguments`);
	});
});

test.serial("GroupLogger#createSubLogger", (t) => {
	const {logger} = t.context;
	const {GroupLogger} = logger.__test__;

	const myLogger = new GroupLogger("myModule");

	const subLogger = myLogger.createSubLogger("mySubLogger", 1);
	t.true(subLogger instanceof GroupLogger, "createSubLogger should return a GroupLogger");
});

test.serial("GroupLogger#createTaskLogger", (t) => {
	const {logger} = t.context;
	const {GroupLogger, TaskLogger} = logger.__test__;

	const myLogger = new GroupLogger("myModule");

	const taskLogger = myLogger.createTaskLogger("myTaskLogger", 1, 1);
	t.true(taskLogger instanceof TaskLogger, "createTaskLogger should return a TaskLogger");
});

test.serial("TaskLogger", (t) => {
	const {logger} = t.context;
	const {TaskLogger} = logger.__test__;

	const myLogger = new TaskLogger("myModule");

	sinon.spy(logger, "isLevelEnabled");

	myLogger.isLevelEnabled("error");
	t.true(logger.isLevelEnabled.calledOnce, "Logger#isLevelEnabled should call static isLevelEnabled");

	const _logger = myLogger._getLogger();

	["silly", "verbose", "info", "warn", "error"].forEach((level) => {
		myLogger[level]("Message 1", "Message 2", "Message 3");
		t.true(_logger[level].calledOnce, `npmlog.${level} should be called`);
		t.deepEqual(_logger[level].getCall(0).args, [
			"myModule",
			"Message 1",
			"Message 2",
			"Message 3"
		], `npmlog.${level} should be called with module name and arguments`);
	});
});

test.serial("TaskLogger#addWork", (t) => {
	const {logger} = t.context;
	const {TaskLogger} = logger.__test__;

	const myLogger = new TaskLogger("myModule");

	t.is(myLogger._todo, 0, "todo should be 0");

	myLogger.addWork(1);

	t.is(myLogger._todo, 1, "todo should be 1");
});

test.serial("TaskLogger#startWork", (t) => {
	const {logger} = t.context;
	const {TaskLogger} = logger.__test__;

	const myLogger = new TaskLogger("myModule", 3);

	sinon.spy(myLogger, "info");

	myLogger.startWork("Message 1", "Message 2");

	t.true(myLogger.info.calledOnce, "startWork should call info once");
	t.deepEqual(myLogger.info.getCall(0).args, [
		"(1/3)", "Message 1", "Message 2"
	], "startWork should call info with expected args");
});

test.serial("TaskLogger#completeWork", (t) => {
	const {logger} = t.context;
	const {TaskLogger} = logger.__test__;

	const myLogger = new TaskLogger("myModule", 3);

	const _logger = myLogger._getLogger();

	t.is(myLogger._completed, 0, "0 should be completed");

	myLogger.startWork("Message");

	myLogger.completeWork(1);

	t.true(_logger.completeWork.calledOnce, "completeWork should call npmlog.completeWork");
	t.deepEqual(_logger.completeWork.getCall(0).args, [1], "completeWork should be called with expected args");

	t.is(myLogger._completed, 1, "1 should be completed");
});

test.serial("TaskLogger#finish", (t) => {
	const {logger} = t.context;
	const {TaskLogger} = logger.__test__;

	const myLogger = new TaskLogger("myModule", 3);

	const _logger = myLogger._getLogger();

	myLogger.finish();

	t.true(_logger.finish.calledOnce, "finished should call npmlog.finish");
});
