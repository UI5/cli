/**
 * Logger middleware used as one of default middlewares by tooling
 *
 * @param {object} argv logger arguments
 * @returns {object} logger instance or null
 */
function init(argv) {
	if (!argv.verbose && !argv.loglevel) return null;

	const logger = require("@ui5/logger");
	if (argv.loglevel) {
		logger.setLevel(argv.loglevel);
	}
	if (argv.verbose) {
		logger.setLevel("verbose");
		const version = require("../version").get();
		logger.getLogger("cli:middlewares:base").verbose(`using @ui5/cli version ${version}`);
		logger.getLogger("cli:middlewares:base").verbose(`using node version ${process.version}`);
	}
	return logger;
}

module.exports = {init};
