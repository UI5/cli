import path from "node:path";
import os from "node:os";

/**
 * Provides basic configuration settings for @ui5/project/ui5Framework/* resolvers.
 * Reads/writes configuration from/to ~/.ui5rc
 *
 * @public
 * @class
 * @alias @ui5/project/config/Configuration
 */
class Configuration {
	#mavenSnapshotEndpointUrl;

	/**
	 * @param {object} configuration
	 * @param {string} [configuration.mavenSnapshotEndpointUrl]
	 */
	constructor({mavenSnapshotEndpointUrl}) {
		this.#mavenSnapshotEndpointUrl = mavenSnapshotEndpointUrl;
	}

	/**
	 * Maven Repository Snapshot URL.
	 * Used to download artifacts and packages from Maven's build-snapshots URL.
	 *
	 * @public
	 * @returns {string}
	 */
	getMavenSnapshotEndpointUrl() {
		return this.#mavenSnapshotEndpointUrl;
	}

	/**
	 * @public
	 * @returns {object} The configuration in a JSON format
	 */
	toJson() {
		return {
			mavenSnapshotEndpointUrl: this.#mavenSnapshotEndpointUrl,
		};
	}

	/**
	 * Creates Configuration from a JSON file
	 *
	 * @public
	 * @static
	 * @param {string} [filePath="~/.ui5rc"] Path to configuration JSON file
	 * @returns {Promise<@ui5/project/config/Configuration>} Configuration instance
	 */
	static async fromFile(filePath) {
		filePath = filePath || path.resolve(path.join(os.homedir(), ".ui5rc"));

		const {default: fs} = await import("graceful-fs");
		const {promisify} = await import("node:util");
		const readFile = promisify(fs.readFile);
		let config;
		try {
			const fileContent = await readFile(filePath);
			if (!fileContent.length) {
				config = {};
			} else {
				config = JSON.parse(fileContent);
			}
		} catch (err) {
			if (err.code === "ENOENT") {
				// "File or directory does not exist"
				config = {};
			} else {
				throw new Error(
					`Failed to read UI5 Tooling configuration from ${filePath}: ${err.message}`, {
						cause: err
					});
			}
		}
		return new Configuration(config);
	}

	/**
	 * Saves Configuration to a JSON file
	 *
	 * @public
	 * @static
	 * @param {@ui5/project/config/Configuration} config Configuration to save
	 * @param {string} [filePath="~/.ui5rc"] Path to configuration JSON file
	 * @returns {Promise<void>}
	 */
	static async toFile(config, filePath) {
		filePath = filePath || path.resolve(path.join(os.homedir(), ".ui5rc"));

		const {default: fs} = await import("graceful-fs");
		const {promisify} = await import("node:util");
		const writeFile = promisify(fs.writeFile);

		try {
			return writeFile(filePath, JSON.stringify(config.toJson()));
		} catch (err) {
			throw new Error(
				`Failed to write UI5 Tooling configuration to ${filePath}: ${err.message}`, {
					cause: err
				});
		}
	}
}

export default Configuration;
