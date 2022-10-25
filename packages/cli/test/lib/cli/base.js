import test from "ava";
import path from "node:path";
import execa from "execa";
import sinon from "sinon";
import esmock from "esmock";
import chalk from "chalk";
import yargs from "yargs";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";

const pkgJsonPath = new URL("../../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgJsonPath));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ui5Cli = path.join(__dirname, "..", "..", "..", "bin", "ui5.js");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test.beforeEach(async (t) => {
	t.context.consoleLogStub = sinon.stub(console, "log");

	t.context.loggerIsLevelEnabled = sinon.stub();
	t.context.loggerIsLevelEnabled.withArgs("error").returns(true);
	t.context.loggerIsLevelEnabled.withArgs("verbose").returns(false);

	t.context.base = await esmock("../../../lib/cli/base.js", {
		"@ui5/logger": {
			isLevelEnabled: t.context.loggerIsLevelEnabled
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

test.serial("Yargs error handling", async (t) => {
	const {consoleLogStub} = t.context;

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
	t.is(consoleLogStub.callCount, 4);
	t.deepEqual(consoleLogStub.getCall(0).args, [chalk.bold.yellow("Command Failed:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(1).args, ["Unknown argument: invalid"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(2).args, [""], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [
		chalk.dim(`See 'ui5 --help' or 'ui5 build --help' for help`)
	], "Correct error log");
});


test.serial("Exception error handling", async (t) => {
	const {base, consoleLogStub} = t.context;

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
	t.is(consoleLogStub.callCount, 7);
	t.deepEqual(consoleLogStub.getCall(1).args, [chalk.bold.red("⚠️  Process Failed With Error")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [chalk.underline("Error Message:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(4).args,
		["Some error from foo command"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(6).args, [chalk.dim(
		`For details, execute the same command again with an additional '--verbose' parameter`)], "Correct error log");
});

test.serial("Exception error handling without logging (silent)", async (t) => {
	const {base, consoleLogStub, loggerIsLevelEnabled} = t.context;

	loggerIsLevelEnabled.withArgs("error").returns(false);

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
	t.is(consoleLogStub.callCount, 0);
});

test.serial("Exception error handling with verbose logging", async (t) => {
	const {base, consoleLogStub, loggerIsLevelEnabled} = t.context;

	loggerIsLevelEnabled.withArgs("verbose").returns(true);

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
	t.is(consoleLogStub.callCount, 10);
	t.deepEqual(consoleLogStub.getCall(1).args, [chalk.bold.red("⚠️  Process Failed With Error")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [chalk.underline("Error Message:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(4).args,
		["Some error from foo command"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(6).args, [chalk.underline("Stack Trace:")], "Correct error log");
	t.is(consoleLogStub.getCall(7).args.length, 1);
	t.true(consoleLogStub.getCall(7).args[0]
		.startsWith("Error: Some error from foo command"), "Correct error log");

	t.deepEqual(consoleLogStub.getCall(consoleLogStub.callCount - 1).args,
		[chalk.dim(
			`If you think this is an issue of the UI5 Tooling, you might report it using the ` +
			`following URL: `) +
			chalk.dim.bold.underline(`https://github.com/SAP/ui5-tooling/issues/new/choose`)],
		"Correct last log line");
});

test.serial("Unexpected error handling", async (t) => {
	const {consoleLogStub} = t.context;

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
	t.is(consoleLogStub.callCount, 10);
	t.deepEqual(consoleLogStub.getCall(1).args, [chalk.bold.red("⚠️  Process Failed With Error")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(3).args, [chalk.underline("Error Message:")], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(4).args,
		["Cannot do this"], "Correct error log");
	t.deepEqual(consoleLogStub.getCall(6).args, [chalk.underline("Stack Trace:")], "Correct error log");
	t.is(consoleLogStub.getCall(7).args.length, 1);
	t.true(consoleLogStub.getCall(7).args[0]
		.startsWith("TypeError: Cannot do this"), "Correct error log");

	t.deepEqual(consoleLogStub.getCall(consoleLogStub.callCount - 1).args,
		[chalk.dim(
			`If you think this is an issue of the UI5 Tooling, you might report it using the ` +
			`following URL: `) +
			chalk.dim.bold.underline(`https://github.com/SAP/ui5-tooling/issues/new/choose`)],
		"Correct last log line");
});

test.serial("ui5 --no-update-notifier", async (t) => {
	const {stdout, failed} = await ui5(["versions", "--no-update-notifier"]);
	t.regex(stdout, /@ui5\/cli:/, "Output includes version information");
	t.false(failed, "Command should not fail");
});
