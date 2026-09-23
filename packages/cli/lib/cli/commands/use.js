// Use
import {createRequire} from "node:module";
import baseMiddleware from "../middlewares/base.js";
import {applyProjectConfigOptions} from "../options.js";
import {applyCommandMetadata} from "../commandMetadata.js";

const require = createRequire(import.meta.url);
const metadata = require("./use.json");

const useCommand = {
	command: metadata.command,
	describe: metadata.describe,
	middlewares: [baseMiddleware]
};

useCommand.builder = function(cli) {
	applyCommandMetadata(cli, metadata);
	applyProjectConfigOptions(cli);
	return cli;
};

function parseFrameworkInfo(frameworkInfo) {
	const parts = frameworkInfo.split("@");
	if (parts.length > 2) {
		// More than one @ sign
		throw new Error("Invalid framework info: " + frameworkInfo);
	}
	if (parts.length === 1) {
		// No @ sign, only name or version
		const nameOrVersion = parts[0];
		if (!nameOrVersion) {
			throw new Error("Invalid framework info: " + frameworkInfo);
		}
		if (["sapui5", "openui5"].includes(nameOrVersion.toLowerCase())) {
			// Framework name without version uses "latest", similar to npm install behavior
			return {
				name: nameOrVersion,
				version: "latest"
			};
		} else {
			return {
				name: null,
				version: nameOrVersion
			};
		}
	} else {
		const [name, version] = parts;
		if (!name || !version) {
			throw new Error("Invalid framework info: " + frameworkInfo);
		}
		return {name, version};
	}
}

useCommand.handler = async function(argv) {
	const frameworkOptions = parseFrameworkInfo(argv["framework-info"]);

	const projectGraphOptions = {
		dependencyDefinition: argv.dependencyDefinition,
		config: argv.config
	};

	const {default: use} = await import("../../framework/use.js");
	const {usedFramework, usedVersion, yamlUpdated} = await use({
		projectGraphOptions,
		frameworkOptions
	});

	if (!yamlUpdated) {
		if (argv.config) {
			throw new Error(
				`Internal error while updating config at ${argv.config} to ${usedFramework} version ${usedVersion}`
			);
		} else {
			throw new Error(`Internal error while updating ui5.yaml to ${usedFramework} version ${usedVersion}`);
		}
	} else {
		process.stdout.write(`Updated configuration written to ${argv.config || "ui5.yaml"}`);
		process.stdout.write("\n");
		process.stdout.write(`This project is now using ${usedFramework} version ${usedVersion}`);
		process.stdout.write("\n");
	}
};

export default useCommand;
