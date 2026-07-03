import process from "node:process";
import {setLogLevel, isLogLevelEnabled, getLogger, getLogLevel} from "@ui5/logger";
import ConsoleWriter from "@ui5/logger/writers/Console";
import {getVersion, getVersionWithLocation} from "../version.js";

// Log levels that the interactive writer cannot represent (firehose verbose
// logging, or user-requested silence). Fall back to the plain Console writer
// in those cases.
const NON_INTERACTIVE_LEVELS = new Set(["perf", "verbose", "silly", "silent"]);

/**
 * Logger middleware to enable logging capabilities
 *
 * @param {object} argv logger arguments
 */
export async function initLogger(argv) {
	if (argv.silent) {
		setLogLevel("silent");
	}
	if (argv.perf) {
		setLogLevel("perf");
	}
	if (argv.verbose) {
		setLogLevel("verbose");
	}
	if (argv.loglevel && argv.loglevel !== "info") {
		// argv.loglevel defaults to "info", which is anyways already the Logger's default
		// Therefore do not explicitly set it again in order to allow overwriting the log level
		// using the UI5_LOG_LVL environment variable
		setLogLevel(argv.loglevel);
	}

	const commandName = Array.isArray(argv._) ? argv._[0] : null;
	const useInteractive =
		commandName === "serve" &&
		process.stderr.isTTY === true &&
		!NON_INTERACTIVE_LEVELS.has(getLogLevel()) &&
		!process.env.UI5_CLI_NO_INTERACTIVE;

	if (useInteractive) {
		const {default: InteractiveConsole} = await import("@ui5/logger/writers/InteractiveConsole");
		InteractiveConsole.init();
	} else {
		ConsoleWriter.init();
	}

	// Announce the CLI as soon as a writer is attached, so its header region
	// (or scrollback line) shows the tool identity before any command work
	// starts.
	process.emit("ui5.tool-info", {
		name: "UI5 CLI",
		version: getVersion() || "",
	});

	if (isLogLevelEnabled("verbose")) {
		const log = getLogger("cli:middlewares:base");
		log.verbose(`using @ui5/cli version ${getVersionWithLocation()}`);
		log.verbose(`using node version ${process.version}`);
	}
}
