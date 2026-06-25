import chalk from "chalk";
import {isLogLevelEnabled} from "@ui5/logger";
import ConsoleWriter from "@ui5/logger/writers/Console";
import {dedupeArray} from "./options.js";

export default function(cli) {
	cli.usage("Usage: ui5 <command> [options]")
		.demandCommand(1, "Command required")
		.option("loglevel", {
			alias: "log-level",
			describe: "Set the logging level",
			default: "info",
			type: "string",
			choices: ["silent", "error", "warn", "info", "perf", "verbose", "silly"]
		})
		.option("verbose", {
			describe: "Enable verbose logging.",
			default: false,
			type: "boolean"
		})
		.option("perf", {
			describe: "Enable performance measurements and related logging.",
			default: false,
			type: "boolean"
		})
		.option("silent", {
			describe: "Disable all log output.",
			default: false,
			type: "boolean"
		})
		.coerce(["log-level"], dedupeArray)
		.showHelpOnFail(true)
		.strict(true)
		.alias("help", "h")
		.alias("version", "v")
		.example("ui5 <command> --log-level silly",
			"Execute command with the maximum log output")
		.fail(function(msg, err, yargs) {
			if (err) {
				ConsoleWriter.stop();
				// Exception
				if (isLogLevelEnabled("error")) {
					process.stderr.write("\n");
					process.stderr.write(chalk.bold.red("⚠️  Process Failed With Error"));

					process.stderr.write("\n\n");
					process.stderr.write(chalk.underline("Error Message:"));
					process.stderr.write("\n");
					process.stderr.write(err.message);
					process.stderr.write("\n");

					// Unexpected errors should always be logged with stack trace
					const unexpectedErrors = ["SyntaxError", "ReferenceError", "TypeError"];
					if (unexpectedErrors.includes(err.name) || isLogLevelEnabled("verbose")) {
						process.stderr.write("\n\n");
						process.stderr.write(chalk.underline("Stack Trace:"));
						process.stderr.write("\n");
						process.stderr.write(err.stack);
						process.stderr.write("\n");
						if (err.cause instanceof Error && err.cause.stack) {
							process.stderr.write(chalk.underline("Error Cause Stack Trace:\n"));
							process.stderr.write(err.cause.stack + "\n");
							process.stderr.write("\n");
						}
						process.stderr.write(
							chalk.dim(
								`If you think this is an issue of the UI5 CLI, you might report it using the ` +
								`following URL: `) +
								chalk.dim.bold.underline(`https://github.com/UI5/cli/issues/new/choose`));
						process.stderr.write("\n");
					} else {
						process.stderr.write("\n\n");
						process.stderr.write(chalk.dim(
							`For details, execute the same command again with an additional '--verbose' parameter`));
						process.stderr.write("\n");
					}
				}
			} else {
				// Yargs error
				process.stderr.write(chalk.bold.yellow("Command Failed:"));
				process.stderr.write("\n");
				process.stderr.write(`${msg}`);
				process.stderr.write("\n\n");
				process.stderr.write(chalk.dim(`See 'ui5 --help'`));
				process.stderr.write("\n");
			}
			process.exit(1);
		});
}

