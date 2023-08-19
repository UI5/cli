import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import chalk from "chalk";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execa} from "execa";
import stripAnsi from "strip-ansi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.cjs");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

function getDefaultArgv() {
	// This has been taken from the actual argv object yargs provides
	return {
		"_": ["build"],
		"loglevel": "info",
		"log-level": "info",
		"logLevel": "info",
		"perf": false,
		"silent": false,
		"include-all-dependencies": false,
		"all": false,
		"a": false,
		"includeAllDependencies": false,
		"create-build-manifest": false,
		"createBuildManifest": false,
		"dest": "./dist",
		"clean-dest": false,
		"cleanDest": false,
		"experimental-css-variables": false,
		"experimentalCssVariables": false,
		"$0": "ui5"
	};
}

test.beforeEach(async (t) => {
	t.context.argv = getDefaultArgv();

	t.context.builder = sinon.stub().resolves();
	t.context.stdoutWriteStub = sinon.stub(process.stdout, "write");
	t.context.stderrWriteStub = sinon.stub(process.stderr, "write");
	t.context.configToJson = sinon.stub().returns({});

	const {default: Configuration} = await import( "@ui5/project/config/Configuration");
	t.context.Configuration = Configuration;
	sinon.stub(Configuration, "fromFile").resolves(new Configuration({}));
	sinon.stub(Configuration, "toFile").resolves();

	t.context.config = await esmock.p("../../../../lib/cli/commands/config.js", {
		"@ui5/project/config/Configuration": t.context.Configuration
	});
});

test.afterEach.always((t) => {
	sinon.restore();
	esmock.purge(t.context.config);
});

test.serial("ui5 config list", async (t) => {
	const {config, argv, stdoutWriteStub, stderrWriteStub, Configuration} = t.context;

	const configurationStub = new Configuration({});
	sinon.stub(configurationStub, "toJson").returns({
		mavenSnapshotEndpointUrl: "my/url",
		otherConfig: false,
		pony: 130,
		horses: null,
		cows: undefined // Won't be rendered
	});
	Configuration.fromFile.resolves(configurationStub);

	argv["_"] = ["list"];
	await config.handler(argv);

	t.is(stdoutWriteStub.firstCall.firstArg, `  mavenSnapshotEndpointUrl = my/url
  otherConfig = false
  pony = 130
  horses = null
`, "Logged expected text to stdout");
	t.is(stderrWriteStub.callCount, 0, "Nothing written to stderr");
});

test.serial("ui5 config list: No config", async (t) => {
	const {config, argv, stdoutWriteStub, stderrWriteStub} = t.context;

	argv["_"] = ["list"];
	await config.handler(argv);

	t.is(stdoutWriteStub.firstCall.firstArg, "",
		"Logged no text to stdout");
	t.is(stderrWriteStub.callCount, 0, "Nothing written to stderr");
});

test.serial("ui5 config get", async (t) => {
	const {config, argv, stdoutWriteStub, stderrWriteStub, Configuration} = t.context;

	Configuration.fromFile.resolves(new Configuration({
		mavenSnapshotEndpointUrl: "my/url"
	}));

	argv["_"] = ["get"];
	argv["option"] = "mavenSnapshotEndpointUrl";
	await config.handler(argv);

	t.is(stdoutWriteStub.firstCall.firstArg, "my/url\n",
		"Logged configuration value to stdout");
	t.is(stderrWriteStub.callCount, 0, "Nothing written to stderr");
});

test.serial("ui5 config get: Empty value", async (t) => {
	const {config, argv, stdoutWriteStub} = t.context;

	argv["_"] = ["get"];
	argv["option"] = "mavenSnapshotEndpointUrl";
	await config.handler(argv);

	t.is(stdoutWriteStub.firstCall.firstArg, "\n", "Logged no value to console");
});

test.serial("ui5 config set", async (t) => {
	const {config, argv, stderrWriteStub, stdoutWriteStub, Configuration} = t.context;

	const configurationStub = new Configuration({});
	sinon.stub(configurationStub, "toJson").returns({
		mavenSnapshotEndpointUrl: "my/url"
	});

	Configuration.fromFile.resolves(configurationStub);

	argv["_"] = ["set"];
	argv["option"] = "mavenSnapshotEndpointUrl";
	argv["value"] = "https://_snapshot_endpoint_";
	await config.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg,
		`Configuration option ${chalk.bold("mavenSnapshotEndpointUrl")} has been updated:
  mavenSnapshotEndpointUrl = https://_snapshot_endpoint_\n`,
		"Logged expected message to stderr");
	t.is(stdoutWriteStub.callCount, 0, "Nothing written to stdout");

	t.is(Configuration.toFile.callCount, 1, "Configuration#toFile got called once");
	t.is(Configuration.toFile.firstCall.firstArg.toJson().mavenSnapshotEndpointUrl,
		"https://_snapshot_endpoint_", "Configuration#toFile got called with expected argument");
});

test.serial("ui5 config set without a value should delete the configuration", async (t) => {
	const {config, argv, stderrWriteStub, stdoutWriteStub, Configuration} = t.context;

	argv["_"] = ["set"];
	argv["option"] = "mavenSnapshotEndpointUrl";
	argv["value"] = undefined; // Simulating no value parameter provided to Yargs
	await config.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg,
		`Configuration option ${chalk.bold("mavenSnapshotEndpointUrl")} has been unset\n`,
		"Logged expected message to stderr");
	t.is(stdoutWriteStub.callCount, 0, "Nothing written to stdout");

	t.is(Configuration.toFile.callCount, 1, "Configuration#toFile got called once");
	t.is(Configuration.toFile.firstCall.firstArg.toJson().mavenSnapshotEndpointUrl,
		undefined, "Configuration#toFile got called with expected argument");
});

test.serial("ui5 config set with an empty value should delete the configuration", async (t) => {
	const {config, argv, stderrWriteStub, stdoutWriteStub, Configuration} = t.context;

	argv["_"] = ["set"];
	argv["option"] = "mavenSnapshotEndpointUrl";
	argv["value"] = ""; // Simulating empty value provided to Yargs using quotes ""
	await config.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg,
		`Configuration option ${chalk.bold("mavenSnapshotEndpointUrl")} has been unset\n`,
		"Logged expected message to stderr");
	t.is(stdoutWriteStub.callCount, 0, "Nothing written to stdout");

	t.is(Configuration.toFile.callCount, 1, "Configuration#toFile got called once");
	t.is(Configuration.toFile.firstCall.firstArg.toJson().mavenSnapshotEndpointUrl,
		undefined, "Configuration#toFile got called with expected argument");
});

test.serial("ui5 config set null should update the configuration", async (t) => {
	const {config, argv, stderrWriteStub, stdoutWriteStub, Configuration} = t.context;

	argv["_"] = ["set"];
	argv["option"] = "mavenSnapshotEndpointUrl";

	// Yargs would never provide us with other types than string. Still, our code should
	// check for empty strings and nothing else (like falsy)
	argv["value"] = 0;
	await config.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg,
		`Configuration option ${chalk.bold("mavenSnapshotEndpointUrl")} has been updated:
  mavenSnapshotEndpointUrl = 0\n`,
		"Logged expected message to stderr");
	t.is(stdoutWriteStub.callCount, 0, "Nothing written to stdout");

	t.is(Configuration.toFile.callCount, 1, "Configuration#toFile got called once");
	t.is(Configuration.toFile.firstCall.firstArg.toJson().mavenSnapshotEndpointUrl,
		0, "Configuration#toFile got called with expected argument");
});

test.serial("ui5 config set false should update the configuration", async (t) => {
	const {config, argv, stderrWriteStub, stdoutWriteStub, Configuration} = t.context;

	argv["_"] = ["set"];
	argv["option"] = "mavenSnapshotEndpointUrl";

	// Yargs would never provide us with other types than string. Still, our code should
	// check for empty strings and nothing else (like falsyness)
	argv["value"] = false;
	await config.handler(argv);

	t.is(stderrWriteStub.firstCall.firstArg,
		`Configuration option ${chalk.bold("mavenSnapshotEndpointUrl")} has been updated:
  mavenSnapshotEndpointUrl = false\n`,
		"Logged expected message to stderr");
	t.is(stdoutWriteStub.callCount, 0, "Nothing written to stdout");

	t.is(Configuration.toFile.callCount, 1, "Configuration#toFile got called once");
	t.is(Configuration.toFile.firstCall.firstArg.toJson().mavenSnapshotEndpointUrl,
		false, "Configuration#toFile got called with expected argument");
});

test.serial("ui5 config invalid option", async (t) => {
	await t.throwsAsync(ui5(["config", "set", "_invalid_key_", "https://_snapshot_endpoint_"]), {
		message: ($) => {
			return $.includes("Command failed with exit code 1") &&
				$.includes("Invalid values") &&
				$.includes(`Given: "_invalid_key_", Choices: "`);
		}
	});
});

test.serial("ui5 config empty option", async (t) => {
	await t.throwsAsync(ui5(["config", "set"]), {
		message: ($) => stripAnsi($) ===
			`Command failed with exit code 1: ${ui5Cli} config set
Command Failed:
Not enough non-option arguments: got 0, need at least 1

See 'ui5 --help'`
	});
});

test.serial("ui5 config unknown command", async (t) => {
	await t.throwsAsync(ui5(["config", "foo"]), {
		message: ($) => stripAnsi($) ===
			`Command failed with exit code 1: ${ui5Cli} config foo
Command Failed:
Unknown argument: foo

See 'ui5 --help'`
	});
});
