import yaml from "js-yaml";
import Configuration from "./benchmark/Configuration.js";

/**
 * Loads and parses benchmark configuration from YAML files.
 */
export default class ConfigurationLoader {
	/**
	 * @param {object} fs - File system module (for dependency injection)
	 */
	constructor(fs) {
		this.#fs = fs;
	}

	#fs;

	/**
	 * Load and parse a YAML configuration file.
	 *
	 * @param {string} configFilePath - Absolute path to the YAML configuration file
	 * @returns {Configuration}
	 */
	load(configFilePath) {
		if (!configFilePath || typeof configFilePath !== "string") {
			throw new Error("Configuration file path must be a non-empty string");
		}

		let fileContents;
		try {
			fileContents = this.#fs.readFileSync(configFilePath, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") {
				throw new Error(`Configuration file not found: ${configFilePath}`);
			}
			throw new Error(`Failed to read configuration file: ${error.message}`);
		}

		let parsedYaml;
		try {
			parsedYaml = yaml.load(fileContents);
		} catch (error) {
			throw new Error(`Failed to parse YAML configuration: ${error.message}`);
		}

		if (!parsedYaml || typeof parsedYaml !== "object") {
			throw new Error("Configuration file must contain a valid YAML object");
		}

		try {
			return new Configuration(parsedYaml);
		} catch (error) {
			throw new Error(`Invalid configuration: ${error.message}`);
		}
	}
}
