import path from "node:path";
import {readFile} from "node:fs/promises";
import {pathsExist} from "../utils/fsHelper.js";

/**
 * Reads the package.json file and returns its content
 *
 * @private
 * @param {string} filePath Path to package.json
 * @returns {object} Package json content
 */
async function readPackageJson(filePath) {
	const content = await readFile(filePath, "utf8");
	return JSON.parse(content);
}

/**
 * Determines the project type from the provided parameters
 *
 * @private
 * @param {boolean} hasWebapp Webapp folder exists
 * @param {boolean} hasSrc Src folder exists
 * @param {boolean} hasTest Test folder exists
 * @returns {string} Project type
 */
function getProjectType(hasWebapp, hasSrc, hasTest) {
	let errorReason;
	if (hasWebapp) {
		// Mixed folders of application and library
		if (hasSrc && hasTest) {
			errorReason = "Found 'webapp', 'src' and 'test' folders.\n";
		} else if (hasSrc) {
			errorReason = "Found 'webapp' and 'src' folders.\n";
		} else if (hasTest) {
			errorReason = "Found 'webapp' and 'test' folders.\n";
		} else {
			return "application";
		}
	} else if (hasSrc) {
		return "library";
	} else if (hasTest) {
		// Only test folder
		errorReason = "Found 'test' folder but no 'src' folder.\n";
	} else {
		// No folders at all
		errorReason = "Could not find 'webapp' or 'src' / 'test' folders.\n";
	}

	let message = `Could not detect project type: ${errorReason}`;
	message += "Applications should only have a 'webapp' folder.\n";
	message += "Libraries should only have an 'src' and (optional) 'test' folder.";
	message += "\n\n";
	message += "If you are about to start a new project, please refer to:\n";
	message += "https://sap.github.io/ui5-tooling/v4/pages/GettingStarted/#starting-a-new-project";
	throw new Error(message);
}

/**
 * @module @ui5/cli/init
 */

/**
 * Initiates the projects <b>ui5.yaml</b> configuration file.
 *
 * Checks the package.json and tries to determine the project type. If the <b>ui5.yaml</b> file does not exist,
 * it is created with the basic project configuration.
 *
 * @function default
 * @static
 * @param {string} cwd Current working directory
 * @returns {Promise} Promise resolving with the project configuration object
 */
async function init({cwd = "./"} = {}) {
	const projectConfig = {
		specVersion: "4.0",
		metadata: {}
	};
	let pkg;

	try {
		pkg = await readPackageJson(path.join(cwd, "package.json"));
	} catch (err) {
		if (err.code === "ENOENT") {
			throw new Error("Initialization not possible: Missing package.json file");
		} else {
			throw err;
		}
	}

	if (pkg && pkg.name) {
		projectConfig.metadata.name = pkg.name;
	} else {
		throw new Error("Initialization not possible: Missing 'name' in package.json");
	}

	const [hasWebapp, hasSrc, hasTest] = await pathsExist(["webapp", "src", "test"], cwd);
	projectConfig.type = getProjectType(hasWebapp, hasSrc, hasTest);

	return projectConfig;
}

export default init;
