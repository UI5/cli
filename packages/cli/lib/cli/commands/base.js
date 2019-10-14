const cli = require("yargs");

cli.usage("Usage: ui5 <command> [options]")
	.demandCommand(1, "Command required! Please have a look at the help documentation above.")
	.option("config", {
		describe: "Path to configuration file",
		type: "string"
	})
	.option("translator", {
		describe: "Translator to use. Including optional colon separated translator parameters.",
		alias: "t8r",
		default: "npm",
		type: "string"
	})
	.option("verbose", {
		describe: "Enable verbose logging.",
		type: "boolean"
	})
	.option("loglevel", {
		alias: "log-level",
		describe: "Set the logging level (error|warn|info|verbose|silly).",
		default: "info",
		type: "string"
	})
	.showHelpOnFail(true)
	.strict(true)
	.alias("help", "h")
	.alias("version", "v")
	.example("ui5 <command> --translator static:/path/to/projectDependencies.yaml",
		"Execute command using a \"static\" translator with translator parameters")
	.example("ui5 <command> --config /path/to/ui5.yaml",
		"Execute command using a project configuration from custom path")
	.fail(function(msg, err, yargs) {
		const chalk = require("chalk");
		if (err) {
			// Exception
			const logger = require("@ui5/logger");
			if (logger.isLevelEnabled("error")) {
				console.log("");
				console.log(chalk.bold.red("⚠️  Process Failed With Error"));

				console.log("");
				console.log(chalk.underline("Error Message:"));
				console.log(err.message);

				if (logger.isLevelEnabled("verbose")) {
					console.log("");
					console.log(chalk.underline("Stack Trace:"));
					console.log(err.stack);

					// Try to guess responsible module from stack trace file paths
					// This should work for the following paths:
					// - @ui5/cli (npm consumption)
					// - ui5-cli (local repository consumption)
					// - lib/cli (local consumption without repository name in path, i.e. Azure CI)
					const moduleRegExp = /@?(?:ui5|lib).(?:logger|fs|builder|server|project|cli)/ig;

					// Only check the lowest stack entry
					const rootStackEntry = err.stack.split("\n")[1];
					const match = rootStackEntry.match(moduleRegExp);
					if (match) {
						// Use the last match of the line because of cases like this:
						//	node_modules/@ui5/cli/node_modules/@ui5/builder/lib/ => should match the builder
						let moduleNameGuess = match[match.length - 1];

						// Normalize match
						moduleNameGuess = moduleNameGuess.replace(/.*(?:ui5|lib).(.*)/i, "ui5-$1").toLowerCase();
						const newIssueUrl = `https://github.com/SAP/${moduleNameGuess}/issues/new`;
						console.log("");
						console.log(
							chalk.dim(
								`If you think this is an issue of the UI5 Tooling, you might report it using the ` +
								`following URL: `) +
							chalk.dim.bold.underline(newIssueUrl));
					}
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
			console.log(chalk.dim(`See 'ui5 --help' or 'ui5 build --help' for help`));
		}
		process.exit(1);
	});
