import Specification from "./Specification.js";
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import {createWorkspace, createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";

const INITIAL_STAGE_ID = "initial";
const RESULT_STAGE_ID = "result";

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
	#stages = []; // Stages in order of creation

	// State
	#currentStage;
	#currentStageReadIndex;
	#currentStageId;

	// Cache
	#currentStageWorkspace;
	#currentStageReaders; // Map to store the various reader styles

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

		this._initStageMetadata();
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

	getSourcePaths() {
		throw new Error(`getSourcePaths must be implemented by subclass ${this.constructor.name}`);
	}

	getVirtualPath() {
		throw new Error(`getVirtualPath must be implemented by subclass ${this.constructor.name}`);
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
	 * Also see [Framework Configuration: Dependencies]{@link https://ui5.github.io/cli/stable/pages/Configuration/#dependencies}
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
	 *  This style is typically used for serving resources directly. Therefore, build-excludes are not applied</li>
	 * <li><b>flat:</b> Resource paths are never prefixed and namespaces are omitted if possible. Note that
	 *  project types like "theme-library", which can have multiple namespaces, can't omit them.
	 *  Any configured build-excludes are applied</li>
	 * </ul>
	 *
	 * If project resources have been changed through the means of a workspace, those changes
	 * are reflected in the provided reader too.
	 *
	 * Resource readers always use POSIX-style paths.
	 *
	 * @public
	 * @param {object} [options]
	 * @param {string} [options.style=buildtime] Path style to access resources.
	 *   Can be "buildtime", "dist", "runtime" or "flat"
	 * @returns {@ui5/fs/ReaderCollection} A reader collection instance
	 */
	getReader({style = "buildtime"} = {}) {
		let reader = this.#currentStageReaders.get(style);
		if (reader) {
			// Use cached reader
			return reader;
		}

		const readers = [];
		if (this.#currentStage) {
			// Add current writer as highest priority reader
			const currentWriter = this.#currentStage.getWriter();
			if (currentWriter) {
				this._addReadersForWriter(readers, currentWriter, style);
			} else {
				const currentReader = this.#currentStage.getCachedWriter();
				if (currentReader) {
					this._addReadersForWriter(readers, currentReader, style);
				}
			}
		}
		// Add readers for previous stages and source
		readers.push(...this.#getReaders(style));

		reader = createReaderCollectionPrioritized({
			name: `Reader collection for stage '${this.#currentStageId}' of project ${this.getName()}`,
			readers
		});

		this.#currentStageReaders.set(style, reader);
		return reader;
	}

	#getReaders(style = "buildtime") {
		const readers = [];

		// Add writers for previous stages as readers
		const stageReadIdx = this.#currentStageReadIndex;

		// Collect writers from all relevant stages
		for (let i = stageReadIdx; i >= 0; i--) {
			this.#addReaderForStage(this.#stages[i], readers, style);
		}

		// Finally add the project's source reader
		readers.push(this._getStyledReader(style));

		return readers;
	}

	getSourceReader(style = "buildtime") {
		return this._getStyledReader(style);
	}

	/**
	* Get a [DuplexCollection]{@link @ui5/fs/DuplexCollection} for accessing and modifying a
	* project's resources. This is always of style <code>buildtime</code>.
	*
	* Once a project has finished building, this method will throw to prevent further modifications
	* since those would have no effect. Use the getReader method to access the project's (modified) resources
	*
	* @public
	* @returns {@ui5/fs/DuplexCollection} DuplexCollection
	*/
	getWorkspace() {
		if (this.#currentStageId === RESULT_STAGE_ID) {
			throw new Error(
				`Workspace of project ${this.getName()} is currently not available. ` +
				`This might indicate that the project has already finished building ` +
				`and its content can not be modified further. ` +
				`Use method 'getReader' for read-only access`);
		}
		if (this.#currentStageWorkspace) {
			return this.#currentStageWorkspace;
		}
		const reader = createReaderCollectionPrioritized({
			name: `Reader collection for stage '${this.#currentStageId}' of project ${this.getName()}`,
			readers: this.#getReaders(),
		});
		const writer = this.#currentStage.getWriter();
		const workspace = createWorkspace({
			reader,
			writer
		});
		this.#currentStageWorkspace = workspace;
		return workspace;
	}

	/**
	 * Seal the workspace of the project, preventing further modifications.
	 * This is typically called once the project has finished building. Resources from all stages will be used.
	 *
	 * A project can be unsealed by calling useStage() again.
	 *
	 */
	useResultStage() {
		this.#currentStage = null;
		this.#currentStageId = RESULT_STAGE_ID;
		this.#currentStageReadIndex = this.#stages.length - 1; // Read from all stages

		// Unset "current" reader/writer. They will be recreated on demand
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;
	}

	_initStageMetadata() {
		this.#stages = [];
		// Initialize with an empty stage for use without stages (i.e. without build cache)
		this.#currentStage = new Stage(INITIAL_STAGE_ID, this._createWriter());
		this.#currentStageId = INITIAL_STAGE_ID;
		this.#currentStageReadIndex = -1;
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;
	}

	#addReaderForStage(stage, readers, style = "buildtime") {
		const writer = stage.getWriter();
		if (writer) {
			this._addReadersForWriter(readers, writer, style);
		} else {
			const reader = stage.getCachedWriter();
			if (reader) {
				this._addReadersForWriter(readers, reader, style);
			}
		}
	}

	initStages(stageIds) {
		this._initStageMetadata();
		for (let i = 0; i < stageIds.length; i++) {
			const stageId = stageIds[i];
			const newStage = new Stage(stageId, this._createWriter());
			this.#stages.push(newStage);
		}
	}

	getStage() {
		return this.#currentStage;
	}

	useStage(stageId) {
		if (stageId === this.#currentStage?.getId()) {
			// Already using requested stage
			return;
		}

		const stageIdx = this.#stages.findIndex((s) => s.getId() === stageId);

		if (stageIdx === -1) {
			throw new Error(`Stage '${stageId}' does not exist in project ${this.getName()}`);
		}

		const stage = this.#stages[stageIdx];
		this.#currentStage = stage;
		this.#currentStageId = stageId;
		this.#currentStageReadIndex = stageIdx - 1; // Read from all previous stages

		// Unset "current" reader/writer caches. They will be recreated on demand
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;
	}

	setStage(stageId, stageOrCachedWriter) {
		const stageIdx = this.#stages.findIndex((s) => s.getId() === stageId);
		if (stageIdx === -1) {
			throw new Error(`Stage '${stageId}' does not exist in project ${this.getName()}`);
		}
		if (!stageOrCachedWriter) {
			throw new Error(
				`Invalid stage or cache reader provided for stage '${stageId}' in project ${this.getName()}`);
		}
		const oldStage = this.#stages[stageIdx];
		if (oldStage.getId() !== stageId) {
			throw new Error(
				`Stage ID mismatch for stage '${stageId}' in project ${this.getName()}`);
		}
		let newStage;
		if (stageOrCachedWriter instanceof Stage) {
			newStage = stageOrCachedWriter;
			if (oldStage === newStage) {
				// Same stage as before
				return false; // Stored stage has not changed
			}
		} else {
			newStage = new Stage(stageId, undefined, stageOrCachedWriter);
		}
		this.#stages[stageIdx] = newStage;

		// Update current stage reference if necessary
		if (oldStage === this.#currentStage) {
			this.#currentStage = newStage;
			// Unset "current" reader/writer. They might be outdated
			this.#currentStageReaders = new Map();
			this.#currentStageWorkspace = null;
		}
		return true; // Indicate that the stored stage has changed
	}

	/* Overwritten in ComponentProject subclass */
	_addReadersForWriter(readers, writer, style) {
		readers.unshift(writer);
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

/**
 * A stage has either a writer or a reader, never both.
 * Consumers need to be able to differentiate between the two
 */
class Stage {
	#id;
	#writer;
	#cachedWriter;

	constructor(id, writer, cachedWriter) {
		if (writer && cachedWriter) {
			throw new Error(
				`Stage '${id}' cannot have both a writer and a cache reader`);
		}
		this.#id = id;
		this.#writer = writer;
		this.#cachedWriter = cachedWriter;
	}

	getId() {
		return this.#id;
	}

	getWriter() {
		return this.#writer;
	}

	getCachedWriter() {
		return this.#cachedWriter;
	}
}

export default Project;
