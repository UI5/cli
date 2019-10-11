// Init
const initCommand = {
	command: "init",
	describe: "Initialize the UI5 Tooling configuration for an application or library project.",
	middlewares: [require("../middlewares/base.js")]
};

initCommand.handler = async function() {
	const fsHelper = require("../../utils/fsHelper");
	const init = require("../../init/init");
	const promisify = require("util").promisify;
	const path = require("path");
	const fs = require("fs");
	const jsYaml = require("js-yaml");
	const writeFile = promisify(fs.writeFile);

	const yamlPath = path.resolve("./ui5.yaml");
	if (await fsHelper.exists(yamlPath)) {
		throw new Error("Initialization not possible: ui5.yaml already exists");
	}

	const projectConfig = await init.init();
	const yaml = jsYaml.safeDump(projectConfig);

	await writeFile(yamlPath, yaml);
	console.log(`Wrote ui5.yaml to ${yamlPath}:\n`);
	console.log(yaml);
};

module.exports = initCommand;
