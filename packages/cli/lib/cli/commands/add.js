// Add
const addCommand = {
	command: "add [--development] [--optional] <framework-libraries..>",
	describe: "Add SAPUI5/OpenUI5 framework libraries to the project configuration.",
	middlewares: [require("../middlewares/base.js")]
};

addCommand.builder = function(cli) {
	return cli
		.positional("framework-libraries", {
			describe: "Framework library names",
			type: "string"
		}).option("development", {
			describe: "Add as development dependency",
			alias: ["D", "dev"],
			default: false,
			type: "boolean"
		}).option("optional", {
			describe: "Add as optional dependency",
			alias: ["O"],
			default: false,
			type: "boolean"
		})
		.example("$0 add sap.ui.core sap.m", "Add the framework libraries sap.ui.core and sap.m as dependencies")
		.example("$0 add -D sap.ui.support", "Add the framework library sap.ui.support as development dependency")
		.example("$0 add --optional themelib_sap_fiori_3",
			"Add the framework library themelib_sap_fiori_3 as optional dependency");
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

	const normalizerOptions = {
		translatorName: argv.translator,
		configPath: argv.config
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

	const {yamlUpdated} = await require("../../framework/add")({
		normalizerOptions,
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
		console.log(`Updated configuration written to ${argv.config || "ui5.yaml"}`);
		let logMessage = `Added framework ${library} ${libraryNames.join(" ")} as`;
		if (development) {
			logMessage += " development";
		} else if (optional) {
			logMessage += " optional";
		}
		logMessage += libraries.length === 1 ? " dependency": " dependencies";
		console.log(logMessage);
	}
};

module.exports = addCommand;
