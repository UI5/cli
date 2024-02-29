// Remove
import baseMiddleware from "../middlewares/base.js";

const removeCommand = {
	command: "remove <framework-libraries..>",
	describe: "Remove SAPUI5/OpenUI5 framework libraries from the project configuration.",
	middlewares: [baseMiddleware]
};

removeCommand.builder = function(cli) {
	return cli
		.positional("framework-libraries", {
			describe: "Framework library names",
			type: "string"
		})
		.example("$0 remove sap.ui.core sap.m", "Remove the framework libraries sap.ui.core and sap.m as dependencies");
};

removeCommand.handler = async function(argv) {
	let libraryNames = argv["framework-libraries"] || [];

	if (libraryNames.length === 0) {
		// Should not happen via yargs as parameter is mandatory
		throw new Error("Missing mandatory parameter framework-libraries");
	}

	// filter duplicates
	libraryNames = libraryNames.filter((libraryName, index) => {
		return libraryNames.indexOf(libraryName) === index;
	});

	const projectGraphOptions = {
		dependencyDefinition: argv.dependencyDefinition,
		config: argv.config
	};

	const libraries = libraryNames.map((name) => {
		const library = {name};
		return library;
	});

	const {default: remove} = await import("../../framework/remove.js");

	const {yamlUpdated} = await remove({
		projectGraphOptions,
		libraries
	});

	const library = libraries.length === 1 ? "library": "libraries";
	if (!yamlUpdated) {
		if (argv.config) {
			throw new Error(
				`Internal error while removing framework ${library} ${libraryNames.join(" ")} ` +
				`to config at ${argv.config}`
			);
		} else {
			throw new Error(
				`Internal error while removing framework ${library} ${libraryNames.join(" ")} to ui5.yaml`
			);
		}
	} else {
		process.stdout.write(`Updated configuration written to ${argv.config || "ui5.yaml"}`);
		process.stdout.write("\n");
		let logMessage = `Removed framework ${library} ${libraryNames.join(" ")} as`;
		logMessage += libraries.length === 1 ? " dependency": " dependencies";
		process.stdout.write(logMessage);
		process.stdout.write("\n");
	}
};

export default removeCommand;
