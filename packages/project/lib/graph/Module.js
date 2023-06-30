import fs from "graceful-fs";
import path from "node:path";
import {promisify} from "node:util";
const readFile = promisify(fs.readFile);
import jsyaml from "js-yaml";
import {createReader} from "@ui5/fs/resourceFactory";
import Specification from "../specifications/Specification.js";
import {validate} from "../validation/validator.js";

import {getLogger} from "@ui5/logger";

const log = getLogger("graph:Module");

const DEFAULT_CONFIG_PATH = "ui5.yaml";
const SAP_THEMES_NS_EXEMPTIONS = ["themelib_sap_fiori_3", "themelib_sap_bluecrystal", "themelib_sap_belize"];

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}
/**
 * Raw representation of a UI5 Project. A module can contain zero to one projects and n extensions.
 * This class is intended for private use by the
 * [@ui5/project/graph/ProjectGraphBuilder]{@link @ui5/project/graph/ProjectGraphBuilder} module
 *
 * @private
 * @class
 * @alias @ui5/project/graph/Module
 */
class Module {
	/**
	 * @param {object} parameters Module parameters
	 * @param {string} parameters.id Unique ID for the module
	 * @param {string} parameters.version Version of the module
	 * @param {string} parameters.modulePath Absolute File System path of the module
	 * @param {string} [parameters.configPath=ui5.yaml]
	 *						Either a path relative to `modulePath` which will be resolved by @ui5/fs (default),
	 *						or an absolute File System path to the configuration file.
	 * @param {object|object[]} [parameters.configuration]
	 * 						Configuration object or array of objects to use. If supplied, no configuration files
	 * 						will be read and the `configPath` option must not be provided.
	 * @param {@ui5/project/graph.ShimCollection} [parameters.shimCollection]
	 *						Collection of shims that might be relevant for this module
	 */
	constructor({id, version, modulePath, configPath, configuration = [], shimCollection}) {
		if (!id) {
			throw new Error(`Could not create Module: Missing or empty parameter 'id'`);
		}
		if (!version) {
			throw new Error(`Could not create Module: Missing or empty parameter 'version'`);
		}
		if (!modulePath) {
			throw new Error(`Could not create Module: Missing or empty parameter 'modulePath'`);
		}
		if (!path.isAbsolute(modulePath)) {
			throw new Error(`Could not create Module: Parameter 'modulePath' must contain an absolute path`);
		}
		if (
			(
				(Array.isArray(configuration) && configuration.length > 0) ||
				(!Array.isArray(configuration) && typeof configuration === "object")
			) && configPath
		) {
			throw new Error(
				`Could not create Module: 'configPath' must not be provided in combination with 'configuration'`
			);
		}

		this._id = id;
		this._version = version;
		this._modulePath = modulePath;
		this._configPath = configPath || DEFAULT_CONFIG_PATH;
		this._dependencies = Object.create(null);

		if (!Array.isArray(configuration)) {
			configuration = [configuration];
		}
		this._suppliedConfigs = configuration;

		if (shimCollection) {
			// Retrieve and clone shims in constructor
			// Shims added to the collection at a later point in time should not be applied in this module
			const shims = shimCollection.getProjectConfigurationShims(this.getId());
			if (shims && shims.length) {
				this._projectConfigShims = clone(shims);
			}
		}
	}

	getId() {
		return this._id;
	}

	getVersion() {
		return this._version;
	}

	getPath() {
		return this._modulePath;
	}

	/**
	 * Specifications found in the module
	 *
	 * @private
	 * @typedef {object} @ui5/project/graph/Module~SpecificationsResult
	 * @property {@ui5/project/specifications/Project|null} Project found in the module (if one is found)
	 * @property {@ui5/project/specifications/Extension[]} Array of extensions found in the module
	 */

	/**
	 * Get any available project and extensions of the module
	 *
	 * @returns {@ui5/project/graph/Module~SpecificationsResult} Project and extensions found in the module
	 */
	async getSpecifications() {
		if (this._pGetSpecifications) {
			return this._pGetSpecifications;
		}

		return this._pGetSpecifications = this._getSpecifications();
	}

	async _getSpecifications() {
		// Retrieve all configurations available for this module
		let configs = await this._getConfigurations();

		// Edge case:
		// Search for project-shims to check whether this module defines a collection for itself
		const isCollection = configs.find((configuration) => {
			if (configuration.kind === "extension" && configuration.type === "project-shim") {
				// TODO create Specification instance and ask it for the configuration
				if (configuration.shims && configuration.shims.collections &&
						configuration.shims.collections[this.getId()]) {
					return true;
				}
			}
		});

		if (isCollection) {
			// This module is configured as a collection
			// For compatibility reasons with the behavior of projectPreprocessor,
			// the project contained in this module must be ignored
			configs = configs.filter((configuration) => {
				return configuration.kind !== "project";
			});
		} else {
			// Patch configs
			configs.forEach((configuration) => {
				if (configuration.kind === "project" && configuration.type === "library" &&
					configuration.metadata && configuration.metadata.name) {
					const libraryName = configuration.metadata.name;
					// Old theme-libraries where configured as type "library"
					if (SAP_THEMES_NS_EXEMPTIONS.includes(libraryName)) {
						configuration.type = "theme-library";
					}
				}
			});
		}

		const specs = await Promise.all(configs.map(async (configuration) => {
			const buildManifest = configuration._buildManifest;
			if (configuration._buildManifest) {
				delete configuration._buildManifest;
			}
			const spec = await Specification.create({
				id: this.getId(),
				version: this.getVersion(),
				modulePath: this.getPath(),
				configuration,
				buildManifest
			});

			log.verbose(`Module ${this.getId()} contains ${spec.getKind()} ${spec.getName()}`);
			return spec;
		}));

		const projects = specs.filter((spec) => {
			return spec.getKind() === "project";
		});

		const extensions = specs.filter((spec) => {
			return spec.getKind() === "extension";
		});

		if (projects.length > 1) {
			throw new Error(
				`Found ${projects.length} configurations of kind 'project' for ` +
				`module ${this.getId()}. There must be only one project per module.`);
		}

		return {
			project: projects[0] || null,
			extensions
		};
	}

	/**
	* Configuration
	*/
	async _getConfigurations() {
		let configurations;

		configurations = await this._getSuppliedConfigurations();

		if (!configurations || !configurations.length) {
			configurations = await this._getBuildManifestConfigurations();
		}
		if (!configurations || !configurations.length) {
			configurations = await this._getYamlConfigurations();
		}
		if (!configurations || !configurations.length) {
			configurations = await this._getShimConfigurations();
		}
		return configurations || [];
	}

	_normalizeAndApplyShims(config) {
		this._normalizeConfig(config);

		if (config.kind === "project") {
			this._applyProjectShims(config);
		}
		return config;
	}

	async _createConfigurationFromShim() {
		const config = this._applyProjectShims();
		if (config) {
			this._normalizeConfig(config);
			return config;
		}
	}

	_applyProjectShims(config = {}) {
		if (!this._projectConfigShims) {
			return;
		}
		this._projectConfigShims.forEach(({name, shim}) => {
			log.verbose(`Applying project shim ${name} for module ${this.getId()}...`);
			Object.assign(config, shim);
		});
		return config;
	}

	async _getSuppliedConfigurations() {
		if (this._suppliedConfigs.length) {
			log.verbose(`Configuration for module ${this.getId()} has been supplied directly`);
			return await Promise.all(this._suppliedConfigs.map(async (suppliedConfig) => {
				let config = suppliedConfig;

				// If we got supplied with a build manifest object, we need to move the build manifest metadata
				// into the project and only return the project
				if (suppliedConfig.buildManifest) {
					config = suppliedConfig.project;
					config._buildManifest = suppliedConfig.buildManifest;
				}
				return this._normalizeAndApplyShims(config);
			}));
		}
	}

	async _getShimConfigurations() {
		// No project configuration found
		//	=> Try to create one from shims
		const shimConfiguration = await this._createConfigurationFromShim();
		if (shimConfiguration) {
			log.verbose(`Created configuration from shim extensions for module ${this.getId()}`);
			return [shimConfiguration];
		}
	}

	async _getYamlConfigurations() {
		const configs = await this._readConfigFile();

		if (!configs || !configs.length) {
			log.verbose(`Could not find a configuration file for module ${this.getId()}`);
			return [];
		}

		return await Promise.all(configs.map((config) => {
			return this._normalizeAndApplyShims(config);
		}));
	}

	async _readConfigFile() {
		const configPath = this._configPath;
		let configFile;
		if (path.isAbsolute(configPath)) {
			// Handle absolute file paths with the native FS module
			try {
				configFile = await readFile(configPath, {encoding: "utf8"});
			} catch (err) {
				// TODO: Caller might wants to ignore exceptions for ENOENT errors for non-root projects
				// However, this decision should not be made here
				throw new Error("Failed to read configuration for module " +
						`${this.getId()} at '${configPath}'. Error: ${err.message}`);
			}
		} else {
			// Handle relative file paths with the @ui5/fs (virtual) file system
			const reader = this.getReader();
			let configResource;
			try {
				configResource = await reader.byPath(path.posix.join("/", configPath));
			} catch (err) {
				throw new Error("Failed to read configuration for module " +
						`${this.getId()} at "${configPath}". Error: ${err.message}`);
			}
			if (!configResource) {
				if (configPath !== DEFAULT_CONFIG_PATH) {
					throw new Error("Failed to read configuration for module " +
							`${this.getId()}: Could not find configuration file in module at path '${configPath}'`);
				}
				return null;
			}
			configFile = await configResource.getString();
		}

		let configs;

		try {
			// Using loadAll with DEFAULT_SAFE_SCHEMA instead of safeLoadAll to pass "filename".
			// safeLoadAll doesn't handle its parameters properly.
			// See https://github.com/nodeca/js-yaml/issues/456 and https://github.com/nodeca/js-yaml/pull/381
			configs = jsyaml.loadAll(configFile, undefined, {
				filename: configPath,
				schema: jsyaml.DEFAULT_SAFE_SCHEMA
			});
		} catch (err) {
			if (err.name === "YAMLException") {
				throw new Error("Failed to parse configuration for project " +
				`${this.getId()} at '${configPath}'\nError: ${err.message}`);
			} else {
				throw err;
			}
		}

		if (!configs || !configs.length) {
			// No configs found => exit here
			return configs;
		}

		// Validate found configurations with schema
		// Validation is done again in the Specification class. But here we can reference the YAML file
		// which adds helpful information like the line number
		const validationResults = await Promise.all(
			configs.map(async (config, documentIndex) => {
				// Catch validation errors to ensure proper order of rejections within Promise.all
				try {
					await validate({
						config,
						project: {
							id: this.getId()
						},
						yaml: {
							path: configPath,
							source: configFile,
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

		log.verbose(`Configuration for module ${this.getId()} is provided in YAML file at ${configPath}`);
		return configs;
	}

	async _getBuildManifestConfigurations() {
		const buildManifestMetadata = await this._readBuildManifest();

		if (!buildManifestMetadata) {
			log.verbose(`Could not find any build manifest in module ${this.getId()}`);
			return [];
		}
		log.verbose(`Configuration for module ${this.getId()} is provided in build manifest`);

		// This function is expected to return the configuration of a project, so we add the buildManifest metadata
		// to a temporary attribute of the project configuration and retrieve it later for Specification creation
		const config = buildManifestMetadata.project;
		config._buildManifest = buildManifestMetadata.buildManifest;
		return [this._normalizeAndApplyShims(config)];
	}

	async _readBuildManifest() {
		const reader = this.getReader();
		const buildManifestResource = await reader.byPath("/.ui5/build-manifest.json");
		if (buildManifestResource) {
			return JSON.parse(await buildManifestResource.getString());
		}
	}

	_normalizeConfig(config) {
		if (!config.kind) {
			config.kind = "project"; // default
		}
		return config;
	}

	/**
	* Resource Access
	*/
	getReader() {
		return createReader({
			fsBasePath: this.getPath(),
			virBasePath: "/",
			name: `Reader for module ${this.getId()}`
		});
	}
}

export default Module;
