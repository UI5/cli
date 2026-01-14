import {getLogger} from "@ui5/logger";
import ResourceRequestManager from "./ResourceRequestManager.js";
const log = getLogger("build:cache:BuildTaskCache");

/**
 * @typedef {object} @ui5/project/build/cache/BuildTaskCache~ResourceRequests
 * @property {Set<string>} paths - Specific resource paths that were accessed
 * @property {Set<string>} patterns - Glob patterns used to access resources
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
 */
export default class BuildTaskCache {
	#taskName;
	#projectName;

	#projectRequestManager;
	#dependencyRequestManager;

	/**
	 * Creates a new BuildTaskCache instance
	 *
	 * @param {string} taskName - Name of the task this cache manages
	 * @param {string} projectName - Name of the project this task belongs to
	 * @param {object} [cachedTaskMetadata]
	 */
	constructor(taskName, projectName, cachedTaskMetadata) {
		this.#taskName = taskName;
		this.#projectName = projectName;

		if (cachedTaskMetadata) {
			this.#projectRequestManager = ResourceRequestManager.fromCache(taskName, projectName,
				cachedTaskMetadata.projectRequests);
			this.#dependencyRequestManager = ResourceRequestManager.fromCache(taskName, projectName,
				cachedTaskMetadata.dependencyRequests);
		} else {
			// No cache reader provided, start with empty graph
			this.#projectRequestManager = new ResourceRequestManager(taskName, projectName);
			this.#dependencyRequestManager = new ResourceRequestManager(taskName, projectName);
		}
	}

	// ===== METADATA ACCESS =====

	/**
	 * Gets the name of the task
	 *
	 * @returns {string} Task name
	 */
	getTaskName() {
		return this.#taskName;
	}

	hasNewOrModifiedCacheEntries() {
		return this.#projectRequestManager.hasNewOrModifiedCacheEntries() ||
			this.#dependencyRequestManager.hasNewOrModifiedCacheEntries();
	}

	/**
	 * @param {module:@ui5/fs.AbstractReader} projectReader - Reader for accessing project resources
	 * @param {string[]} changedProjectResourcePaths - Array of changed project resource path
	 * @returns {Promise<boolean>} Whether any index has changed
	 */
	async updateProjectIndices(projectReader, changedProjectResourcePaths) {
		return await this.#projectRequestManager.updateIndices(projectReader, changedProjectResourcePaths);
	}

	/**
	 *
	 * Special case for dependency indices: Since dependency resources may change independently from this
	 * projects cache, we need to update the full index once at the beginning of every build from cache.
	 * This is triggered by calling this method without changedDepResourcePaths.
	 *
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader - Reader for accessing dependency resources
	 * @param {string[]} [changedDepResourcePaths] - Array of changed dependency resource paths
	 * @returns {Promise<boolean>} Whether any index has changed
	 */
	async updateDependencyIndices(dependencyReader, changedDepResourcePaths) {
		if (changedDepResourcePaths) {
			return await this.#dependencyRequestManager.updateIndices(dependencyReader, changedDepResourcePaths);
		} else {
			return await this.#dependencyRequestManager.refreshIndices(dependencyReader);
		}
	}

	/**
	 * Gets all project index signatures for this task
	 *
	 * Returns signatures from all recorded project-request sets. Each signature represents
	 * a unique combination of resources, belonging to the current project, that were accessed
	 * during task execution. This can be used to form a cache keys for restoring cached task results.
	 *
	 * @returns {Promise<string[]>} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getProjectIndexSignatures() {
		return this.#projectRequestManager.getIndexSignatures();
	}

	/**
	 * Gets all dependency index signatures for this task
	 *
	 * Returns signatures from all recorded dependency-request sets. Each signature represents
	 * a unique combination of resources, belonging to all dependencies of the current project, that were accessed
	 * during task execution. This can be used to form a cache keys for restoring cached task results.
	 *
	 * @returns {Promise<string[]>} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getDependencyIndexSignatures() {
		return this.#dependencyRequestManager.getIndexSignatures();
	}

	/**
	 * Calculates a signature for the task based on accessed resources
	 *
	 * This method:
	 * 1. Converts resource requests to Request objects
	 * 2. Searches for an exact match in the request graph
	 * 3. If found, returns the existing index signature
	 * 4. If not found, creates a new request set and resource index
	 * 5. Uses tree derivation when possible to reuse parent indices
	 *
	 * The signature uniquely identifies the set of resources accessed and their
	 * content, enabling cache lookup for previously executed task results.
	 *
	 * @param {ResourceRequests} projectRequestRecording - Project resource requests (paths and patterns)
	 * @param {ResourceRequests|undefined} dependencyRequestRecording - Dependency resource requests
	 * @param {module:@ui5/fs.AbstractReader} projectReader - Reader for accessing project resources
	 * @param {module:@ui5/fs.AbstractReader} dependencyReader - Reader for accessing dependency resources
	 * @returns {Promise<string>} Signature hash string of the resource index
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
			dependencyReqSignature = "X"; // No dependencies accessed
		}
		return [projectReqSignature, dependencyReqSignature];
	}

	findDelta() {
		// TODO: Implement
	}

	/**
	 * Serializes the task cache to a plain object for persistence
	 *
	 * Exports the resource request graph in a format suitable for JSON serialization.
	 * The serialized data can be passed to the constructor to restore the cache state.
	 *
	 * @returns {TaskCacheMetadata} Serialized cache metadata containing the request set graph
	 */
	toCacheObjects() {
		return {
			projectRequests: this.#projectRequestManager.toCacheObject(),
			dependencyRequests: this.#dependencyRequestManager.toCacheObject(),
		};
	}
}
