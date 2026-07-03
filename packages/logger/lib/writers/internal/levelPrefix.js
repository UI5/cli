import {chalkStderr as chalk} from "chalk";

// Shared level-prefix renderer used by every console-writing writer so scrolled
// log lines look identical regardless of which writer produced them. Kept as
// an internal helper module rather than a public export — the exact styling is
// an implementation detail of `writers/Console` and its siblings.
export function getLevelPrefix(level) {
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
		throw new Error(`writers/internal/levelPrefix: Invalid message log level "${level}"`);
	}
}
