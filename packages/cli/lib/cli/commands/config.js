import chalk from "chalk";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";

const configCommand = {
	command: "config",
	describe: "Get and set UI5 Tooling configuration options",
	middlewares: [baseMiddleware],
	handler: handleConfig
};

configCommand.builder = function(cli) {
	return cli
		.demandCommand(1, "Command required. Available commands are 'set', 'get', and 'list'")
		.command("set <key> [value]", "Set the value for a given configuration key. " +
			"Clear an existing configuration by omitting the value", {
			handler: handleConfig,
			builder: noop,
			middlewares: [baseMiddleware],
		})
		.command("get <key>", "Get the value for a given configuration key", {
			handler: handleConfig,
			builder: noop,
			middlewares: [baseMiddleware],
		})
		.command("list", "Display the current configuration", {
			handler: handleConfig,
			builder: noop,
			middlewares: [baseMiddleware],
		})
		.example("$0 config set mavenSnapshotEndpointUrl http://example.com/snapshots/",
			"Set a value for the mavenSnapshotEndpointUrl configuration")
		.example("$0 config set mavenSnapshotEndpointUrl",
			"Unset the current value of the mavenSnapshotEndpointUrl configuration");
};

function noop() {}

async function handleConfig(argv) {
	const {_: commandArgs, key, value} = argv;
	const command = commandArgs[commandArgs.length - 1];

	const {default: Configuration} = await import( "@ui5/project/config/Configuration");
	const allowedKeys = ["mavenSnapshotEndpointUrl"];

	if (["set", "get"].includes(command) && !allowedKeys.includes(key)) {
		throw new Error(
			`The provided key is not a valid configuration option. Valid options are: ${allowedKeys.join(", ")}`);
	}

	const config = await Configuration.fromFile();
	if (command === "list") {
		// Print all configuration values to stdout
		process.stdout.write(formatJsonForOutput(config.toJson()));
	} else if (command === "get") {
		// Get a single configuration value and print to stdout
		let configValue = config.toJson()[key];
		if (configValue === undefined) {
			configValue = "";
		}
		process.stdout.write(`${configValue}\n`);
	} else if (command === "set") {
		const jsonConfig = config.toJson();
		if (value === undefined || value === "") {
			delete jsonConfig[key];
			process.stderr.write(`Configuration option ${chalk.bold(key)} has been unset\n`);
		} else {
			jsonConfig[key] = value;
			process.stderr.write(`Configuration option ${chalk.bold(key)} has been updated:
${formatJsonForOutput(jsonConfig, key)}`);
		}

		await Configuration.toFile(new Configuration(jsonConfig));
	} else {
		throw new Error(`Unknown 'ui5 config' command '${command}'`);
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
