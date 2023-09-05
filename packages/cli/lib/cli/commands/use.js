// Use
import baseMiddleware from "../middlewares/base.js";

const useCommand = {
	command: "use <framework-info>",
	describe: "Initialize or update the project's framework configuration.",
	middlewares: [baseMiddleware]
};

useCommand.builder = function(cli) {
	return cli
		.positional("framework-info", {
			describe: "Framework name, version or both (name@version).\n" +
			"Name can be \"SAPUI5\" or \"OpenUI5\" (case-insensitive).\n" +
			"Version can be \"latest\" (default), a version or range according to the Semantic Versioning specification (https://semver.org/), " +
			"or a tag available in the npm registry.\n" +
			"For SAP-internal usage the version can also be \"latest-snapshot\", " +
			"a version or range ending with -SNAPSHOT, " +
			"or a simplified range such as \"1-SNAPSHOT\", \"1.x-SNAPSHOT\" or \"1.108-SNAPSHOT\".",
			type: "string"
		})
		.example("$0 use sapui5@latest", "Use SAPUI5 in the latest available version")
		.example("$0 use openui5@1.76", "Use OpenUI5 in the latest available 1.76 patch version")
		.example("$0 use latest", "Use the latest available version of the configured framework")
		.example("$0 use openui5", "Use OpenUI5 in the latest available version");
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
		console.log(`Updated configuration written to ${argv.config || "ui5.yaml"}`);
		console.log(`This project is now using ${usedFramework} version ${usedVersion}`);
	}
};

export default useCommand;
