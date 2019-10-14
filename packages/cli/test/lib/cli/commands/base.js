const test = require("ava");
const path = require("path");
const execa = require("execa");
const pkg = require("../../../../package.json");
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.js");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test("ui5 --version", async (t) => {
	const {stdout} = await ui5(["--version"]);
	t.is(stdout, `${pkg.version} (from ${ui5Cli})`);
});

test("ui5 -v", async (t) => {
	const {stdout} = await ui5(["-v"]);
	t.is(stdout, `${pkg.version} (from ${ui5Cli})`);
});

test("Yargs error handling", async (t) => {
	const err = await t.throwsAsync(ui5(["invalidcomands"]));

	const stdoutLines = err.stdout.split("\n");
	t.deepEqual(stdoutLines[0], "Command Failed:", "Correct first log line");
	// Error message itself originates from yargs and is therefore not asserted
	t.deepEqual(stdoutLines[stdoutLines.length - 1], `See 'ui5 --help' or 'ui5 build --help' for help`,
		"Correct last log line");

	t.deepEqual(err.exitCode, 1, "Process was exited with code 1");
});

test("Exception error handling", async (t) => {
	// This test depends on the init command throwing on projects that already have a ui5.yaml

	const err = await t.throwsAsync(ui5(["init"], {
		cwd: path.join(__dirname, "..", "..", "..", "fixtures", "init", "application")
	}));

	const stdoutLines = err.stdout.split("\n");
	t.deepEqual(stdoutLines[1], "⚠️  Process Failed With Error", "Correct error log");
	t.deepEqual(stdoutLines[3], "Error Message:", "Correct error log");
	t.deepEqual(stdoutLines[4], "Initialization not possible: ui5.yaml already exists", "Correct error log");
	t.deepEqual(stdoutLines[stdoutLines.length - 1],
		"For details, execute the same command again with an additional '--verbose' parameter",
		"Correct last log line");

	t.deepEqual(err.exitCode, 1, "Process was exited with code 1");
});


test("Exception error handling with verbose logging", async (t) => {
	// This test depends on the init command throwing on projects that already have a ui5.yaml

	const err = await t.throwsAsync(ui5(["init", "--verbose"], {
		cwd: path.join(__dirname, "..", "..", "..", "fixtures", "init", "application")
	}));

	const stdoutLines = err.stdout.split("\n");
	t.deepEqual(stdoutLines[1], "⚠️  Process Failed With Error", "Correct error log");
	t.deepEqual(stdoutLines[3], "Error Message:", "Correct error log");
	t.deepEqual(stdoutLines[4], "Initialization not possible: ui5.yaml already exists", "Correct error log");
	t.deepEqual(stdoutLines[6], "Stack Trace:", "Correct error log");
	t.deepEqual(stdoutLines[7], "Error: Initialization not possible: ui5.yaml already exists", "Correct error log");

	t.deepEqual(stdoutLines[stdoutLines.length - 1],
		"If you think this is an issue of the UI5 Tooling, you might " +
		"report it using the following URL: https://github.com/SAP/ui5-cli/issues/new",
		"Correct last log line");

	t.deepEqual(err.exitCode, 1, "Process was exited with code 1");
});
