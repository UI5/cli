import micromatch from "micromatch";
import {getLogger} from "@ui5/logger";
import {createResourceIndex, areResourcesEqual} from "./utils.js";
const log = getLogger("build:cache:BuildTaskCache");

/**
 * @typedef {object} RequestMetadata
 * @property {string[]} pathsRead - Specific resource paths that were read
 * @property {string[]} patterns - Glob patterns used to read resources
 */

/**
 * @typedef {object} TaskCacheMetadata
 * @property {RequestMetadata} [projectRequests] - Project resource requests
 * @property {RequestMetadata} [dependencyRequests] - Dependency resource requests
 * @property {Object<string, ResourceMetadata>} [resourcesRead] - Resources read by task
 * @property {Object<string, ResourceMetadata>} [resourcesWritten] - Resources written by task
 */

function unionArray(arr, items) {
	for (const item of items) {
		if (!arr.includes(item)) {
			arr.push(item);
		}
	}
}
function unionObject(target, obj) {
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			target[key] = obj[key];
		}
	}
}

/**
 * Manages the build cache for a single task
 *
 * Tracks resource reads/writes and provides methods to validate cache validity
 * based on resource changes.
 */
export default class BuildTaskCache {
	#projectName;
	#taskName;

	// Track which resource paths (and patterns) the task reads
	// This is used to check whether a resource change *might* invalidates the task
	#projectRequests;
	#dependencyRequests;

	// Track metadata for the actual resources the task has read and written
	// This is used to check whether a resource has actually changed from the last time the task has been executed (and
	// its result has been cached)
	// Per resource path, this reflects the last known state of the resource (a task might be executed multiple times,
	// i.e. with a small delta of changed resources)
	// This map can contain either a resource instance (if the cache has been filled during this session) or an object
	// containing the last modified timestamp and an md5 hash of the resource (if the cache has been loaded from disk)
	#resourcesRead;
	#resourcesWritten;

	// ===== LIFECYCLE =====

	/**
	 * Creates a new BuildTaskCache instance
	 *
	 * @param {string} projectName - Name of the project
	 * @param {string} taskName - Name of the task
	 * @param {TaskCacheMetadata} metadata - Task cache metadata
	 */
	constructor(projectName, taskName, {projectRequests, dependencyRequests, input, output} = {}) {
		this.#projectName = projectName;
		this.#taskName = taskName;

		this.#projectRequests = projectRequests ?? {
			pathsRead: [],
			patterns: [],
		};

		this.#dependencyRequests = dependencyRequests ?? {
			pathsRead: [],
			patterns: [],
		};
		this.#resourcesRead = input ?? Object.create(null);
		this.#resourcesWritten = output ?? Object.create(null);
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

	/**
	 * Updates the task cache with new resource metadata
	 *
	 * @param {RequestMetadata} projectRequests - Project resource requests
	 * @param {RequestMetadata} [dependencyRequests] - Dependency resource requests
	 * @param {Object<string, object>} resourcesRead - Resources read by task
	 * @param {Object<string, object>} resourcesWritten - Resources written by task
	 * @returns {void}
	 */
	updateMetadata(projectRequests, dependencyRequests, resourcesRead, resourcesWritten) {
		unionArray(this.#projectRequests.pathsRead, projectRequests.pathsRead);
		unionArray(this.#projectRequests.patterns, projectRequests.patterns);

		if (dependencyRequests) {
			unionArray(this.#dependencyRequests.pathsRead, dependencyRequests.pathsRead);
			unionArray(this.#dependencyRequests.patterns, dependencyRequests.patterns);
		}

		unionObject(this.#resourcesRead, resourcesRead);
		unionObject(this.#resourcesWritten, resourcesWritten);
	}

	/**
	 * Serializes the task cache to a JSON-compatible object
	 *
	 * @returns {Promise<object>} Serialized task cache data
	 */
	async createMetadata() {
		return {
			projectRequests: this.#projectRequests,
			dependencyRequests: this.#dependencyRequests,
			taskIndex: await createResourceIndex(Object.values(this.#resourcesRead)),
			// resourcesWritten: await createMetadataForResources(this.#resourcesWritten)
		};
	}

	// ===== VALIDATION =====

	/**
	 * Checks if changed resources match this task's tracked resources
	 *
	 * This is a fast check that determines if the task *might* be invalidated
	 * based on path matching and glob patterns.
	 *
	 * @param {Set<string>|string[]} projectResourcePaths - Changed project resource paths
	 * @param {Set<string>|string[]} dependencyResourcePaths - Changed dependency resource paths
	 * @returns {boolean} True if any changed resources match this task's tracked resources
	 */
	matchesChangedResources(projectResourcePaths, dependencyResourcePaths) {
		if (this.#isRelevantResourceChange(this.#projectRequests, projectResourcePaths)) {
			log.verbose(
				`Build cache for task ${this.#taskName} of project ${this.#projectName} possibly invalidated ` +
				`by changes made to the following resources ${Array.from(projectResourcePaths).join(", ")}`);
			return true;
		}

		if (this.#isRelevantResourceChange(this.#dependencyRequests, dependencyResourcePaths)) {
			log.verbose(
				`Build cache for task ${this.#taskName} of project ${this.#projectName} possibly invalidated ` +
				`by changes made to the following resources: ${Array.from(dependencyResourcePaths).join(", ")}`);
			return true;
		}

		return false;
	}

	// ===== CACHE LOOKUPS =====

	/**
	 * Gets the cache entry for a resource that was read
	 *
	 * @param {string} searchResourcePath - Path of the resource to look up
	 * @returns {ResourceMetadata|object|undefined} Cache entry or undefined if not found
	 */
	getReadCacheEntry(searchResourcePath) {
		return this.#resourcesRead[searchResourcePath];
	}

	/**
	 * Gets the cache entry for a resource that was written
	 *
	 * @param {string} searchResourcePath - Path of the resource to look up
	 * @returns {ResourceMetadata|object|undefined} Cache entry or undefined if not found
	 */
	getWriteCacheEntry(searchResourcePath) {
		return this.#resourcesWritten[searchResourcePath];
	}

	/**
	 * Checks if a resource exists in the read cache and has the same content
	 *
	 * @param {object} resource - Resource instance to check
	 * @returns {Promise<boolean>} True if resource is in cache with matching content
	 */
	async hasResourceInReadCache(resource) {
		const cachedResource = this.#resourcesRead[resource.getPath()];
		if (!cachedResource) {
			return false;
		}
		// if (cachedResource.integrity) {
		// 	return await matchIntegrity(resource, cachedResource);
		// } else {
		return await areResourcesEqual(resource, cachedResource);
		// }
	}

	/**
	 * Checks if a resource exists in the write cache and has the same content
	 *
	 * @param {object} resource - Resource instance to check
	 * @returns {Promise<boolean>} True if resource is in cache with matching content
	 */
	async hasResourceInWriteCache(resource) {
		const cachedResource = this.#resourcesWritten[resource.getPath()];
		if (!cachedResource) {
			return false;
		}
		// if (cachedResource.integrity) {
		// 	return await matchIntegrity(resource, cachedResource);
		// } else {
		return await areResourcesEqual(resource, cachedResource);
		// }
	}

	#isRelevantResourceChange({pathsRead, patterns}, changedResourcePaths) {
		for (const resourcePath of changedResourcePaths) {
			if (pathsRead.includes(resourcePath)) {
				return true;
			}
			if (patterns.length && micromatch.isMatch(resourcePath, patterns)) {
				return true;
			}
		}
		return false;
	}
}
