// Add
import {createRequire} from "node:module";
import base from "../middlewares/base.js";
import {applyProjectConfigOptions} from "../options.js";
import {applyCommandMetadata} from "../commandMetadata.js";

const require = createRequire(import.meta.url);
const metadata = require("./add.json");

const addCommand = {
	command: metadata.command,
	describe: metadata.describe,
	middlewares: [base]
};

addCommand.builder = function(cli) {
	applyCommandMetadata(cli, metadata);
	applyProjectConfigOptions(cli);
	return cli;
};

addCommand.handler = async function(argv) {
	const libraryNames = argv["framework-libraries"] || [];
	const development = argv["development"];
	const optional = argv["optional"];

	if (libraryNames.length === 0) {
		// Should not happen via yargs as parameter is mandatory
		throw new Error("Missing mandatory parameter framework-libraries");
	}

	if (development && optional) {
		throw new Error("Options 'development' and 'optional' cannot be combined");
	}

	const projectGraphOptions = {
		dependencyDefinition: argv.dependencyDefinition,
		config: argv.config
	};

	const libraries = libraryNames.map((name) => {
		const library = {name};
		if (optional) {
			library.optional = true;
		} else if (development) {
			library.development = true;
		}
		return library;
	});

	const {default: add} = await import("../../framework/add.js");
	const {yamlUpdated} = await add({
		projectGraphOptions,
		libraries
	});

	const library = libraries.length === 1 ? "library": "libraries";
	if (!yamlUpdated) {
		if (argv.config) {
			throw new Error(
				`Internal error while adding framework ${library} ${libraryNames.join(" ")} to config at ${argv.config}`
			);
		} else {
			throw new Error(
				`Internal error while adding framework ${library} ${libraryNames.join(" ")} to ui5.yaml`
			);
		}
	} else {
		process.stdout.write(`Updated configuration written to ${argv.config || "ui5.yaml"}`);
		process.stdout.write("\n");
		let logMessage = `Added framework ${library} ${libraryNames.join(" ")} as`;
		if (development) {
			logMessage += " development";
		} else if (optional) {
			logMessage += " optional";
		}
		logMessage += libraries.length === 1 ? " dependency": " dependencies";
		process.stdout.write(logMessage);
		process.stdout.write("\n");
	}
};

export default addCommand;
