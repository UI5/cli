// Init
let init = {
	command: "init",
	describe: "Initialize the UI5 Build and Development Tooling configuration for an application or library project.",
	middlewares: [require("../middlewares/base.js")]
};

init.handler = async function(argv) {
	const init = require("../../init/init");
	const {promisify} = require("util");
	const path = require("path");
	const fs = require("fs");
	const stat = promisify(fs.stat);
	const writeFile = promisify(fs.writeFile);
	const safeDumpYaml = require("js-yaml").safeDump;

	async function exists(filePath) {
		try {
			await stat(filePath);
			return true;
		} catch (err) {
			// "File or directory does not exist"
			if (err.code === "ENOENT") {
				return false;
			} else {
				throw err;
			}
		}
	}

	try {
		const yamlPath = path.resolve("./ui5.yaml");
		if (await exists(yamlPath)) {
			throw new Error("Initialization not possible: ui5.yaml already exists");
		}

		const projectConfig = await init();
		const yaml = safeDumpYaml(projectConfig);

		await writeFile(yamlPath, yaml);

		console.log(`Wrote ui5.yaml to ${yamlPath}:\n`);
		console.log(yaml);
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
};

module.exports = init;
