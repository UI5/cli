import {chalkStderr as chalk} from "chalk";

// Shared message-formatting helpers used by every console-writing writer so
// scrolled log lines look identical regardless of which writer produced them.
// Kept as an internal helper module rather than a public export — the exact
// styling is an implementation detail of `writers/Console` and its siblings.

function getLevelPrefix(level) {
	switch (level) {
	case "silly":
		return chalk.inverse(level);
	case "verbose":
		return chalk.cyan("verb");
	case "perf":
		return chalk.bgYellow.red(level);
	case "info":
		return chalk.green(level);
	case "warn":
		return chalk.yellow(level);
	case "error":
		return chalk.bgRed.white(level);
	default:
		// Log level silent does not produce messages
		throw new Error(`writers/internal/format: Invalid message log level "${level}"`);
	}
}

// Prepend the blue module name to a message when one is present. Both console
// writers render log messages as "<moduleName> <message>", omitting the module
// name when it is absent.
export function prefixModuleName(message, moduleName) {
	return moduleName ? `${chalk.blue(moduleName)} ${message}` : message;
}

// Render a full log line as "<levelPrefix> <message>". The trailing newline is
// left to the caller: `writers/Console` writes straight to the stream and needs
// it, while `writers/InteractiveConsole` hands the line to log-update, which
// adds its own.
export function formatLogLine(level, message) {
	return `${getLevelPrefix(level)} ${message}`;
}
