import test from "ava";
import sinon from "sinon";
import stripAnsi from "strip-ansi";
import {initLogger} from "../../../../lib/cli/middlewares/logger.js";
import logger from "@ui5/logger";

test.serial("init logger", async (t) => {
	sinon.stub(logger, "setLevel");
	await initLogger({});
	t.is(logger.setLevel.callCount, 0, "setLevel has not been called");
	logger.setLevel.restore();
});

test.serial("With log-level flag", async (t) => {
	sinon.stub(logger, "setLevel");
	await initLogger({loglevel: "silly"});
	t.is(logger.setLevel.callCount, 1, "setLevel has been called once");
	t.is(logger.setLevel.getCall(0).args[0], "silly", "sets log level to verbose");
	logger.setLevel.restore();
});

test.serial("With log-level and verbose flag", async (t) => {
	sinon.stub(logger, "setLevel");
	await initLogger({loglevel: "silly", verbose: true});
	t.is(logger.setLevel.callCount, 2, "setLevel has been called twice");
	t.is(logger.setLevel.getCall(0).args[0], "silly", "sets log level to verbose");
	t.is(logger.setLevel.getCall(1).args[0], "verbose", "sets log level to verbose");
	logger.setLevel.restore();
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
