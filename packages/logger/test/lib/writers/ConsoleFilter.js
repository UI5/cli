import test from "ava";
import sinon from "sinon";
import stripAnsi from "strip-ansi";
import ConsoleWriter from "../../../lib/writers/Console.js";

test.serial.beforeEach((t) => {
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");
	t.context.originalIsTty = process.stderr.isTTY;
	process.env.UI5_LOG_LVL = "info";
});

test.serial.afterEach.always((t) => {
	if (t.context.consoleWriter) {
		t.context.consoleWriter.disable();
	}
	sinon.restore();
	process.stderr.isTTY = t.context.originalIsTty;
	delete process.env.UI5_LOG_LVL;
	delete process.env.UI5_LOG_MODULES;
});

test.serial("Module filtering: No filter", (t) => {
	const {stderrWriteStub} = t.context;
	t.context.consoleWriter = ConsoleWriter.init();

	process.emit("ui5.log", {
		level: "info",
		message: "Message 1",
		moduleName: "my:module"
	});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info my:module Message 1\n`,
		"Logged expected message");
});

test.serial("Module filtering: Enable one module", (t) => {
	const {stderrWriteStub} = t.context;
	process.env.UI5_LOG_MODULES = "my:module";
	t.context.consoleWriter = ConsoleWriter.init();

	process.emit("ui5.log", {level: "info", message: "Message 1", moduleName: "my:module"});
	process.emit("ui5.log", {level: "info", message: "Message 2", moduleName: "other:module"});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info my:module Message 1\n`,
		"Logged expected message");
});

test.serial("Module filtering: Enable one namespace", (t) => {
	const {stderrWriteStub} = t.context;
	process.env.UI5_LOG_MODULES = "my:*";
	t.context.consoleWriter = ConsoleWriter.init();

	process.emit("ui5.log", {level: "info", message: "Message 1", moduleName: "my:module"});
	process.emit("ui5.log", {level: "info", message: "Message 2", moduleName: "my:other:module"});
	process.emit("ui5.log", {level: "info", message: "Message 3", moduleName: "other:module"});

	t.is(stderrWriteStub.callCount, 2, "Logged two messages");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info my:module Message 1\n`,
		"Logged expected message");
	t.is(stripAnsi(stderrWriteStub.getCall(1).args[0]), `info my:other:module Message 2\n`,
		"Logged expected message");
});

test.serial("Module filtering: Disable one module", (t) => {
	const {stderrWriteStub} = t.context;
	process.env.UI5_LOG_MODULES = "-my:module";
	t.context.consoleWriter = ConsoleWriter.init();

	process.emit("ui5.log", {level: "info", message: "Message 1", moduleName: "my:module"});
	process.emit("ui5.log", {level: "info", message: "Message 2", moduleName: "other:module"});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info other:module Message 2\n`,
		"Logged expected message");
});

test.serial("Module filtering: Disable one namespace", (t) => {
	const {stderrWriteStub} = t.context;
	process.env.UI5_LOG_MODULES = "-my:*";
	t.context.consoleWriter = ConsoleWriter.init();

	process.emit("ui5.log", {level: "info", message: "Message 1", moduleName: "my:module"});
	process.emit("ui5.log", {level: "info", message: "Message 2", moduleName: "my:other:module"});
	process.emit("ui5.log", {level: "info", message: "Message 3", moduleName: "other:module"});

	t.is(stderrWriteStub.callCount, 1, "Logged one message");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info other:module Message 3\n`,
		"Logged expected message");
});

test.serial("Module filtering: Combination of settings", (t) => {
	const {stderrWriteStub} = t.context;
	process.env.UI5_LOG_MODULES = "my:*, -my:other:module, other:module";
	t.context.consoleWriter = ConsoleWriter.init();

	process.emit("ui5.log", {level: "info", message: "Message 1", moduleName: "my:module"});
	process.emit("ui5.log", {level: "info", message: "Message 2", moduleName: "my:other:module"});
	process.emit("ui5.log", {level: "info", message: "Message 3", moduleName: "other:module"});
	process.emit("ui5.log", {level: "info", message: "Message 4", moduleName: "another:module"});

	t.is(stderrWriteStub.callCount, 2, "Logged two messages");
	t.is(stripAnsi(stderrWriteStub.getCall(0).args[0]), `info my:module Message 1\n`,
		"Logged expected message for my:module");
	t.is(stripAnsi(stderrWriteStub.getCall(1).args[0]), `info other:module Message 3\n`,
		"Logged expected message for other:module");
});
