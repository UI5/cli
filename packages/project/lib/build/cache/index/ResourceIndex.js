/**
 * @module @ui5/project/build/cache/index/ResourceIndex
 * @description Manages an indexed view of build resources with hash-based tracking.
 *
 * ResourceIndex provides efficient resource tracking through hash tree structures,
 * enabling fast delta detection and signature calculation for build caching.
 */
import HashTree from "./HashTree.js";
import {createResourceIndex} from "../utils.js";

/**
 * Manages an indexed view of build resources with content-based hashing.
 *
 * ResourceIndex wraps a HashTree to provide resource indexing capabilities for build caching.
 * It maintains resource metadata (path, integrity, size, modification time) and computes
 * signatures for change detection. The index supports efficient updates and can be
 * persisted/restored from cache.
 *
 * @example
 * // Create from resources
 * const index = await ResourceIndex.create(resources, registry);
 * const signature = index.getSignature();
 *
 * @example
 * // Update with delta detection
 * const {changedPaths, resourceIndex} = await ResourceIndex.fromCacheWithDelta(
 *   cachedIndex,
 *   currentResources
 * );
 */
export default class ResourceIndex {
	#tree;
	#indexTimestamp;

	/**
	 * Creates a new ResourceIndex instance.
	 *
	 * @param {HashTree} tree - The hash tree containing resource metadata
	 * @param {number} [indexTimestamp] - Timestamp when the index was created (defaults to current time)
	 * @private
	 */
	constructor(tree, indexTimestamp) {
		this.#tree = tree;
		this.#indexTimestamp = indexTimestamp || Date.now();
	}

	/**
	 * Creates a new ResourceIndex from a set of resources.
	 *
	 * Builds a hash tree from the provided resources, computing content hashes
	 * and metadata for each resource. The resulting index can be used for
	 * signature calculation and change tracking.
	 *
	 * @param {Array<@ui5/fs/Resource>} resources - Resources to index
	 * @param {import("./TreeRegistry.js").default} [registry] - Optional tree registry for deduplication
	 * @returns {Promise<ResourceIndex>} A new resource index
	 * @public
	 */
	static async create(resources, registry) {
		const resourceIndex = await createResourceIndex(resources);
		const tree = new HashTree(resourceIndex, {registry});
		return new ResourceIndex(tree);
	}

	/**
	 * Restores a ResourceIndex from cache and applies delta updates.
	 *
	 * Takes a cached index and a current set of resources, then:
	 * 1. Identifies removed resources (in cache but not in current set)
	 * 2. Identifies added/updated resources (new or modified since cache)
	 * 3. Returns both the updated index and list of all changed paths
	 *
	 * This method is optimized for incremental builds where most resources
	 * remain unchanged between builds.
	 *
	 * @param {object} indexCache - Cached index object from previous build
	 * @param {number} indexCache.indexTimestamp - Timestamp of cached index
	 * @param {object} indexCache.indexTree - Cached hash tree structure
	 * @param {Array<@ui5/fs/Resource>} resources - Current resources to compare against cache
	 * @returns {Promise<{changedPaths: string[], resourceIndex: ResourceIndex}>}
	 *   Object containing array of all changed resource paths and the updated index
	 * @public
	 */
	static async fromCacheWithDelta(indexCache, resources) {
		const {indexTimestamp, indexTree} = indexCache;
		const tree = HashTree.fromCache(indexTree, {indexTimestamp});
		const currentResourcePaths = new Set(resources.map((resource) => resource.getOriginalPath()));
		const removed = tree.getResourcePaths().filter((resourcePath) => {
			return !currentResourcePaths.has(resourcePath);
		});
		await tree.removeResources(removed);
		const {added, updated} = await tree.upsertResources(resources);
		return {
			changedPaths: [...added, ...updated, ...removed],
			resourceIndex: new ResourceIndex(tree),
		};
	}

	/**
	 * Restores a ResourceIndex from cached metadata.
	 *
	 * Reconstructs the resource index from cached metadata without performing
	 * content hash verification. Useful when the cache is known to be valid
	 * and fast restoration is needed.
	 *
	 * @param {object} indexCache - Cached index object
	 * @param {Object<string, import("./HashTree.js").ResourceMetadata>} indexCache.resourceMetadata -
	 *   Map of resource paths to metadata (integrity, lastModified, size)
	 * @param {import("./TreeRegistry.js").default} [registry] - Optional tree registry for deduplication
	 * @returns {Promise<ResourceIndex>} Restored resource index
	 * @public
	 */
	static async fromCache(indexCache, registry) {
		const resourceIndex = Object.entries(indexCache.resourceMetadata).map(([path, metadata]) => {
			return {
				path,
				integrity: metadata.integrity,
				lastModified: metadata.lastModified,
				size: metadata.size,
			};
		});
		const tree = new HashTree(resourceIndex, {registry});
		return new ResourceIndex(tree);
	}

	/**
	 * Creates a deep copy of this ResourceIndex.
	 *
	 * The cloned index has its own hash tree but shares the same timestamp
	 * as the original. Useful for creating independent index variations.
	 *
	 * @returns {ResourceIndex} A cloned resource index
	 * @public
	 */
	clone() {
		const cloned = new ResourceIndex(this.#tree.clone(), this.#indexTimestamp);
		return cloned;
	}

	/**
	 * Creates a derived ResourceIndex by adding additional resources.
	 *
	 * Derives a new hash tree from the current tree by incorporating
	 * additional resources. The original index remains unchanged.
	 * This is useful for creating task-specific resource views.
	 *
	 * @param {Array<@ui5/fs/Resource>} additionalResources - Resources to add to the derived index
	 * @returns {Promise<ResourceIndex>} A new resource index with the additional resources
	 * @public
	 */
	async deriveTree(additionalResources) {
		const resourceIndex = await createResourceIndex(additionalResources);
		return new ResourceIndex(this.#tree.deriveTree(resourceIndex));
	}

	/**
	 * Updates existing resources in the index.
	 *
	 * Updates metadata for resources that already exist in the index.
	 * Resources not present in the index are ignored.
	 *
	 * @param {Array<@ui5/fs/Resource>} resources - Resources to update
	 * @returns {Promise<string[]>} Array of paths for resources that were updated
	 * @public
	 */
	async updateResources(resources) {
		return await this.#tree.updateResources(resources);
	}

	/**
	 * Inserts or updates resources in the index.
	 *
	 * For each resource:
	 * - If it exists in the index and has changed, it's updated
	 * - If it doesn't exist in the index, it's added
	 * - If it exists and hasn't changed, no action is taken
	 *
	 * @param {Array<@ui5/fs/Resource>} resources - Resources to upsert
	 * @returns {Promise<{added: string[], updated: string[]}>}
	 *   Object with arrays of added and updated resource paths
	 * @public
	 */
	async upsertResources(resources) {
		return await this.#tree.upsertResources(resources);
	}

	/**
	 * Computes the signature hash for this resource index.
	 *
	 * The signature is the root hash of the underlying hash tree,
	 * representing the combined state of all indexed resources.
	 * Any change to any resource will result in a different signature.
	 *
	 * @returns {string} SHA-256 hash signature of the resource index
	 * @public
	 */
	getSignature() {
		return this.#tree.getRootHash();
	}

	/**
	 * Serializes the ResourceIndex to a cache object.
	 *
	 * Converts the index to a plain object suitable for JSON serialization
	 * and storage in the build cache. The cached object can be restored
	 * using fromCache() or fromCacheWithDelta().
	 *
	 * @returns {object} Cache object containing timestamp and tree structure
	 * @returns {number} return.indexTimestamp - Timestamp when index was created
	 * @returns {object} return.indexTree - Serialized hash tree structure
	 * @public
	 */
	toCacheObject() {
		return {
			indexTimestamp: this.#indexTimestamp,
			indexTree: this.#tree.toCacheObject(),
		};
	}

	// #getResourceMetadata() {
	// 	const resources = this.#tree.getAllResources();
	// 	const resourceMetadata = Object.create(null);
	// 	for (const resource of resources) {
	// 		resourceMetadata[resource.path] = {
	// 			lastModified: resource.lastModified,
	// 			size: resource.size,
	// 			integrity: resource.integrity,
	// 			inode: resource.inode,
	// 		};
	// 	}
	// 	return resourceMetadata;
	// }
}
