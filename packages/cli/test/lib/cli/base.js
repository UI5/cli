import test from "ava";
import path from "node:path";
import {execa} from "execa";
import sinon from "sinon";
import esmock from "esmock";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import yargs from "yargs";
import {readFileSync} from "node:fs";

const pkgJsonPath = new URL("../../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgJsonPath));
const __dirname = import.meta.dirname;
const ui5Cli = path.join(__dirname, "..", "..", "..", "bin", "ui5.cjs");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test.beforeEach(async (t) => {
	t.context.consoleLogStub = sinon.stub(process.stderr, "write");

	t.context.isLogLevelEnabledStub = sinon.stub();
	t.context.isLogLevelEnabledStub.withArgs("error").returns(true);
	t.context.isLogLevelEnabledStub.withArgs("verbose").returns(false);
	t.context.consoleWriterStopStub = sinon.stub();

	t.context.base = await esmock("../../../lib/cli/base.js", {
		"@ui5/logger": {
			isLogLevelEnabled: t.context.isLogLevelEnabledStub
		},
		"@ui5/logger/writers/Console": {
			stop: t.context.consoleWriterStopStub
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("ui5 --version", async (t) => {
	const {stdout} = await ui5(["--version"]);
	t.is(stdout, `${pkg.version} (from ${ui5Cli})`);
});

test.serial("ui5 -v", async (t) => {
	const {stdout} = await ui5(["-v"]);
	t.is(stdout, `${pkg.version} (from ${ui5Cli})`);
});

test.serial("Handle multiple options", async (t) => {
	const {stderr} = await ui5(["versions", "--log-level", "silent", "--log-level", "silly"]);
	t.regex(stripAnsi(stderr), /verb/g, "Verbose logging got enabled");
});

test.serial("Yargs error handling", async (t) => {
	const {consoleLogStub, consoleWriterStopStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const {default: base} = await import("../../../lib/cli/base.js");

	const cli = yargs();

	base(cli);

	cli.command({
		command: "foo",
		describe: "This is a task",
		handler: async function() {}
	});

	await cli.parseAsync(["invalid"]);

	const errorCode = await processExit;

	t.is(errorCode, 1, "Should exit with error code 1");
	t.is(consoleWriterStopStub.callCount, 0, "ConsoleWriter.stop did not get called");
	t.is(consoleLogStub.callCount, 6);
	t.deepEqual(consoleLogStub.getCall(0).args, [chalk.bold.yellow("Command Failed:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(2).args, ["Unknown argument: invalid"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, ["\n\n"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(4).args, [
		chalk.dim(`See 'ui5 --help'`)
	], "Correct error log");
});


test.serial("Exception error handling", async (t) => {
	const {base, consoleLogStub, consoleWriterStopStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const cli = yargs();

	base(cli);

	const error = new Error("Some error from foo command");

	cli.command({
		command: "foo",
		describe: "This task fails with an error",
		handler: async function() {
			throw error;
		}
	});

	await t.throwsAsync(cli.parse(["foo"]), {
		is: error
	});

	const errorCode = await processExit;

	t.is(errorCode, 1, "Should exit with error code 1");
	t.is(consoleWriterStopStub.callCount, 1, "ConsoleWriter.stop got called once");
	t.is(consoleLogStub.callCount, 10);
	t.deepEqual(consoleLogStub.getCall(1).args, [chalk.bold.red("⚠️  Process Failed With Error")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [chalk.underline("Error Message:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(5).args,
		["Some error from foo command"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(8).args, [chalk.dim(
		`For details, execute the same command again with an additional '--verbose' parameter`)], "Correct error log");
});

test.serial("Exception error handling without logging (silent)", async (t) => {
	const {base, consoleLogStub, isLogLevelEnabledStub, consoleWriterStopStub} = t.context;

	isLogLevelEnabledStub.withArgs("error").returns(false);

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const cli = yargs();

	base(cli);

	const error = new Error("Some error from foo command");

	cli.command({
		command: "foo",
		describe: "This task fails with an error",
		handler: async function() {
			throw error;
		}
	});

	await t.throwsAsync(cli.parse(["foo"]), {
		is: error
	});

	const errorCode = await processExit;

	t.is(errorCode, 1, "Should exit with error code 1");
	t.is(consoleWriterStopStub.callCount, 1, "ConsoleWriter.stop got called once");
	t.is(consoleLogStub.callCount, 0);
});

test.serial("Exception error handling with verbose logging", async (t) => {
	const {base, consoleLogStub, isLogLevelEnabledStub} = t.context;

	isLogLevelEnabledStub.withArgs("verbose").returns(true);

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const cli = yargs();

	base(cli);

	const error = new Error("Some error from foo command");

	cli.command({
		command: "foo",
		describe: "This task fails with an error",
		handler: async function() {
			throw error;
		}
	});

	await t.throwsAsync(cli.parse(["foo"]), {
		is: error
	});

	const errorCode = await processExit;

	t.is(errorCode, 1, "Should exit with error code 1");
	t.is(consoleLogStub.callCount, 14);
	t.deepEqual(consoleLogStub.getCall(1).args, [chalk.bold.red("⚠️  Process Failed With Error")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [chalk.underline("Error Message:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(5).args,
		["Some error from foo command"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(8).args, [chalk.underline("Stack Trace:")], "Correct error log");
	t.is(consoleLogStub.getCall(10).args.length, 1);
	t.true(consoleLogStub.getCall(10).args[0]
		.startsWith("Error: Some error from foo command"), "Correct error log");

	t.deepEqual(consoleLogStub.getCall(consoleLogStub.callCount - 2).args,
		[chalk.dim(
			`If you think this is an issue of the UI5 CLI, you might report it using the ` +
			`following URL: `) +
			chalk.dim.bold.underline(`https://github.com/UI5/cli/issues/new/choose`)],
		"Correct last log line");
});

test.serial("Unexpected error handling", async (t) => {
	const {consoleLogStub, consoleWriterStopStub} = t.context;

	const processExit = new Promise((resolve) => {
		const processExitStub = sinon.stub(process, "exit");
		processExitStub.callsFake((errorCode) => {
			processExitStub.restore();
			resolve(errorCode);
		});
	});

	const {default: base} = await import("../../../lib/cli/base.js");

	const cli = yargs();

	base(cli);

	const typeError = new TypeError("Cannot do this");

	cli.command({
		command: "foo",
		describe: "This task fails with a TypeError",
		handler: async function() {
			throw typeError;
		}
	});

	await t.throwsAsync(cli.parse(["foo"]), {
		is: typeError
	});

	const errorCode = await processExit;

	t.is(errorCode, 1, "Should exit with error code 1");
	t.is(consoleWriterStopStub.callCount, 0, "ConsoleWriter.stop did not get called");
	t.is(consoleLogStub.callCount, 14);
	t.deepEqual(consoleLogStub.getCall(1).args, [chalk.bold.red("⚠️  Process Failed With Error")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [chalk.underline("Error Message:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(5).args,
		["Cannot do this"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(8).args, [chalk.underline("Stack Trace:")], "Correct error log");
	t.is(consoleLogStub.getCall(10).args.length, 1);
	t.true(consoleLogStub.getCall(10).args[0]
		.startsWith("TypeError: Cannot do this"), "Correct error log");

	t.deepEqual(consoleLogStub.getCall(consoleLogStub.callCount - 2).args,
		[chalk.dim(
			`If you think this is an issue of the UI5 CLI, you might report it using the ` +
			`following URL: `) +
			chalk.dim.bold.underline(`https://github.com/UI5/cli/issues/new/choose`)],
		"Correct last log line");
});

test.serial("ui5 --no-update-notifier", async (t) => {
	const {stdout, failed} = await ui5(["versions", "--no-update-notifier"]);
	t.regex(stdout, /@ui5\/cli:/, "Output includes version information");
	t.false(failed, "Command should not fail");
});

test.serial("ui5 --output-style", async (t) => {
	await t.throwsAsync(ui5(["build", "--output-style", "nonExistent"]), {
		message: /Argument: output-style, Given: "Nonexistent", Choices: "Default", "Flat", "Namespace"/s
	}, "Coercion correctly capitalizes the first letter and makes the rest lowercase");


	// "--output-style" uses a coerce to transform the input into the correct letter case.
	// It is hard/unmaintainable to spy on internal implementation, so we check the output.
	// The coerce goes before the real ui5 build, so we just need to check whether
	// an invalid "--output-style" choice exception is not thrown.
	// Of course, the build would throw another exception, because there's nothing actually to build.
	await t.throwsAsync(ui5(["build", "--output-style", "flat"]), {
		message: /^((?!Argument: output-style, Given: "Flat).)*$/s
	}, "Does not throw an exception because of the --output-style input");

	await t.throwsAsync(ui5(["build", "--output-style", "nAmEsPaCe"]), {
		message: /^((?!Argument: output-style, Given: "Namespace).)*$/s
	}, "Does not throw an exception because of the --output-style input");

	await t.throwsAsync(ui5(["build", "--output-style", "Default"]), {
		message: /^((?!Argument: output-style, Given: "Default).)*$/s
	}, "Does not throw an exception because of the --output-style input");
});
