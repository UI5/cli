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
	* @public
	*/
	getNamespace() {
		// Default namespace for general Projects:
		// Their resources should be structured with globally unique paths, hence their namespace is undefined
		return null;
	}

	/**
	* Path of project's sources. This might not be POSIX.
	*
	* @public
	*/
	getSourcePath() {
		throw new Error(`getSourcePath must be implemented by subclass ${this.constructor.name}`);
	}

	/**
	* @private
	*/
	getFrameworkName() {
		return this._config.framework?.name;
	}
	/**
	* @private
	*/
	getFrameworkVersion() {
		return this._config.framework?.version;
	}
	/**
	* @private
	*/
	getFrameworkDependencies() {
		return this._config.framework?.libraries || [];
	}

	isFrameworkProject() {
		return this.__id.startsWith("@openui5/") || this.__id.startsWith("@sapui5/");
	}

	getDeprecated() {
		return !!this._config.metadata.deprecated;
	}

	getSapInternal() {
		return !!this._config.metadata.sapInternal;
	}
	getAllowSapInternal() {
		return !!this._config.metadata.allowSapInternal;
	}

	getCustomConfiguration() {
		return this._config.customConfiguration;
	}

	getBuilderResourcesExcludes() {
		return this._config.builder?.resources?.excludes || [];
	}

	getCustomTasks() {
		return this._config.builder?.customTasks || [];
	}

	getCustomMiddleware() {
		return this._config.server?.customMiddleware || [];
	}

	getServerSettings() {
		return this._config.server?.settings;
	}

	getBuilderSettings() {
		return this._config.builder?.settings;
	}

	hasBuildManifest() {
		return !!this._buildManifest;
	}

	getBuildManifest() {
		return this._buildManifest || {};
	}

	/* === Resource Access === */
	/**
	 * Get a [ReaderCollection]{@link @ui5/fs/ReaderCollection} for accessing all resources of the
	 * project in the specified "style":
	 *
	 * <ul>
	 * <li><b>buildtime</b>: Resource paths are always prefixed with <code>/resources/</code>
	 *  or <code>/test-resources/</code> followed by the project's namespace</li>
	 * <li><b>runtime</b>: Access resources the same way the UI5 runtime would do</li>
	 * <li><b>flat:</b> No prefix, no namespace</li>
	 * </ul>
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.style=buildtime] Path style to access resources. Can be "buildtime", "runtime" or "flat"
	 *											This parameter might be ignored by some project types
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
