import path from "node:path";
import Workspace from "../Workspace.js";
import {validateWorkspace} from "../../validation/validator.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("generateProjectGraph");

const DEFAULT_WORKSPACE_CONFIG_PATH = "ui5-workspace.yaml";
const DEFAULT_WORKSPACE_NAME = "default";

export default async function createWorkspace({
	cwd, name, configObject, configPath
}) {
	if (!cwd || (!configObject && !configPath)) {
		throw new Error(`createWorkspace: Missing parameter 'cwd', 'configObject' or 'configPath'`);
	}
	if (configObject) {
		if (!configObject?.metadata?.name) {
			throw new Error(`Invalid workspace configuration: Missing or empty property 'metadata.name'`);
		}
		if (name && configObject.metadata.name !== name) {
			throw new Error(
				`The provided workspace name '${name}' does not match ` +
				`the provided workspace configuration '${configObject.metadata.name}'`);
		} else {
			log.verbose(`Using provided workspace configuration ${configObject.metadata.name}...`);
			return new Workspace({
				cwd,
				configuration: configObject
			});
		}
	} else {
		if (!name) {
			throw new Error(`createWorkspace: Parameter 'configPath' implies parameter 'name', but it's empty`);
		}
		let filePath = configPath;
		if (!path.isAbsolute(filePath)) {
			filePath = path.join(cwd, configPath);
		}
		try {
			const workspaceConfigs =
				await readWorkspaceConfigFile(filePath, );
			const configuration = workspaceConfigs.find((config) => {
				return config.metadata.name === name;
			});

			if (configuration) {
				log.verbose(`Using workspace configuration "${name}" from ${configPath}...`);
				return new Workspace({
					cwd: path.dirname(filePath),
					configuration
				});
			} else if (name === DEFAULT_WORKSPACE_NAME) {
				// Requested workspace not found
				// Do not throw if the requested name is the default
				return null;
			} else {
				throw new Error(`Could not find a workspace named '${name}' in ${configPath}`);
			}
		} catch (err) {
			if (name === DEFAULT_WORKSPACE_NAME && configPath === DEFAULT_WORKSPACE_CONFIG_PATH &&
				err.cause?.code === "ENOENT") {
				// Do not throw if the default workspace in the default file was requested but not found
				log.verbose(`No workspace configuration file provided at ${filePath}`);
				return null;
			} else {
				throw err;
			}
		}
	}
}

async function readWorkspaceConfigFile(filePath, throwIfMissing) {
	const {
		default: fs
	} = await import("graceful-fs");
	const {promisify} = await import("node:util");
	const readFile = promisify(fs.readFile);
	const jsyaml = await import("js-yaml");

	let fileContent;
	try {
		fileContent = await readFile(filePath, {encoding: "utf8"});
	} catch (err) {
		throw new Error(
			`Failed to load workspace configuration from path ${filePath}: ${err.message}`, {
				cause: err
			});
	}
	let configs;
	try {
		configs = jsyaml.loadAll(fileContent, undefined, {
			filename: filePath,
		});
	} catch (err) {
		if (err.name === "YAMLException") {
			throw new Error(`Failed to parse workspace configuration at ` +
			`${filePath}\nError: ${err.message}`);
		} else {
			throw new Error(
				`Failed to parse workspace configuration at ${filePath}: ${err.message}`);
		}
	}

	if (!configs || !configs.length) {
		// No configs found => exit here
		log.verbose(`Found empty workspace configuration file at ${filePath}`);
		return configs;
	}

	// Validate found configurations with schema
	// Validation is done again in the Workspace class. But here we can reference the YAML file
	// which adds helpful information like the line number
	const validationResults = await Promise.all(
		configs.map(async (config, documentIndex) => {
			// Catch validation errors to ensure proper order of rejections within Promise.all
			try {
				await validateWorkspace({
					config,
					yaml: {
						path: filePath,
						source: fileContent,
						documentIndex
					}
				});
			} catch (error) {
				return error;
			}
		})
	);

	const validationErrors = validationResults.filter(($) => $);

	if (validationErrors.length > 0) {
		// Throw any validation errors
		// For now just throw the error of the first invalid document
		throw validationErrors[0];
	}

	return configs;
}

// Export function for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	createWorkspace._readWorkspaceConfigFile = readWorkspaceConfigFile;
}
