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
		"Execute command using a project configuration from custom path");
