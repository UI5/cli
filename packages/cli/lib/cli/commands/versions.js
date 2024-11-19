import baseMiddleware from "../middlewares/base.js";
import path from "node:path";
import {isLogLevelEnabled} from "@ui5/logger";
import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
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
		if (!packageInfo?.version) {
			return NOT_FOUND;
		}
		let res = packageInfo.version;
		if (isLogLevelEnabled("verbose")) {
			const packageDir = path.dirname(require.resolve(`${pkg}/package.json`));
			res += ` (from ${packageDir})`;
		}
		return res;
	} catch {
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

	process.stdout.write(`\n${output}\n\n`);
};

export default versions;
