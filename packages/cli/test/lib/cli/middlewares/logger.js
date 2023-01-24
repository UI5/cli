import test from "ava";
import sinon from "sinon";
import esmock from "esmock";
import stripAnsi from "strip-ansi";

test.beforeEach(async (t) => {
	t.context.verboseLogStub = sinon.stub();
	t.context.setLogLevelStub = sinon.stub();
	t.context.logger = await esmock("../../../../lib/cli/middlewares/logger.js", {
		"@ui5/logger": {
			getLogger: () => ({
				verbose: t.context.verboseLogStub,
			}),
			setLogLevel: t.context.setLogLevelStub,
		}
	});
});

test.serial("init logger", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({});
	t.is(setLogLevelStub.callCount, 0, "setLevel has not been called");
});

test.serial("With log-level flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({loglevel: "silly"});
	t.is(setLogLevelStub.callCount, 1, "setLevel has been called once");
	t.is(setLogLevelStub.getCall(0).args[0], "silly", "sets log level to verbose");
});

test.serial("With log-level and verbose flag", async (t) => {
	const {logger, setLogLevelStub} = t.context;
	await logger.initLogger({loglevel: "silly", verbose: true});
	t.is(setLogLevelStub.callCount, 2, "setLevel has been called twice");
	t.is(setLogLevelStub.getCall(0).args[0], "silly", "sets log level to verbose");
	t.is(setLogLevelStub.getCall(1).args[0], "verbose", "sets log level to verbose");
});

import path from "node:path";
import {execa} from "execa";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";

const pkgJsonPath = new URL("../../../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgJsonPath));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.cjs");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test("ui5 --verbose", async (t) => {
	// Using "versions" as a command, as the --verbose flag can't be used standalone
	const {stderr} = await ui5(["versions", "--verbose"]);
	t.is(stripAnsi(stderr),
		`verb cli:middlewares:base using @ui5/cli version ${pkg.version} (from ${ui5Cli})\n`+
		`verb cli:middlewares:base using node version ${process.version}`);
});
