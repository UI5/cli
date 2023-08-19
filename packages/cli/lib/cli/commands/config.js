import chalk from "chalk";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import Configuration from "@ui5/project/config/Configuration";

const configCommand = {
	command: "config",
	describe: "Get and set UI5 Tooling configuration options",
	middlewares: [baseMiddleware],
	handler: handleConfig
};

configCommand.builder = function(cli) {
	return cli
		.demandCommand(1, "Command required. Available commands are 'set', 'get', and 'list'")
		.command("set <option> [value]", "Set the value for a given configuration option. " +
			"Clear an existing configuration by omitting the value", {
			handler: handleConfig,
			builder: (cli) => {
				cli.positional("option", {
					choices: Configuration.OPTIONS
				});
			},
			middlewares: [baseMiddleware],
		})
		.command("get <option>", "Get the value for a given configuration option", {
			handler: handleConfig,
			builder: noop,
			middlewares: [baseMiddleware],
		})
		.command("list", "Display the current configuration", {
			handler: handleConfig,
			builder: noop,
			middlewares: [baseMiddleware],
		})
		.example("$0 config set ui5DataDir /path/to/.ui5",
			"Set a value for the ui5DataDir configuration")
		.example("$0 config set ui5DataDir",
			"Unset the current value of the ui5DataDir configuration");
};

function noop() {}

async function handleConfig(argv) {
	const {_: commandArgs, option, value} = argv;
	const command = commandArgs[commandArgs.length - 1];

	// Yargs ensures that:
	// - "option" only contains valid values (defined as "choices" in command builder)
	// - "command" is one of "list", "get", "set"

	const config = await Configuration.fromFile();
	let jsonConfig;

	switch (command) {
	case "list":
		// Print all configuration values to stdout
		process.stdout.write(formatJsonForOutput(config.toJson()));
		break;
	case "get":
		// Get a single configuration value and print to stdout
		process.stdout.write(`${config.toJson()[option] ?? ""}\n`);
		break;
	case "set":
		jsonConfig = config.toJson();
		if (value === undefined || value === "") {
			delete jsonConfig[option];
			process.stderr.write(`Configuration option ${chalk.bold(option)} has been unset\n`);
		} else {
			jsonConfig[option] = value;
			process.stderr.write(`Configuration option ${chalk.bold(option)} has been updated:
${formatJsonForOutput(jsonConfig, option)}`);
		}

		await Configuration.toFile(new Configuration(jsonConfig));
		break;
	}
}

function formatJsonForOutput(config, filterKey) {
	return Object.keys(config)
		.filter((key) => !filterKey || filterKey === key)
		.filter((key) => config[key] !== undefined) // Don't print undefined config values
		.map((key) => {
			return `  ${key} = ${config[key]}\n`;
		}).join("");
}

export default configCommand;
