const test = require("ava");
const sinon = require("sinon");
const loggerMiddleware = require("../../../../lib/cli/middlewares/logger");
const logger = require("@ui5/logger");

test.serial("sets log level of log middleware", (t) => {
	sinon.stub(logger, "setLevel");
	loggerMiddleware.init({loglevel: 1});
	t.is(logger.setLevel.getCall(0).args[0], 1, "sets log level to 1");
	logger.setLevel.restore();
});

test.serial("disable middleware if invalig arguments are given", (t) => {
	const usedMiddleware = loggerMiddleware.init({}) === null;
	t.is(usedMiddleware, true, "Logger is not used as middleware");
});

test.serial("retrieves logger middleware if verbose or loglevel are set", (t) => {
	const loggerInstance = loggerMiddleware.init({verbose: true});
	t.deepEqual(Object.keys(loggerInstance), Object.keys(logger), "Logger is used as middleware");
});

const path = require("path");
const execa = require("execa");
const pkg = require("../../../../package.json");
const ui5Cli = path.join(__dirname, "..", "..", "..", "..", "bin", "ui5.js");
const ui5 = (args, options = {}) => execa(ui5Cli, args, options);

test("ui5 --verbose", async (t) => {
	// Using "versions" as a command, as the --verbose flag can't be used standalone
	const {stderr} = await ui5(["versions", "--verbose"]);
	t.is(stderr,
		`verb cli:middlewares:base using @ui5/cli version ${pkg.version} (from ${ui5Cli})\n`+
		`verb cli:middlewares:base using node version ${process.version}`);
});
