import test from "ava";
import {getLogger, isLogLevelEnabled, setLogLevel, getLogLevel} from "../../lib/index.js";
import Logger from "../../lib/loggers/Logger.js";

test.serial.afterEach.always((t) => {
	delete process.env.UI5_LOG_LVL;
});

test.serial("getLogger", (t) => {
	const myLogger = getLogger("my-module");
	t.true(myLogger instanceof Logger, "Returned logger should be Logger instance");
});

test.serial("isLogLevelEnabled", (t) => {
	// On info only info,warn,error,silent should be enabled
	process.env.UI5_LOG_LVL = "info";
	t.false(isLogLevelEnabled("silly"));
	t.false(isLogLevelEnabled("verbose"));
	t.false(isLogLevelEnabled("perf"));
	t.true(isLogLevelEnabled("info"));
	t.true(isLogLevelEnabled("warn"));
	t.true(isLogLevelEnabled("error"));
	t.true(isLogLevelEnabled("silent"));
});

test.serial("setLevel", (t) => {
	setLogLevel("silent");
	t.is(process.env.UI5_LOG_LVL, "silent", "Log level set correctly");
});

test.serial("getLevel", (t) => {
	t.is(getLogLevel(), "info", "Returned default log level");
});
