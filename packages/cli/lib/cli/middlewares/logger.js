
import {getVersion} from "../version.js";
/**
 * Logger middleware used as one of default middlewares by tooling
 *
 * @param {object} argv logger arguments
 * @returns {object} logger instance or null
 */
export async function initLogger(argv) {
	if (!argv.verbose && !argv.loglevel) return null;

	const {default: logger} = await import("@ui5/logger");
	if (argv.loglevel) {
		logger.setLevel(argv.loglevel);
	}
	if (argv.verbose) {
		logger.setLevel("verbose");
		logger.getLogger("cli:middlewares:base").verbose(`using @ui5/cli version ${getVersion()}`);
		logger.getLogger("cli:middlewares:base").verbose(`using node version ${process.version}`);
	}
	return logger;
}
