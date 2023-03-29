import Specification from "./Specification.js";
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";

/**
 * Project
 *
 * @public
 * @abstract
 * @class
 * @alias @ui5/project/specifications/Project
 * @extends @ui5/project/specifications/Specification
 * @hideconstructor
 */
class Project extends Specification {
	constructor(parameters) {
		super(parameters);
		if (new.target === Project) {
			throw new TypeError("Class 'Project' is abstract. Please use one of the 'types' subclasses");
		}

		this._resourceTagCollection = null;
	}

	/**
	 * @param {object} parameters Specification parameters
	 * @param {string} parameters.id Unique ID
	 * @param {string} parameters.version Version
	 * @param {string} parameters.modulePath File System path to access resources
	 * @param {object} parameters.configuration Configuration object
	 * @param {object} [parameters.buildManifest] Build metadata object
	 */
	async init(parameters) {
		await super.init(parameters);

		this._buildManifest = parameters.buildManifest;

		await this._configureAndValidatePaths(this._config);
		await this._parseConfiguration(this._config, this._buildManifest);

		return this;
	}

	/* === Attributes === */
	/**
	 * Get the project namespace. Returns `null` for projects that have none or multiple namespaces,
	 * for example Modules or Theme Libraries.
	 *
	 * @public
	 * @returns {string|null} Project namespace in slash notation (e.g. <code>my/project/name</code>) or null
	 */
	getNamespace() {
		// Default namespace for general Projects:
		// Their resources should be structured with globally unique paths, hence their namespace is undefined
		return null;
	}

	/**
	 * Check whether the project is a UI5-Framework project
	 *
	 * @public
	 * @returns {boolean} True if the project is a framework project
	 */
	isFrameworkProject() {
		const id = this.getId();
		return id.startsWith("@openui5/") || id.startsWith("@sapui5/");
	}

	/**
	 * Get the project's customConfiguration
	 *
	 * @public
	 * @returns {object} Custom Configuration
	 */
	getCustomConfiguration() {
		return this._config.customConfiguration;
	}

	/**
	 * Get the path of the project's source directory. This might not be POSIX-style on some platforms.
	 * Projects with multiple source paths will throw an error. For example Modules.
	 *
	 * @public
	 * @returns {string} Absolute path to the source directory of the project
	 * @throws {Error} In case a project has multiple source directories
	 */
	getSourcePath() {
		throw new Error(`getSourcePath must be implemented by subclass ${this.constructor.name}`);
	}

	/**
	 * Get the project's framework name configuration
	 *
	 * @public
	 * @returns {string} Framework name configuration, either <code>OpenUI5</code> or <code>SAPUI5</code>
	 */
	getFrameworkName() {
		return this._config.framework?.name;
	}

	/**
	 * Get the project's framework version configuration
	 *
	 * @public
	 * @returns {string} Framework version configuration, e.g <code>1.110.0</code>
	 */
	getFrameworkVersion() {
		return this._config.framework?.version;
	}


	/**
	 * Framework dependency entry of the project configuration.
	 * Also see [Framework Configuration: Dependencies]{@link https://sap.github.io/ui5-tooling/stable/pages/Configuration/#dependencies}
	 *
	 * @public
	 * @typedef {object} @ui5/project/specifications/Project~FrameworkDependency
	 * @property {string} name Name of the framework library. For example <code>sap.ui.core</code>
	 * @property {boolean} development Whether the dependency is meant for development purposes only
	 * @property {boolean} optional Whether the dependency should be treated as optional
	 */

	/**
	 * Get the project's framework dependencies configuration
	 *
	 * @public
	 * @returns {@ui5/project/specifications/Project~FrameworkDependency[]} Framework dependencies configuration
	 */
	getFrameworkDependencies() {
		return this._config.framework?.libraries || [];
	}

	/**
	 * Get the project's deprecated configuration
	 *
	 * @private
	 * @returns {boolean} True if the project is flagged as deprecated
	 */
	isDeprecated() {
		return !!this._config.metadata.deprecated;
	}

	/**
	 * Get the project's sapInternal configuration
	 *
	 * @private
	 * @returns {boolean} True if the project is flagged as SAP-internal
	 */
	isSapInternal() {
		return !!this._config.metadata.sapInternal;
	}

	/**
	 * Get the project's allowSapInternal configuration
	 *
	 * @private
	 * @returns {boolean} True if the project allows for using SAP-internal projects
	 */
	getAllowSapInternal() {
		return !!this._config.metadata.allowSapInternal;
	}

	/**
	 * Get the project's builderResourcesExcludes configuration
	 *
	 * @private
	 * @returns {string[]} BuilderResourcesExcludes configuration
	 */
	getBuilderResourcesExcludes() {
		return this._config.builder?.resources?.excludes || [];
	}

	/**
	 * Get the project's customTasks configuration
	 *
	 * @private
	 * @returns {object[]} CustomTasks configuration
	 */
	getCustomTasks() {
		return this._config.builder?.customTasks || [];
	}

	/**
	 * Get the project's customMiddleware configuration
	 *
	 * @private
	 * @returns {object[]} CustomMiddleware configuration
	 */
	getCustomMiddleware() {
		return this._config.server?.customMiddleware || [];
	}

	/**
	 * Get the project's serverSettings configuration
	 *
	 * @private
	 * @returns {object} ServerSettings configuration
	 */
	getServerSettings() {
		return this._config.server?.settings;
	}

	/**
	 * Get the project's builderSettings configuration
	 *
	 * @private
	 * @returns {object} BuilderSettings configuration
	 */
	getBuilderSettings() {
		return this._config.builder?.settings;
	}

	/**
	 * Get the project's buildManifest configuration
	 *
	 * @private
	 * @returns {object|null} BuildManifest configuration or null if none is available
	 */
	getBuildManifest() {
		return this._buildManifest || null;
	}

	/* === Resource Access === */
	/**
	 * Get a [ReaderCollection]{@link @ui5/fs/ReaderCollection} for accessing all resources of the
	 * project in the specified "style":
	 *
	 * <ul>
	 * <li><b>buildtime:</b> Resource paths are always prefixed with <code>/resources/</code>
	 *  or <code>/test-resources/</code> followed by the project's namespace.
	 *  Any configured build-excludes are applied</li>
	 * <li><b>dist:</b> Resource paths always match with what the UI5 runtime expects.
	 *  This means that paths generally depend on the project type. Applications for example use a "flat"-like
	 *  structure, while libraries use a "buildtime"-like structure.
	 *  Any configured build-excludes are applied</li>
	 * <li><b>runtime:</b> Resource paths always match with what the UI5 runtime expects.
	 *  This means that paths generally depend on the project type. Applications for example use a "flat"-like
	 *  structure, while libraries use a "buildtime"-like structure.
	 *  This style is typically used for serving resources directly. Therefore, build-excludes are not applied
	 * <li><b>flat:</b> Resource paths are never prefixed and namespaces are omitted if possible. Note that
	 *  project types like "theme-library", which can have multiple namespaces, can't omit them.
	 *  Any configured build-excludes are applied</li>
	 * </ul>
	 *
	 * Resource readers always use POSIX-style paths.
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.style=buildtime] Path style to access resources.
	 *   Can be "buildtime", "dist", "runtime" or "flat"
	 * @returns {@ui5/fs/ReaderCollection} Reader collection allowing access to all resources of the project
	 */
	getReader(options) {
		throw new Error(`getReader must be implemented by subclass ${this.constructor.name}`);
	}

	getResourceTagCollection() {
		if (!this._resourceTagCollection) {
			this._resourceTagCollection = new ResourceTagCollection({
				allowedTags: ["ui5:IsDebugVariant", "ui5:HasDebugVariant"],
				allowedNamespaces: ["project"],
				tags: this.getBuildManifest()?.tags
			});
		}
		return this._resourceTagCollection;
	}

	/**
	* Get a [DuplexCollection]{@link @ui5/fs/DuplexCollection} for accessing and modifying a
	* project's resources. This is always of style <code>buildtime</code>.
	*
	* @public
	* @returns {@ui5/fs/DuplexCollection} DuplexCollection
	*/
	getWorkspace() {
		throw new Error(`getWorkspace must be implemented by subclass ${this.constructor.name}`);
	}

	/* === Internals === */
	/**
	 * @private
	 * @param {object} config Configuration object
	*/
	async _configureAndValidatePaths(config) {}

	/**
	 * @private
	 * @param {object} config Configuration object
	*/
	async _parseConfiguration(config) {}
}

export default Project;
