import chalk from "chalk";
import figures from "figures";

// Shared content for the "accepting remote connections" warning, rendered
// both by the interactive writer's server region and by Console.js's non-TTY
// fallback. Each entry is a fully chalk-formatted string; consumers just
// print them line by line.
export const REMOTE_CONNECTIONS_WARNING_LINES = Object.freeze([
	chalk.bold.yellow(
		`${figures.warning} This server is accepting connections from all hosts on your network`),
	chalk.dim.underline("Please Note:"),
	chalk.dim(`${figures.pointerSmall} `) +
		chalk.dim.bold("This server is intended for development purposes only. Do not use it in production."),
	chalk.dim(`${figures.pointerSmall} ` +
		"Vulnerable (custom-)middleware can pose a threat to your system when exposed to the network."),
	chalk.dim(`${figures.pointerSmall} ` +
		"The use of proxy-middleware with preconfigured credentials might enable unauthorized access"),
	chalk.dim("  to a target system for third parties on your network."),
]);
