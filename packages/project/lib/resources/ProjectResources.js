import {createWorkspace, createReaderCollectionPrioritized} from "@ui5/fs/resourceFactory";
import MonitoredResourceTagCollection from "@ui5/fs/internal/MonitoredResourceTagCollection";
import ResourceTagCollection from "@ui5/fs/internal/ResourceTagCollection";
import Stage from "./Stage.js";

const INITIAL_STAGE_ID = "initial";
const RESULT_STAGE_ID = "result";

/**
 * Manages resource access and stages for a project.
 *
 * @public
 * @class
 * @alias @ui5/project/resources/ProjectResources
 */
class ProjectResources {
	#stages = []; // Stages in order of creation

	// State
	#currentStage;
	#currentStageReadIndex;
	#lastTagCacheImportIndex;
	#currentTagCacheImportIndex;
	#currentStageId;

	// Cache
	#currentStageWorkspace;
	#currentStageReaders; // Map to store the various reader styles

	// Callbacks (interface object)
	#getName;
	#getStyledReader;
	#createWriter;
	#addReadersForWriter;

	// Project tag collection resets at the beginning of every build
	#projectResourceTagCollection;
	// Build tag collection resets at the end of every build
	// (so that those tags are not accessible to dependent projects)
	#buildResourceTagCollection;

	// Individual monitors per stage
	#monitoredProjectResourceTagCollection;
	#monitoredBuildResourceTagCollection;

	#buildManifest;

	/**
	 * @param {object} options Configuration options
	 * @param {Function} options.getName Returns the project name (for error messages and reader names)
	 * @param {Function} options.getStyledReader Gets the source reader for a given style
	 * @param {Function} options.createWriter Creates a writer for a stage
	 * @param {Function} options.addReadersForWriter Adds readers for a writer to a readers array
	 * @param {object} options.buildManifest
	 */
	constructor({getName, getStyledReader, createWriter, addReadersForWriter, buildManifest}) {
		this.#getName = getName;
		this.#getStyledReader = getStyledReader;
		this.#createWriter = createWriter;
		this.#addReadersForWriter = addReadersForWriter;
		this.#buildManifest = buildManifest;

		this.#initStageMetadata();
	}

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
				this.#addReadersForWriter(readers, currentWriter, style);
			} else {
				const currentReader = this.#currentStage.getCachedWriter();
				if (currentReader) {
					this.#addReadersForWriter(readers, currentReader, style);
				}
			}
		}
		// Add readers for previous stages and source
		readers.push(...this.#getReaders(style));

		reader = createReaderCollectionPrioritized({
			name: `Reader collection for stage '${this.#currentStageId}' of project ${this.#getName()}`,
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
		readers.push(this.#getStyledReader(style));

		return readers;
	}

	/**
	 * Get the source reader for the project.
	 *
	 * @public
	 * @param {string} [style=buildtime] Path style to access resources
	 * @returns {@ui5/fs/ReaderCollection} A reader collection instance
	 */
	getSourceReader(style = "buildtime") {
		return this.#getStyledReader(style);
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
				`Workspace of project ${this.#getName()} is currently not available. ` +
				`This might indicate that the project has already finished building ` +
				`and its content can not be modified further. ` +
				`Use method 'getReader' for read-only access`);
		}
		if (this.#currentStageWorkspace) {
			return this.#currentStageWorkspace;
		}
		const reader = createReaderCollectionPrioritized({
			name: `Reader collection for stage '${this.#currentStageId}' of project ${this.#getName()}`,
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
	 * @public
	 */
	useResultStage() {
		this.#currentStage = null;
		this.#currentStageId = RESULT_STAGE_ID;
		this.#currentStageReadIndex = this.#stages.length - 1; // Read from all stages
		this.#currentTagCacheImportIndex = this.#stages.length - 1; // Import cached tags from all stages

		// Unset "current" reader/writer. They will be recreated on demand
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;

		this.#monitoredProjectResourceTagCollection = null;
		this.#monitoredBuildResourceTagCollection = null;
	}

	#initStageMetadata() {
		this.#stages = [];
		// Initialize with an empty stage for use without stages (i.e. without build cache)
		this.#currentStage = new Stage(INITIAL_STAGE_ID, this.#createWriter(INITIAL_STAGE_ID));
		this.#currentStageId = INITIAL_STAGE_ID;
		this.#currentStageReadIndex = -1;
		this.#lastTagCacheImportIndex = -1;
		this.#currentTagCacheImportIndex = -1;
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;
		this.#projectResourceTagCollection = null;
	}

	#addReaderForStage(stage, readers, style = "buildtime") {
		const writer = stage.getWriter();
		if (writer) {
			this.#addReadersForWriter(readers, writer, style);
		} else {
			const reader = stage.getCachedWriter();
			if (reader) {
				this.#addReadersForWriter(readers, reader, style);
			}
		}
	}

	/**
	 * Initialize stages for the build process.
	 *
	 * @public
	 * @param {string[]} stageIds Array of stage IDs to initialize
	 */
	initStages(stageIds) {
		this.#initStageMetadata();
		for (let i = 0; i < stageIds.length; i++) {
			const stageId = stageIds[i];
			const newStage = new Stage(stageId, this.#createWriter(stageId));
			this.#stages.push(newStage);
		}
	}

	/**
	 * Get the current stage.
	 *
	 * @public
	 * @returns {Stage|null} The current stage or null if in result stage
	 */
	getStage() {
		return this.#currentStage;
	}

	/**
	 * Switch to a specific stage.
	 *
	 * @public
	 * @param {string} stageId The ID of the stage to use
	 * @throws {Error} If the stage does not exist
	 */
	useStage(stageId) {
		if (stageId === this.#currentStage?.getId()) {
			// Already using requested stage
			return;
		}

		const stageIdx = this.#stages.findIndex((s) => s.getId() === stageId);

		if (stageIdx === -1) {
			throw new Error(`Stage '${stageId}' does not exist in project ${this.#getName()}`);
		}

		const stage = this.#stages[stageIdx];
		this.#currentStage = stage;
		this.#currentStageId = stageId;
		this.#currentStageReadIndex = stageIdx - 1; // Read from all previous stages
		this.#currentTagCacheImportIndex = stageIdx; // Import cached tags from previous and current stages

		// Unset "current" reader/writer caches. They will be recreated on demand
		this.#currentStageReaders = new Map();
		this.#currentStageWorkspace = null;

		this.#monitoredProjectResourceTagCollection = null;
		this.#monitoredBuildResourceTagCollection = null;
	}

	/**
	 * Set or replace a stage.
	 *
	 * @public
	 * @param {string} stageId The ID of the stage to set
	 * @param {Stage|object} stageOrCachedWriter A Stage instance or a cached writer/reader
	 * @param {Map<string, Map<string, {string|number|boolean|undefined}>>} projectTagOperations
	 * @param {Map<string, Map<string, {string|number|boolean|undefined}>>} buildTagOperations
	 * @returns {boolean} True if the stored stage has changed, false otherwise
	 * @throws {Error} If the stage does not exist or invalid parameters are provided
	 */
	setStage(stageId, stageOrCachedWriter, projectTagOperations, buildTagOperations) {
		const stageIdx = this.#stages.findIndex((s) => s.getId() === stageId);
		if (stageIdx === -1) {
			throw new Error(`Stage '${stageId}' does not exist in project ${this.#getName()}`);
		}
		if (!stageOrCachedWriter) {
			throw new Error(
				`Invalid stage or cache reader provided for stage '${stageId}' in project ${this.#getName()}`);
		}
		const oldStage = this.#stages[stageIdx];
		if (oldStage.getId() !== stageId) {
			throw new Error(
				`Stage ID mismatch for stage '${stageId}' in project ${this.#getName()}`);
		}
		let newStage;
		if (stageOrCachedWriter instanceof Stage) {
			newStage = stageOrCachedWriter;
			if (oldStage === newStage) {
				// Same stage as before, nothing to do
				return false; // Stored stage has not changed
			}
		} else {
			newStage = new Stage(stageId, undefined, stageOrCachedWriter,
				projectTagOperations, buildTagOperations);
		}
		this.#stages[stageIdx] = newStage;

		// If we are updating the current stage, make sure to update and reset all relevant references
		if (oldStage === this.#currentStage) {
			this.#currentStage = newStage;
			// Unset "current" reader/writer. They might be outdated
			this.#currentStageReaders = new Map();
			this.#currentStageWorkspace = null;
		}
		return true; // Indicate that the stored stage has changed
	}

	buildFinished() {
		// Clear build resource tag collections. They must not be provided to dependent projects
		this.#buildResourceTagCollection = null;
	}

	/**
	 * Gets the appropriate resource tag collection for a resource and tag
	 *
	 * Determines which tag collection (project-specific or build-level) should be used
	 * for the given resource and tag combination. Associates the resource with the current
	 * project if not already associated.
	 *
	 * @param {@ui5/fs/Resource} resource Resource to get tag collection for
	 * @param {string} tag Tag to check acceptance for
	 * @returns {@ui5/fs/internal/ResourceTagCollection} Appropriate tag collection
	 * @throws {Error} If no collection accepts the given tag
	 */
	getResourceTagCollection(resource, tag) {
		this.#applyCachedResourceTags();
		const projectCollection = this.#getProjectResourceTagCollection();
		if (!tag || projectCollection.acceptsTag(tag)) {
			if (!this.#monitoredProjectResourceTagCollection) {
				this.#monitoredProjectResourceTagCollection = new MonitoredResourceTagCollection(projectCollection);
			}
			return this.#monitoredProjectResourceTagCollection;
		}
		const buildCollection = this.#getBuildResourceTagCollection();
		if (buildCollection.acceptsTag(tag)) {
			if (!this.#monitoredBuildResourceTagCollection) {
				this.#monitoredBuildResourceTagCollection = new MonitoredResourceTagCollection(buildCollection);
			}
			return this.#monitoredBuildResourceTagCollection;
		}
		throw new Error(`Could not find collection for resource ${resource.getPath()} and tag ${tag}`);
	}

	getResourceTagOperations() {
		return {
			projectTagOperations: new Map([
				...this.#currentStage.getCachedProjectTagOperations() ?? [],
				...this.#monitoredProjectResourceTagCollection?.getTagOperations() ?? [],
			]),
			buildTagOperations: new Map([
				...this.#currentStage.getCachedBuildTagOperations() ?? [],
				...this.#monitoredBuildResourceTagCollection?.getTagOperations() ?? [],
			]),
		};
	}

	/**
	 * Returns the project-level resource tag collection.
	 *
	 * This provides direct access to the collection holding project-level tags
	 * (e.g. ui5:IsDebugVariant, ui5:HasDebugVariant), which is needed for
	 * build manifest creation and reading.
	 *
	 * @returns {@ui5/fs/internal/ResourceTagCollection} The project-level resource tag collection
	 */
	getProjectResourceTagCollection() {
		return this.#getProjectResourceTagCollection();
	}

	#getProjectResourceTagCollection() {
		if (!this.#projectResourceTagCollection) {
			this.#projectResourceTagCollection = new ResourceTagCollection({
				allowedTags: ["ui5:IsDebugVariant", "ui5:HasDebugVariant"],
				allowedNamespaces: ["project"],
				tags: this.#buildManifest?.tags
			});
		}
		return this.#projectResourceTagCollection;
	}

	#getBuildResourceTagCollection() {
		if (!this.#buildResourceTagCollection) {
			this.#buildResourceTagCollection = new ResourceTagCollection({
				allowedTags: ["ui5:OmitFromBuildResult", "ui5:IsBundle"],
				allowedNamespaces: ["build"],
				tags: this.#buildManifest?.tags
			});
		}
		return this.#buildResourceTagCollection;
	}

	#applyCachedResourceTags() {
		// Collect tag ops from all relevant stages
		const cachedProjectTagOps = [];
		const cachedBuildTagOps = [];

		for (let i = this.#lastTagCacheImportIndex + 1; i <= this.#currentTagCacheImportIndex; i++) {
			const projectTagOps = this.#stages[i].getCachedProjectTagOperations();
			if (projectTagOps) {
				cachedProjectTagOps.push(projectTagOps);
			}
			const buildTagOps = this.#stages[i].getCachedBuildTagOperations();
			if (buildTagOps) {
				cachedBuildTagOps.push(buildTagOps);
			}
		}

		// if (this.#currentStage) {
		// 	const projectTagOps = this.#currentStage.getCachedProjectTagOperations();
		// 	if (projectTagOps) {
		// 		cachedProjectTagOps.push(projectTagOps);
		// 	}
		// 	const buildTagOps = this.#currentStage.getCachedBuildTagOperations();
		// 	if (buildTagOps) {
		// 		cachedBuildTagOps.push(buildTagOps);
		// 	}
		// }
		this.#lastTagCacheImportIndex = this.#currentTagCacheImportIndex;

		const projectTagOps = mergeMaps(...cachedProjectTagOps);
		const buildTagOps = mergeMaps(...cachedBuildTagOps);

		if (projectTagOps.size) {
			const projectTagCollection = this.#getProjectResourceTagCollection();
			for (const [resourcePath, tags] of projectTagOps.entries()) {
				for (const [tag, value] of tags.entries()) {
					projectTagCollection.setTag(resourcePath, tag, value);
				}
			}
		}
		if (buildTagOps.size) {
			const buildTagCollection = this.#getBuildResourceTagCollection();
			for (const [resourcePath, tags] of buildTagOps.entries()) {
				for (const [tag, value] of tags.entries()) {
					buildTagCollection.setTag(resourcePath, tag, value);
				}
			}
		}
	}
}

const mergeMaps = (...maps) => {
	const result = new Map();
	for (const map of maps) {
		for (const [key, value] of map) {
			result.set(key, value);
		}
	}
	return result;
};

export default ProjectResources;
