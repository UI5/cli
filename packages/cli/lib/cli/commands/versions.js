import baseMiddleware from "../middlewares/base.js";
import {createRequire} from "node:module";

// Using CommonsJS require as importing json files causes an ExperimentalWarning
const require = createRequire(import.meta.url);

const versions = {
	command: "versions",
	describe: "Shows the versions of all UI5 Tooling modules",
	middlewares: [baseMiddleware]
};

const NOT_FOUND = "===(not installed)";
versions.getVersion = (pkg) => {
	try {
		const packageInfo = require(`${pkg}/package.json`);
		return packageInfo.version || NOT_FOUND;
	} catch (err) {
		return NOT_FOUND;
	}
};

versions.handler = async function() {
	const output = (await Promise.all(
		[
			"@ui5/cli",
			"@ui5/builder",
			"@ui5/server",
			"@ui5/fs",
			"@ui5/project",
			"@ui5/logger",
		].map(async (id) => {
			return (id + ":").padEnd(15) + versions.getVersion(id);
		})
	)).join("\n");

	console.log(`\n${output}\n`);
};

export default versions;
