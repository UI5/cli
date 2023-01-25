import {setLogLevel, isLogLevelEnabled, getLogger} from "@ui5/logger";
import ConsoleWriter from "@ui5/logger/writers/Console";
import {getVersion} from "../version.js";
/**
 * Logger middleware to enable logging capabilities
 *
 * @param {object} argv logger arguments
 */
export async function initLogger(argv) {
	if (argv.loglevel && argv.loglevel !== "info") {
		// argv.loglevel defaults to "info", which is anyways already the Logger's default
		// Therefore do not explicitly set it again in order to allow overwriting the log level
		// using the UI5_LOG_LVL environment variable
		setLogLevel(argv.loglevel);
	}
	if (argv.perf) {
		setLogLevel("perf");
	}
	if (argv.verbose) {
		setLogLevel("verbose");
	}
	if (argv.silent) {
		// Silent should overrule any other log-level related CLI flags
		setLogLevel("silent");
	}

	// Initialize writer
	ConsoleWriter.init();
	if (isLogLevelEnabled("verbose")) {
		const log = getLogger("cli:middlewares:base");
		log.verbose(`using @ui5/cli version ${getVersion()}`);
		log.verbose(`using node version ${process.version}`);
	}
}
