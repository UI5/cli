// Versions
const baseMiddleware = require("../middlewares/base.js");

const versions = {
	command: "versions",
	describe: "Shows the versions of all UI5 Tooling modules",
	middlewares: [baseMiddleware]
};

const NOT_FOUND = "===(not installed)";
const getVersion = (pkg) => {
	try {
		const packageInfo = require(`${pkg}/package.json`);
		return packageInfo.version || NOT_FOUND;
	} catch (err) {
		return NOT_FOUND;
	}
};

versions.handler = (argv) => {
	try {
		const cliVersion =
			require("../../../package.json").version || NOT_FOUND;
		const builderVersion = getVersion("@ui5/builder");
		const serverVersion = getVersion("@ui5/server");
		const fsVersion = getVersion("@ui5/fs");
		const projectVersion = getVersion("@ui5/project");
		const loggerVersion = getVersion("@ui5/logger");
		console.log(`
	@ui5/cli:      ${cliVersion}
	@ui5/builder:  ${builderVersion}
	@ui5/server:   ${serverVersion}
	@ui5/fs:       ${fsVersion}
	@ui5/project:  ${projectVersion}
	@ui5/logger:   ${loggerVersion}
		`);
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
};

module.exports = versions;
