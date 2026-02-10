import {getLogger} from "@ui5/logger";
import ResourceRequestManager from "./ResourceRequestManager.js";
const log = getLogger("build:cache:BuildTaskCache");

/**
 * @typedef {object} @ui5/project/build/cache/BuildTaskCache~ResourceRequests
 * @property {Set<string>} paths Specific resource paths that were accessed
 * @property {Set<string>} patterns Glob patterns used to access resources
 */

/**
 * Manages the build cache for a single task
 *
 * This class tracks all resources accessed by a task (both project and dependency resources)
 * and maintains a graph of resource request sets. Each request set represents a unique
 * combination of resource accesses, enabling efficient cache invalidation and reuse.
 *
 * Key features:
 * - Tracks resource reads using paths and glob patterns
 * - Maintains resource indices for different request combinations
 * - Supports incremental updates when resources change
 * - Provides cache invalidation based on changed resources
 * - Serializes/deserializes cache metadata for persistence
 *
 * The request graph allows derived request sets (when a task reads additional resources)
 * to reuse existing resource indices, optimizing both memory and computation.
 *
 * @class
 */
export default class BuildTaskCache {
	#projectName;
	#taskName;
	#supportsDifferentialBuilds;

	#projectRequestManager;
	#dependencyRequestManager;

	/**
	 * Creates a new BuildTaskCache instance
	 *
	 * @public
	 * @param {string} projectName Name of the project this task belongs to
	 * @param {string} taskName Name of the task this cache manages
	 * @param {boolean} supportsDifferentialBuilds Whether the task supports differential updates
	 * @param {ResourceRequestManager} [projectRequestManager] Optional pre-existing project request manager from cache
	 * @param {ResourceRequestManager} [dependencyRequestManager]
	 * 	Optional pre-existing dependency request manager from cache
	 */
	constructor(projectName, taskName, supportsDifferentialBuilds, projectRequestManager, dependencyRequestManager) {
		this.#projectName = projectName;
		this.#taskName = taskName;
		this.#supportsDifferentialBuilds = supportsDifferentialBuilds;
		log.verbose(`Initializing BuildTaskCache for task "${taskName}" of project "${this.#projectName}" ` +
			`(supportsDifferentialBuilds=${supportsDifferentialBuilds})`);

		this.#projectRequestManager = projectRequestManager ??
			new ResourceRequestManager(projectName, taskName, supportsDifferentialBuilds);
		this.#dependencyRequestManager = dependencyRequestManager ??
			new ResourceRequestManager(projectName, taskName, supportsDifferentialBuilds);
	}

	/**
	 * Factory method to restore a BuildTaskCache from cached data
	 *
	 * Deserializes previously cached request managers for both project and dependency resources,
	 * allowing the task cache to resume from a prior build state.
	 *
	 * @public
	 * @param {string} projectName Name of the project
	 * @param {string} taskName Name of the task
	 * @param {boolean} supportsDifferentialBuilds Whether the task supports differential updates
	 * @param {object} projectRequests Cached project request manager data
	 * @param {object} dependencyRequests Cached dependency request manager data
	 * @returns {BuildTaskCache} Restored task cache instance
	 */
	static fromCache(projectName, taskName, supportsDifferentialBuilds, projectRequests, dependencyRequests) {
		const projectRequestManager = ResourceRequestManager.fromCache(projectName, taskName,
			supportsDifferentialBuilds, projectRequests);
		const dependencyRequestManager = ResourceRequestManager.fromCache(projectName, taskName,
			supportsDifferentialBuilds, dependencyRequests);
		return new BuildTaskCache(projectName, taskName, supportsDifferentialBuilds,
			projectRequestManager, dependencyRequestManager);
	}

	// ===== METADATA ACCESS =====

	/**
	 * Gets the name of the task
	 *
	 * @public
	 * @returns {string} Task name
	 */
	getTaskName() {
		return this.#taskName;
	}

	/**
	 * Checks whether the task supports differential updates
	 *
	 * Tasks that support differential updates can use incremental cache invalidation,
	 * processing only changed resources rather than rebuilding from scratch.
	 *
	 * @public
	 * @returns {boolean} True if differential updates are supported
	 */
	getSupportsDifferentialBuilds() {
		return this.#supportsDifferentialBuilds;
	}

	/**
	 * Checks whether new or modified cache entries exist
	 *
	 * Returns true if either the project or dependency request managers have new or
	 * modified cache entries that need to be persisted.
	 *
	 * @public
	 * @returns {boolean} True if cache entries need to be written
	 */
	hasNewOrModifiedCacheEntries() {
		return this.#projectRequestManager.hasNewOrModifiedCacheEntries() ||
			this.#dependencyRequestManager.hasNewOrModifiedCacheEntries();
	}

	/**
	 * Updates project resource indices based on changed resource paths
	 *
	 * Processes changed resource paths and updates the project request manager's indices
	 * accordingly. Only relevant resources (those matching recorded requests) are processed.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} projectReader Reader for accessing project resources
	 * @param {string[]} changedProjectResourcePaths Array of changed project resource paths
	 * @returns {Promise<boolean>} True if any index has changed
	 */
	updateProjectIndices(projectReader, changedProjectResourcePaths) {
		return this.#projectRequestManager.updateIndices(projectReader, changedProjectResourcePaths);
	}

	/**
	 * Updates dependency resource indices based on changed resource paths
	 *
	 * Processes changed dependency resource paths and updates the dependency request manager's
	 * indices accordingly. Only relevant resources (those matching recorded requests) are processed.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @param {string[]} changedDepResourcePaths Array of changed dependency resource paths
	 * @returns {Promise<boolean>} True if any index has changed
	 */
	updateDependencyIndices(dependencyReader, changedDepResourcePaths) {
		return this.#dependencyRequestManager.updateIndices(dependencyReader, changedDepResourcePaths);
	}

	/**
	 * Performs a full refresh of the dependency resource index
	 *
	 * Since dependency resources may change independently from this project's cache, a full
	 * refresh of the dependency index is required at the beginning of every build from cache.
	 * This ensures all dependency resources are current before task execution.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @returns {Promise<void>}
	 */
	refreshDependencyIndices(dependencyReader) {
		return this.#dependencyRequestManager.refreshIndices(dependencyReader);
	}

	/**
	 * Gets all project index signatures for this task
	 *
	 * Returns signatures from all recorded project-request sets. Each signature represents
	 * a unique combination of resources, belonging to the current project, that were accessed
	 * during task execution. These can be used as cache keys for restoring cached task results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getProjectIndexSignatures() {
		return this.#projectRequestManager.getIndexSignatures();
	}

	/**
	 * Gets all dependency index signatures for this task
	 *
	 * Returns signatures from all recorded dependency-request sets. Each signature represents
	 * a unique combination of resources, belonging to all dependencies of the current project,
	 * that were accessed during task execution. These can be used as cache keys for restoring
	 * cached task results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getDependencyIndexSignatures() {
		return this.#dependencyRequestManager.getIndexSignatures();
	}

	/**
	 * Gets all project index delta transitions for differential updates
	 *
	 * Returns a map of signature transitions and their associated changed resource paths
	 * for project resources. Used when tasks support differential updates to identify
	 * which resources changed between cache states.
	 *
	 * @public
	 * @returns {Map<string, object>} Map from original signature to delta information
	 *   containing newSignature and changedPaths array
	 */
	getProjectIndexDeltas() {
		return this.#projectRequestManager.getDeltas();
	}

	/**
	 * Gets all dependency index delta transitions for differential updates
	 *
	 * Returns a map of signature transitions and their associated changed resource paths
	 * for dependency resources. Used when tasks support differential updates to identify
	 * which dependency resources changed between cache states.
	 *
	 * @public
	 * @returns {Map<string, object>} Map from original signature to delta information
	 *   containing newSignature and changedPaths array
	 */
	getDependencyIndexDeltas() {
		return this.#dependencyRequestManager.getDeltas();
	}

	/**
	 * Records resource requests and calculates signatures for the task
	 *
	 * This method:
	 * 1. Processes project and dependency resource requests
	 * 2. Searches for exact matches in the request graphs
	 * 3. If found, returns the existing index signatures
	 * 4. If not found, creates new request sets and resource indices
	 * 5. Uses tree derivation when possible to reuse parent indices
	 *
	 * The returned signatures uniquely identify the set of resources accessed and their
	 * content, enabling cache lookup for previously executed task results.
	 *
	 * @public
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests} projectRequestRecording
	 *   Project resource requests (paths and patterns)
	 * @param {@ui5/project/build/cache/BuildTaskCache~ResourceRequests|undefined} dependencyRequestRecording
	 *   Dependency resource requests (paths and patterns)
	 * @param {module:@ui5/fs.AbstractReader} projectReader Reader for accessing project resources
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader Reader for accessing dependency resources
	 * @returns {Promise<string[]>} Array containing [projectSignature, dependencySignature]
	 */
	async recordRequests(projectRequestRecording, dependencyRequestRecording, projectReader, dependencyReader) {
		const {
			setId: projectReqSetId, signature: projectReqSignature
		} = await this.#projectRequestManager.addRequests(projectRequestRecording, projectReader);

		let dependencyReqSignature;
		if (dependencyRequestRecording) {
			const {
				setId: depReqSetId, signature: depReqSignature
			} = await this.#dependencyRequestManager.addRequests(dependencyRequestRecording, dependencyReader);

			this.#projectRequestManager.addAffiliatedRequestSet(projectReqSetId, depReqSetId);
			dependencyReqSignature = depReqSignature;
		} else {
			dependencyReqSignature = this.#dependencyRequestManager.recordNoRequests();
		}
		return [projectReqSignature, dependencyReqSignature];
	}

	/**
	 * Serializes the task cache to plain objects for persistence
	 *
	 * Exports both project and dependency resource request graphs in a format suitable
	 * for JSON serialization. The serialized data can be passed to fromCache() to restore
	 * the cache state. Returns undefined for request managers with no new or modified entries.
	 *
	 * @public
	 * @returns {Array<object|undefined>} Array containing [projectCacheObject, dependencyCacheObject]
	 */
	toCacheObjects() {
		return [this.#projectRequestManager.toCacheObject(), this.#dependencyRequestManager.toCacheObject()];
	}
}
