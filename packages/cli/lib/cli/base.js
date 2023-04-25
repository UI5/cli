import chalk from "chalk";
import {isLogLevelEnabled} from "@ui5/logger";
import ConsoleWriter from "@ui5/logger/writers/Console";

export default function(cli) {
	cli.usage("Usage: ui5 <command> [options]")
		.demandCommand(1, "Command required")
		.option("config", {
			alias: "c",
			describe: "Path to project configuration file in YAML format",
			type: "string"
		})
		.option("dependency-definition", {
			describe: "Path to a YAML file containing the project's dependency tree. " +
		"This option will disable resolution of node package dependencies.",
			type: "string"
		})
		.option("workspace-config", {
			describe: "Path to workspace configuration file in YAML format",
			type: "string"
		})
		.option("workspace", {
			alias: "w",
			describe: "Name of the workspace configuration to use",
			default: "default",
			type: "string"
		})
		.option("loglevel", {
			alias: "log-level",
			describe: "Set the logging level (silent|error|warn|info|perf|verbose|silly).",
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
		.coerce([
			// base.js
			"config", "dependency-definition", "workspace-config", "workspace", "log-level",

			// tree.js, build.js & serve.js
			"framework-version",

			// build.js
			"dest",

			// serve.js
			"open", "port", "key", "cert",
		], (arg) => {
			// If an option is specified multiple times, yargs creates an array for all the values,
			// independently of whether the option is of type "array" or "string".
			// This is unexpected for options listed above, which should all only have only one definitive value.
			// The yargs behavior could be disabled by using the parserConfiguration "duplicate-arguments-array": true
			// However, yargs would then cease to create arrays for those options where we *do* expect the
			// automatic creation of arrays in case the option is specified multiple times. Like "--include-task".
			// Also see https://github.com/yargs/yargs/issues/1318
			// Note: This is not necessary for options of type "boolean"
			if (Array.isArray(arg)) {
				// If the option is specified multiple times, use the value of the last option
				return arg[arg.length - 1];
			}
			return arg;
		})
		.showHelpOnFail(true)
		.strict(true)
		.alias("help", "h")
		.alias("version", "v")
		.example("ui5 <command> --dependency-definition /path/to/projectDependencies.yaml",
			"Execute command using a static dependency tree instead of resolving node package dependencies")
		.example("ui5 <command> --config /path/to/ui5.yaml",
			"Execute command using a project configuration from custom path")
		.example("ui5 <command> --workspace dolphin",
			"Execute command using the 'dolphin' workspace of a ui5-workspace.yaml")
		.example("ui5 <command> --log-level silly",
			"Execute command with the maximum log output")
		.fail(function(msg, err, yargs) {
			if (err) {
				ConsoleWriter.stop();
				// Exception
				if (isLogLevelEnabled("error")) {
					console.log("");
					console.log(chalk.bold.red("⚠️  Process Failed With Error"));

					console.log("");
					console.log(chalk.underline("Error Message:"));
					console.log(err.message);

					// Unexpected errors should always be logged with stack trace
					const unexpectedErrors = ["SyntaxError", "ReferenceError", "TypeError"];
					if (unexpectedErrors.includes(err.name) || isLogLevelEnabled("verbose")) {
						console.log("");
						console.log(chalk.underline("Stack Trace:"));
						console.log(err.stack);
						console.log("");
						console.log(
							chalk.dim(
								`If you think this is an issue of the UI5 Tooling, you might report it using the ` +
								`following URL: `) +
								chalk.dim.bold.underline(`https://github.com/SAP/ui5-tooling/issues/new/choose`));
					} else {
						console.log("");
						console.log(chalk.dim(
							`For details, execute the same command again with an additional '--verbose' parameter`));
					}
				}
			} else {
				// Yargs error
				console.log(chalk.bold.yellow("Command Failed:"));
				console.log(`${msg}`);
				console.log("");
				console.log(chalk.dim(`See 'ui5 --help'`));
			}
			process.exit(1);
		});
}

