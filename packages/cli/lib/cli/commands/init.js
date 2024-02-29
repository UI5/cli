// Init
import baseMiddleware from "../middlewares/base.js";

const initCommand = {
	command: "init",
	describe: "Initialize the UI5 Tooling configuration for an application or library project.",
	middlewares: [baseMiddleware]
};

initCommand.handler = async function() {
	const {exists} = await import("../../utils/fsHelper.js");
	const {default: init} = await import("../../init/init.js");
	const {default: path} = await import("node:path");
	const {writeFile} = await import("node:fs/promises");
	const {default: jsYaml} = await import("js-yaml");

	const yamlPath = path.resolve("./ui5.yaml");
	if (await exists(yamlPath)) {
		throw new Error("Initialization not possible: ui5.yaml already exists");
	}

	const projectConfig = await init();
	const yaml = jsYaml.dump(projectConfig, {quotingType: `"`});

	await writeFile(yamlPath, yaml);
	process.stdout.write(`Wrote ui5.yaml to ${yamlPath}:`);
	process.stdout.write("\n");
	process.stdout.write(yaml);
	process.stdout.write("\n");
};

export default initCommand;
