import test from "ava";
import sinon from "sinon";
import {initLogger} from "../../../../lib/cli/middlewares/logger.js";
import logger from "@ui5/logger";

test.serial("sets log level of log middleware", async (t) => {
	sinon.stub(logger, "setLevel");
	await initLogger({loglevel: 1});
	t.is(logger.setLevel.getCall(0).args[0], 1, "sets log level to 1");
	logger.setLevel.restore();
});

test.serial("disable middleware if invalig arguments are given", async (t) => {
	const usedMiddleware = (await initLogger({})) === null;
	t.is(usedMiddleware, true, "Logger is not used as middleware");
});

test.serial("retrieves logger middleware if verbose or loglevel are set", async (t) => {
	const loggerInstance = await initLogger({verbose: true});
	t.deepEqual(Object.keys(loggerInstance), Object.keys(logger), "Logger is used as middleware");
});

import path from "node:path";
import execa from "execa";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";

const pkgJsonPath = new URL("../../../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgJsonPath));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.js");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test("ui5 --verbose", async (t) => {
	// Using "versions" as a command, as the --verbose flag can't be used standalone
	const {stderr} = await ui5(["versions", "--verbose"]);
	t.is(stderr,
		`verb cli:middlewares:base using @ui5/cli version ${pkg.version} (from ${ui5Cli})\n`+
		`verb cli:middlewares:base using node version ${process.version}`);
});
