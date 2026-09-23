import {createRequire} from "node:module";
import chalk from "chalk";
import process from "node:process";
import baseMiddleware from "../middlewares/base.js";
import {applyCommandMetadata} from "../commandMetadata.js";
import Configuration from "@ui5/project/config/Configuration";

const require = createRequire(import.meta.url);
const metadata = require("./config.json");

const configCommand = {
	command: metadata.command,
	describe: metadata.describe,
	middlewares: [baseMiddleware],
	handler: handleConfig
};

configCommand.builder = function(cli) {
	const setMeta = metadata.subcommands.find((s) => s.command.startsWith("set"));
	applyCommandMetadata(cli, metadata);
	return cli
		.demandCommand(1, "Command required. Available commands are 'set', 'get', and 'list'")
		.command("set <option> [value]", setMeta.describe, {
			handler: handleConfig,
			builder: (yargs) => {
				applyCommandMetadata(yargs, setMeta);
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
		});
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
