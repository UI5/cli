import logger from "@ui5/logger";
import {createReader} from "@ui5/fs/resourceFactory";

/**
 * Specification
 *
 * @public
 * @abstract
 * @class
 * @alias @ui5/project/specifications/Specification
 * @hideconstructor
 */
class Specification {
	constructor() {
		if (new.target === Specification) {
			throw new TypeError("Class 'Specification' is abstract. Please use one of the 'types' subclasses");
		}
		this._log = logger.getLogger(`specifications:types:${this.constructor.name}`);
	}

	/**
	 * @param {object} parameters Specification parameters
	 * @param {string} parameters.id Unique ID
	 * @param {string} parameters.version Version
	 * @param {string} parameters.modulePath File System path to access resources
	 * @param {object} parameters.configuration Configuration object
	 */
	async init({id, version, modulePath, configuration}) {
		if (!id) {
			throw new Error(`Could not create specification: Missing or empty parameter 'id'`);
		}
		if (!version) {
			throw new Error(`Could not create specification: Missing or empty parameter 'version'`);
		}
		if (!modulePath) {
			throw new Error(`Could not create specification: Missing or empty parameter 'modulePath'`);
		}
		if (!configuration) {
			throw new Error(`Could not create specification: Missing or empty parameter 'configuration'`);
		}

		this._version = version;
		this._modulePath = modulePath;

		// The configured name (metadata.name) should be the unique identifier
		// The ID property as supplied by the translators is only here for debugging and potential tracing purposes
		this.__id = id;

		// Deep clone config to prevent changes by reference
		const config = JSON.parse(JSON.stringify(configuration));
		const {validate} = await import("../validation/validator.js");

		if (config.specVersion === "0.1" || config.specVersion === "1.0" ||
			config.specVersion === "1.1") {
			const originalSpecVersion = config.specVersion;
			this._log.verbose(`Detected legacy specification version ${config.specVersion}, defined for ` +
				`${config.kind} ${config.metadata.name}. ` +
				`Attempting to migrate the project to a supported specification version...`);
			this._migrateLegacyProject(config);
			try {
				await validate({
					config,
					project: {
						id
					}
				});
			} catch (err) {
				this._log.verbose(
					`Validation error after migration of ${config.kind} ${config.metadata.name}:`);
				this._log.verbose(err.message);
				throw new Error(
					`${config.kind} ${config.metadata.name} defines unsupported specification version ` +
					`${originalSpecVersion}. Please manually upgrade to 2.0 or higher. ` +
					`For details see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions - ` +
					`An attempted migration to a supported specification version failed, ` +
					`likely due to unrecognized configuration. Check verbose log for details.`);
			}
		} else if (config.specVersion !== "2.0" &&
			config.specVersion !== "2.1" && config.specVersion !== "2.2" &&
			config.specVersion !== "2.3" && config.specVersion !== "2.4" &&
			config.specVersion !== "2.5" && config.specVersion !== "2.6") {
			throw new Error(
				`Unsupported specification version ${config.specVersion} defined in ${config.kind} ` +
				`${config.metadata.name}. Your UI5 CLI installation might be outdated. ` +
				`For details see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions`);
		} else {
			await validate({
				config,
				project: {
					id
				}
			});
		}

		// Check whether the given configuration matches the class by guessing the type name from the class name
		if (config.type.replace("-", "") !== this.constructor.name.toLowerCase()) {
			throw new Error(
				`Configuration mismatch: Supplied configuration of type '${config.type}' does not match with ` +
				`specification class ${this.constructor.name}`);
		}

		this._name = config.metadata.name;
		this._kind = config.kind;
		this._type = config.type;
		this._specVersion = config.specVersion;
		this._config = config;

		return this;
	}

	/* === Attributes === */
	/**
	 * Get the project name
	 *
	 * @public
	 * @returns {string} Project name
	 */
	getName() {
		return this._name;
	}

	/**
	 * Get the project kind
	 *
	 * @public
	 * @returns {string} Project kind
	 */
	getKind() {
		return this._kind;
	}

	/**
	 * Get the project type
	 *
	 * @public
	 * @returns {string} Project type
	 */
	getType() {
		return this._type;
	}

	/**
	 * Get the project's Specification Version
	 *
	 * @public
	 * @returns {string} Project Specification Version
	 */
	getSpecVersion() {
		return this._specVersion;
	}

	/**
	 * Get the project version as typically defined in the project's <code>package.json</code>
	 *
	 * @public
	 * @returns {string} Project version
	 */
	getVersion() {
		return this._version;
	}

	/**
	 * Get the project's file system path. This might not be POSIX-style on some platforms
	 *
	 * @private
	 * @returns {string} Project root path
	 */
	getPath() {
		return this._modulePath;
	}

	/* === Resource Access === */
	/**
	* Get a [ReaderCollection]{@link @ui5/fs/ReaderCollection} for the root directory of the project.
	* Resource readers always use POSIX-style
	*
	* @public
	* @returns {@ui5/fs/ReaderCollection} Reader collection
	*/
	getRootReader() {
		return createReader({
			fsBasePath: this.getPath(),
			virBasePath: "/",
			name: `Root reader for ${this.getType()} ${this.getKind()} ${this.getName()}`
		});
	}

	/* === Internals === */
	/* === Helper === */
	/**
	 * @private
	 * @param {string} dirPath Path of directory, relative to the project root
	*/
	async _dirExists(dirPath) {
		const resource = await this.getRootReader().byPath(dirPath, {nodir: false});
		if (resource && resource.getStatInfo().isDirectory()) {
			return true;
		}
		return false;
	}

	_migrateLegacyProject(config) {
		config.specVersion = "2.6";

		// propertiesFileSourceEncoding (relevant for applications and libraries) default
		// has been changed to UTF-8 with specVersion 2.0
		// Adding back the old default if no configuration is provided.
		if (config.kind === "project" && ["application", "library"].includes(config.type) &&
				!config.resources?.configuration?.propertiesFileSourceEncoding) {
			config.resources = config.resources || {};
			config.resources.configuration = config.resources.configuration || {};
			config.resources.configuration.propertiesFileSourceEncoding = "ISO-8859-1";
		}
	}

	static async create(params) {
		if (!params.configuration) {
			throw new Error(
				`Unable to create Specification instance: Missing configuration parameter`);
		}
		const {kind, type} = params.configuration;
		if (!["project", "extension"].includes(kind)) {
			throw new Error(`Unable to create Specification instance: Unknown kind '${kind}'`);
		}

		switch (type) {
		case "application": {
			return createAndInitializeSpec("Application.js", params);
		}
		case "library": {
			return createAndInitializeSpec("Library.js", params);
		}
		case "theme-library": {
			return createAndInitializeSpec("ThemeLibrary.js", params);
		}
		case "module": {
			return createAndInitializeSpec("Module.js", params);
		}
		case "task": {
			return createAndInitializeSpec("extensions/Task.js", params);
		}
		case "server-middleware": {
			return createAndInitializeSpec("extensions/ServerMiddleware.js", params);
		}
		case "project-shim": {
			return createAndInitializeSpec("extensions/ProjectShim.js", params);
		}
		default:
			throw new Error(
				`Unable to create Specification instance: Unknown specification type '${type}'`);
		}
	}
}

async function createAndInitializeSpec(moduleName, params) {
	const {default: Spec} = await import(`./types/${moduleName}`);
	return new Spec().init(params);
}

export default Specification;
