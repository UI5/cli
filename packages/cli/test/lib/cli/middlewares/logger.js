import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import stripAnsi from "strip-ansi";

test.beforeEach(async (t) => {
	t.context.verboseLogStub = sinon.stub();
	t.context.setLogLevelStub = sinon.stub();
	t.context.isLogLevelEnabledStub = sinon.stub().returns(true);
	t.context.getLogLevelStub = sinon.stub().returns("info");
	t.context.getVersionStub = sinon.stub().returns("1.2.3");
	t.context.getVersionWithLocationStub = sinon.stub().returns("1.0.0 (from /path/to/ui5.cjs)");
	t.context.consoleInitStub = sinon.stub();
	t.context.interactiveInitStub = sinon.stub();
	t.context.logger = await esmock.p("../../../../lib/cli/middlewares/logger.js", {
		"../../../../lib/cli/version.js": {
			getVersion: t.context.getVersionStub,
			getVersionWithLocation: t.context.getVersionWithLocationStub
		},
		"@ui5/logger": {
			getLogger: () => ({
				verbose: t.context.verboseLogStub,
			}),
			setLogLevel: t.context.setLogLevelStub,
			isLogLevelEnabled: t.context.isLogLevelEnabledStub,
			getLogLevel: t.context.getLogLevelStub,
		},
		"@ui5/logger/writers/Console": {
			default: {init: t.context.consoleInitStub}
		},
		"@ui5/logger/writers/InteractiveConsole": {
			default: {init: t.context.interactiveInitStub}
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	if (t.context.logger) {
		esmock.purge(t.context.logger);
	}
});

test.serial("init logger", async (t) => {
	const {logger, setLogLevelStub, isLogLevelEnabledStub, verboseLogStub, getVersionWithLocationStub} = t.context;
	await logger.initLogger({});
	t.is(setLogLevelStub.callCount, 0, "setLevel has not been called");
	t.is(isLogLevelEnabledStub.callCount, 1, "isLogLevelEnabled has been called once");
	t.is(isLogLevelEnabledStub.firstCall.firstArg, "verbose",
		"isLogLevelEnabled has been called with expected argument");
	t.is(getVersionWithLocationStub.callCount, 1, "getVersionWithLocation has been called once");
	t.is(verboseLogStub.callCount, 2, "log.verbose has been called twice");
	t.is(verboseLogStub.firstCall.firstArg, "using @ui5/cli version 1.0.0 (from /path/to/ui5.cjs)",
		"log.verbose has been called with expected argument on first call");
	t.is(verboseLogStub.secondCall.firstArg, `using node version ${process.version}`,
		"log.verbose has been called with expected argument on second call");
});

test.serial("With log-level flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({loglevel: "silly"});
	t.is(setLogLevelStub.callCount, 1, "setLevel has been called once");
	t.is(setLogLevelStub.getCall(0).args[0], "silly", "sets log level to silly");
});

test.serial("With default log-level flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({loglevel: "info"});
	t.is(setLogLevelStub.callCount, 0, "setLevel has not been called");
});

test.serial("With verbose flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({verbose: true});
	t.is(setLogLevelStub.callCount, 1, "setLevel has been called once");
	t.is(setLogLevelStub.getCall(0).args[0], "verbose", "sets log level to verbose");
});

test.serial("With perf flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({perf: true});
	t.is(setLogLevelStub.callCount, 1, "setLevel has been called once");
	t.is(setLogLevelStub.getCall(0).args[0], "perf", "sets log level to perf");
});

test.serial("With silent flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({silent: true});
	t.is(setLogLevelStub.callCount, 1, "setLevel has been called once");
	t.is(setLogLevelStub.getCall(0).args[0], "silent", "sets log level to silent");
});

test.serial("With log-level and verbose flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({loglevel: "silly", verbose: true});
	t.is(setLogLevelStub.callCount, 2, "setLevel has been called twice");
	t.is(setLogLevelStub.getCall(0).args[0], "verbose", "sets log level to verbose");
	t.is(setLogLevelStub.getCall(1).args[0], "silly", "sets log level to verbose");
});

test.serial("With log-level, verbose, perf and silent flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({loglevel: "silly", verbose: true, perf: true, silent: true});
	t.is(setLogLevelStub.callCount, 4, "setLevel has been called four times");
	t.is(setLogLevelStub.getCall(0).args[0], "silent", "sets log level to silent");
	t.is(setLogLevelStub.getCall(1).args[0], "perf", "sets log level to perf");
	t.is(setLogLevelStub.getCall(2).args[0], "verbose", "Third sets log level to verbose");
	t.is(setLogLevelStub.getCall(3).args[0], "silly", "sets log level to verbose");
});

// Helper: swap process.stderr.isTTY and UI5_CLI_NO_INTERACTIVE for the duration
// of a single test, restoring both when done. Interactive-writer selection is
// derived from these two globals, so a targeted helper keeps each test focused
// on the branch it exercises.
function withInteractiveEnv({isTTY, noInteractive}, run) {
	const originalIsTTY = process.stderr.isTTY;
	const originalNoInteractive = process.env.UI5_CLI_NO_INTERACTIVE;
	process.stderr.isTTY = isTTY;
	if (noInteractive === undefined) {
		delete process.env.UI5_CLI_NO_INTERACTIVE;
	} else {
		process.env.UI5_CLI_NO_INTERACTIVE = noInteractive;
	}
	return Promise.resolve()
		.then(run)
		.finally(() => {
			process.stderr.isTTY = originalIsTTY;
			if (originalNoInteractive === undefined) {
				delete process.env.UI5_CLI_NO_INTERACTIVE;
			} else {
				process.env.UI5_CLI_NO_INTERACTIVE = originalNoInteractive;
			}
		});
}

test.serial("Interactive writer: enabled for 'serve' on TTY with interactive log level", async (t) => {
	const {logger, consoleInitStub, interactiveInitStub, getVersionStub} = t.context;
	const emitStub = sinon.stub(process, "emit");
	try {
		await withInteractiveEnv({isTTY: true, noInteractive: undefined}, () =>
			logger.initLogger({_: ["serve"]})
		);
	} finally {
		emitStub.restore();
	}
	t.is(interactiveInitStub.callCount, 1, "InteractiveConsole.init called");
	t.is(consoleInitStub.callCount, 0, "Plain ConsoleWriter.init not called");
	t.is(getVersionStub.callCount, 1, "getVersion queried for tool-info event");
	const toolInfoCall = emitStub.getCalls().find((c) => c.args[0] === "ui5.tool-info");
	t.truthy(toolInfoCall, "ui5.tool-info event emitted");
	t.deepEqual(toolInfoCall.args[1], {name: "UI5 CLI", version: "1.2.3"},
		"tool-info payload matches expected");
});

test.serial("Interactive writer: falls back to '' when getVersion returns undefined", async (t) => {
	const {logger, interactiveInitStub, getVersionStub} = t.context;
	getVersionStub.returns(undefined);
	const emitStub = sinon.stub(process, "emit");
	try {
		await withInteractiveEnv({isTTY: true, noInteractive: undefined}, () =>
			logger.initLogger({_: ["serve"]})
		);
	} finally {
		emitStub.restore();
	}
	t.is(interactiveInitStub.callCount, 1, "InteractiveConsole.init called");
	const toolInfoCall = emitStub.getCalls().find((c) => c.args[0] === "ui5.tool-info");
	t.deepEqual(toolInfoCall.args[1], {name: "UI5 CLI", version: ""},
		"tool-info payload uses empty string when version unknown");
});

test.serial("Interactive writer: skipped for non-serve command", async (t) => {
	const {logger, consoleInitStub, interactiveInitStub} = t.context;
	await withInteractiveEnv({isTTY: true, noInteractive: undefined}, () =>
		logger.initLogger({_: ["build"]})
	);
	t.is(interactiveInitStub.callCount, 0, "InteractiveConsole.init not called");
	t.is(consoleInitStub.callCount, 1, "Plain ConsoleWriter.init called instead");
});

test.serial("Interactive writer: skipped when stderr is not a TTY", async (t) => {
	const {logger, consoleInitStub, interactiveInitStub} = t.context;
	await withInteractiveEnv({isTTY: false, noInteractive: undefined}, () =>
		logger.initLogger({_: ["serve"]})
	);
	t.is(interactiveInitStub.callCount, 0, "InteractiveConsole.init not called");
	t.is(consoleInitStub.callCount, 1, "Plain ConsoleWriter.init called instead");
});

test.serial("Interactive writer: skipped for non-interactive log level (verbose)", async (t) => {
	const {logger, consoleInitStub, interactiveInitStub, getLogLevelStub} = t.context;
	getLogLevelStub.returns("verbose");
	await withInteractiveEnv({isTTY: true, noInteractive: undefined}, () =>
		logger.initLogger({_: ["serve"]})
	);
	t.is(interactiveInitStub.callCount, 0, "InteractiveConsole.init not called");
	t.is(consoleInitStub.callCount, 1, "Plain ConsoleWriter.init called instead");
});

test.serial("Interactive writer: skipped when UI5_CLI_NO_INTERACTIVE is set", async (t) => {
	const {logger, consoleInitStub, interactiveInitStub} = t.context;
	await withInteractiveEnv({isTTY: true, noInteractive: "1"}, () =>
		logger.initLogger({_: ["serve"]})
	);
	t.is(interactiveInitStub.callCount, 0, "InteractiveConsole.init not called");
	t.is(consoleInitStub.callCount, 1, "Plain ConsoleWriter.init called instead");
});

test.serial("Interactive writer: skipped when argv._ is not an array", async (t) => {
	const {logger, consoleInitStub, interactiveInitStub} = t.context;
	await withInteractiveEnv({isTTY: true, noInteractive: undefined}, () =>
		logger.initLogger({})
	);
	t.is(interactiveInitStub.callCount, 0, "InteractiveConsole.init not called");
	t.is(consoleInitStub.callCount, 1, "Plain ConsoleWriter.init called instead");
});

import path from "node:path";
import {execa} from "execa";
import {readFileSync} from "node:fs";

const pkgJsonPath = new URL("../../../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgJsonPath));
const __dirname = import.meta.dirname;
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.cjs");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test("ui5 --verbose", async (t) => {
	// Using "versions" as a command, as the --verbose flag can't be used standalone
	const {stderr} = await ui5(["versions", "--verbose"]);
	// Debugger info is also included into the message. We need to exclude it
	t.true(stripAnsi(stderr).includes(
		`verb cli:middlewares:base using @ui5/cli version ${pkg.version} (from ${ui5Cli})\n`+
		`verb cli:middlewares:base using node version ${process.version}`));
});
