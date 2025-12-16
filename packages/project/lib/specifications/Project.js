import Specification from "./Specification.js";
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import {createWorkspace, createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";

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

	#currentStageWorkspace;
	#currentStageReaders = new Map(); // Initialize an empty map to store the various reader styles
	#currentStage;
	#currentStageReadIndex = -1;
	#currentStageName = "<source>";

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
		// const readers = [];
		// this._addWriter(style, readers, this.getWriter());
		// readers.push(this._getStyledReader(style));
		// reader = createReaderCollectionPrioritized({
		// 	name: `Reader collection for project ${this.getName()}`,
		// 	readers
		// });
		// reader = this.#getReader(this.#currentStage, style);

		const readers = [];

		// Add writers for previous stages as readers
		const stageReadIdx = this.#currentStageReadIndex;

		// Collect writers from all relevant stages
		for (let i = stageReadIdx; i >= 0; i--) {
			const stageReaders = this.#getReaderForStage(this.#stages[i], style);
			if (stageReaders) {
				readers.push();
			}
		}


		// Always add source reader
		readers.push(this._getStyledReader(style));

		reader = createReaderCollectionPrioritized({
			name: `Reader collection for stage '${this.#currentStageName}' of project ${this.getName()}`,
			readers: readers
		});

		this.#currentStageReaders.set(style, reader);
		return reader;
	}

	// getCacheReader({style = "buildtime"} = {}) {
	// 	return this.#getReader(this.#currentStage, style, true);
	// }

	getSourceReader(style = "buildtime") {
		return this._getStyledReader(style);
	}

	// #getWriter() {
	// 	return this.#currentStage.getWriter();
	// }

	// #createNewWriterStage(stageId) {
	// 	const writer = this._createWriter();
	// 	this.#writers.set(stageId, writer);
	// 	this.#currentWriter = writer;

	// 	// Invalidate dependents
	// 	this.#currentWorkspace = null;
	// 	this.#currentReader = new Map();

	// 	return writer;
	// }

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
		if (!this.#currentStage) {
			throw new Error(
				`Workspace of project ${this.getName()} is currently not available. ` +
				`This might indicate that the project has already finished building ` +
				`and its content can not be modified further. ` +
				`Use method 'getReader' for read-only access`);
		}
		if (this.#currentStageWorkspace) {
			return this.#currentStageWorkspace;
		}
		const writer = this.#currentStage.getWriter();

		// if (this.#stageCacheReaders.has(this.getCurrentStage())) {
		// 	reader = createReaderCollectionPrioritized({
		// 		name: `Reader collection for project ${this.getName()} stage ${this.getCurrentStage()}`,
		// 		readers: [
		// 			this.#stageCacheReaders.get(this.getCurrentStage()),
		// 			reader,
		// 		]
		// 	});
		// }
		const workspace = createWorkspace({
			reader: this.getReader(),
			writer: writer.collection || writer
		});
		this.#currentStageWorkspace = workspace;
		return workspace;
	}

	// getWorkspaceForVersion(version) {
	// 	return createWorkspace({
	// 		reader: this.#getReader(version),
	// 		writer: this.#writerVersions[version].collection || this.#writerVersions[version]
	// 	});
	// }


	// newVersion() {
	// 	this.#workspaceSealed = false;
	// 	this.#currentVersion++;
	// 	this.useInitialStage();
	// }

	// revertToLastVersion() {
	// 	if (this.#currentVersion === 0) {
	// 		throw new Error(`Unable to revert to previous version: No previous version available`);
	// 	}
	// 	this.#currentVersion--;
	// 	this.useInitialStage();

	// 	// Remove writer version from all stages
	// 	for (const writerVersions of this.#writers.values()) {
	// 		if (writerVersions[this.#currentVersion]) {
	// 			delete writerVersions[this.#currentVersion];
	// 		}
	// 	}
	// }

	// #getReader(style = "buildtime") {
	// 	const readers = [];

	// 	// Add writers for previous stages as readers
	// 	const stageIdx = this.#stages.findIndex((s) => s.getName() === stageId);
	// 	if (stageIdx > 0) { // Stage 0 has no previous stage
	// 		// Collect writers from all preceding stages
	// 		for (let i = stageIdx - 1; i >= 0; i--) {
	// 			const stageWriters = this.#getWriters(this.#stages[i], version, style);
	// 			if (stageWriters) {
	// 				readers.push(stageWriters);
	// 			}
	// 		}
	// 	}

	// 	// Always add source reader
	// 	readers.push(this._getStyledReader(style));

	// 	return createReaderCollectionPrioritized({
	// 		name: `Reader collection for stage '${stage}' of project ${this.getName()}`,
	// 		readers: readers
	// 	});
	// }

	useStage(stageId) {
		// if (newWriter && this.#writers.has(stageId)) {
		// 	this.#writers.delete(stageId);
		// }
		if (stageId === this.#currentStage.getId()) {
			// Already using requested stage
			return;
		}

		const stageIdx = this.#stages.findIndex((s) => s.getId() === stageId);

		if (stageIdx === -1) {
			throw new Error(`Stage '${stageId}' does not exist in project ${this.getName()}`);
		}

		const stage = this.#stages[stageIdx];
		stage.newVersion(this._createWriter());
		this.#currentStage = stage;
		this.#currentStageName = stageId;
		this.#currentStageReadIndex = stageIdx - 1; // Read from all previous stages

		// Unset "current" reader/writer. They will be recreated on demand
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;
	}

	/**
	 * Seal the workspace of the project, preventing further modifications.
	 * This is typically called once the project has finished building. Resources from all stages will be used.
	 *
	 * A project can be unsealed by calling useStage() again.
	 *
	 */
	sealWorkspace() {
		this.#currentStage = null; // Unset stage - This blocks further getWorkspace() calls
		this.#currentStageName = "<final>";
		this.#currentStageReadIndex = this.#stages.length - 1; // Read from all stages

		// Unset "current" reader/writer. They will be recreated on demand
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;
	}

	#getReaderForStage(stage, style = "buildtime", includeCache = true) {
		const writers = stage.getAllWriters(includeCache);
		const readers = [];
		for (const writer of writers) {
			// Apply project specific handling for using writers as readers, depending on the requested style
			this._addWriter("buildtime", readers, writer);
		}

		return createReaderCollectionPrioritized({
			name: `Reader collection for stage '${stage.getId()}' of project ${this.getName()}`,
			readers
		});
	}

	// #getWriters(stage, version, style = "buildtime") {
	// 	const readers = [];
	// 	const stageWriters = this.#writers.get(stage);
	// 	if (!stageWriters?.length) {
	// 		return null;
	// 	}
	// 	for (let i = version; i >= 0; i--) {
	// 		if (!stageWriters[i]) {
	// 			// Writers is a sparse array, some stages might skip a version
	// 			continue;
	// 		}
	// 		this._addWriter(style, readers, stageWriters[i]);
	// 	}

	// 	return createReaderCollectionPrioritized({
	// 		name: `Collection of all writers for stage '${stage}', version ${version} of project ${this.getName()}`,
	// 		readers
	// 	});
	// }

	// getDeltaReader(stage) {
	// 	const readers = [];
	// 	const stageWriters = this.#writers.get(stage);
	// 	if (!stageWriters?.length) {
	// 		return null;
	// 	}
	// 	const version = this.#currentVersion;
	// 	for (let i = version; i >= 1; i--) { // Skip version 0 (possibly containing cached writers)
	// 		if (!stageWriters[i]) {
	// 			// Writers is a sparse array, some stages might skip a version
	// 			continue;
	// 		}
	// 		this._addWriter("buildtime", readers, stageWriters[i]);
	// 	}

	// 	const reader = createReaderCollectionPrioritized({
	// 		name: `Collection of new writers for stage '${stage}', version ${version} of project ${this.getName()}`,
	// 		readers
	// 	});


	// 	// Condense writer versions (TODO: this step is optional but might improve memory consumption)
	// 	// this.#condenseVersions(reader);
	// 	return reader;
	// }

	// #condenseVersions(reader) {
	// 	for (const stage of this.#stages) {
	// 		const stageWriters = this.#writers.get(stage);
	// 		if (!stageWriters) {
	// 			continue;
	// 		}
	// 		const condensedWriter = this._createWriter();

	// 		for (let i = 1; i < stageWriters.length; i++) {
	// 			if (stageWriters[i]) {

	// 			}
	// 		}

	// 		// eslint-disable-next-line no-sparse-arrays
	// 		const newWriters = [, condensedWriter];
	// 		if (stageWriters[0]) {
	// 			newWriters[0] = stageWriters[0];
	// 		}
	// 		this.#writers.set(stage, newWriters);
	// 	}
	// }

	getStagesForCache() {
		return this.#stages.map((stage) => {
			const reader = this.#getReaderForStage(stage, "buildtime", false);
			return {
				stageId: stage.getId(),
				reader
			};
		});
	}

	setStages(stageIds, cacheReaders) {
		if (this.#stages.length > 0) {
			// Stages have already been set. Compare existing stages with new ones and throw on mismatch
			for (let i = 0; i < stageIds.length; i++) {
				const stageId = stageIds[i];
				if (this.#stages[i].getId() !== stageId) {
					throw new Error(
						`Unable to set stages for project ${this.getName()}: Stage mismatch at position ${i} ` +
						`(existing: ${this.#stages[i].getId()}, new: ${stageId})`);
				}
			}
			if (cacheReaders.length) {
				throw new Error(
					`Unable to set stages for project ${this.getName()}: Cache readers can only be set ` +
					`when stages are created for the first time`);
			}
			return;
		}
		for (let i = 0; i < stageIds.length; i++) {
			const stageId = stageIds[i];
			const newStage = new Stage(stageId, cacheReaders?.[i]);
			this.#stages.push(newStage);
		}

		// let lastIdx;
		// for (let i = 0; i < stageIds.length; i++) {
		// 	const stageId = stageIds[i];
		// 	const idx = this.#stages.findIndex((s) => {
		// 		return s.getName() === stageId;
		// 	});
		// 	if (idx !== -1) {
		// 		// Stage already exists, remember its position for later use
		// 		lastIdx = idx;
		// 		continue;
		// 	}
		// 	const newStage = new Stage(stageId, cacheReaders?.[i]);
		// 	if (lastIdx !== undefined) {
		// 		// Insert new stage after the last existing one to maintain order
		// 		this.#stages.splice(lastIdx + 1, 0, newStage);
		// 		lastIdx++;
		// 	} else {
		// 		// Append new stage
		// 		this.#stages.push(newStage);
		// 	}
		// }
	}

	// /**
	//  * Import cached stages into the project
	//  *
	//  * @param {Array<{stageName: string, reader: import("@ui5/fs").Reader}>} stages Stages to import
	//  */
	// importCachedStages(stages) {
	// 	if (!this.#workspaceSealed) {
	// 		throw new Error(`Unable to import cached stages: Workspace is not sealed`);
	// 	}
	// 	for (const {stageName, reader} of stages) {
	// 		if (!this.#stages.includes(stageName)) {
	// 			this.#stages.push(stageName);
	// 		}
	// 		if (reader) {
	// 			this.#writers.set(stageName, [reader]);
	// 		} else {
	// 			this.#writers.set(stageName, []);
	// 		}
	// 	}
	// 	this.#currentVersion = 0;
	// 	this.useFinalStage();
	// }

	// getCurrentStage() {
	// 	return this.#currentStage;
	// }

	/* Overwritten in ComponentProject subclass */
	_addWriter(style, readers, writer) {
		readers.push(writer);
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

class Stage {
	#id;
	#writerVersions = [];
	#cacheReader;

	constructor(id, cacheReader) {
		this.#id = id;
		this.#cacheReader = cacheReader;
	}

	getId() {
		return this.#id;
	}

	newVersion(writer) {
		this.#writerVersions.push(writer);
	}

	getWriter() {
		return this.#writerVersions[this.#writerVersions.length - 1];
	}

	getAllWriters(includeCache = true) {
		if (includeCache && this.#cacheReader) {
			return [this.#cacheReader, ...this.#writerVersions];
		}
		return this.#writerVersions;
	}
}

export default Project;
