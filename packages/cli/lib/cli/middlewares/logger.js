import {setLogLevel, getLogger} from "@ui5/logger";
import ConsoleWriter from "@ui5/logger/writers/Console";
import {getVersion} from "../version.js";
/**
 * Logger middleware to enable logging capabilities
 *
 * @param {object} argv logger arguments
 */
export async function initLogger(argv) {
	ConsoleWriter.init();

	if (argv.loglevel) {
		setLogLevel(argv.loglevel);
	}
	if (argv.verbose) {
		setLogLevel("verbose");
		const log = getLogger("cli:middlewares:base");
		log.verbose(`using @ui5/cli version ${getVersion()}`);
		log.verbose(`using node version ${process.version}`);
	}
}
