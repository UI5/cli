/**
 * @typedef {object} StageCacheEntry
 * @property {object} stage The cached stage instance (typically a reader or writer)
 * @property {string[]} writtenResourcePaths Array of resource paths written during stage execution
 */

/**
 * In-memory cache for build stage results
 *
 * Manages cached build stages by their signatures, allowing quick lookup and reuse
 * of previously executed build stages. Each stage is identified by a stage ID
 * (e.g., "task/taskName") and a signature (content hash of input resources).
 *
 * The cache maintains a queue of added signatures that need to be persisted,
 * enabling batch writes to persistent storage.
 *
 * Key features:
 * - Fast in-memory lookup by stage ID and signature
 * - Tracks written resources for cache invalidation
 * - Supports batch persistence via flush queue
 * - Multiple signatures per stage ID (for different input combinations)
 *
 * @class
 */
export default class StageCache {
	#stageIdToSignatures = new Map();
	#cacheQueue = [];

	/**
	 * Adds a stage signature to the cache
	 *
	 * Stores the stage instance and its written resources under the given stage ID
	 * and signature. The signature is added to the flush queue for later persistence.
	 *
	 * Multiple signatures can exist for the same stage ID, representing different
	 * input resource combinations that produce different outputs.
	 *
	 * @public
	 * @param {string} stageId Identifier for the stage (e.g., "task/generateBundle")
	 * @param {string} signature Content hash signature of the stage's input resources
	 * @param {object} stageInstance The stage instance to cache (typically a reader or writer)
	 * @param {string[]} writtenResourcePaths Array of resource paths written during this stage
	 */
	addSignature(stageId, signature, stageInstance, writtenResourcePaths) {
		if (!this.#stageIdToSignatures.has(stageId)) {
			this.#stageIdToSignatures.set(stageId, new Map());
		}
		const signatureToStageInstance = this.#stageIdToSignatures.get(stageId);
		signatureToStageInstance.set(signature, {
			signature,
			stage: stageInstance,
			writtenResourcePaths,
		});
		this.#cacheQueue.push([stageId, signature]);
	}

	/**
	 * Retrieves cached stage data for a specific signature
	 *
	 * Looks up a previously cached stage by its ID and signature. Returns null
	 * if either the stage ID or signature is not found in the cache.
	 *
	 * @public
	 * @param {string} stageId Identifier for the stage to look up
	 * @param {string} signature Signature hash to match
	 * @returns {StageCacheEntry|null} Cached stage entry with stage instance and written paths,
	 *   or null if not found
	 */
	getCacheForSignature(stageId, signature) {
		if (!this.#stageIdToSignatures.has(stageId)) {
			return null;
		}
		const signatureToStageInstance = this.#stageIdToSignatures.get(stageId);
		return signatureToStageInstance.get(signature) || null;
	}

	/**
	 * Retrieves and clears the cache queue
	 *
	 * Returns all stage signatures that have been added since the last flush,
	 * then resets the queue. The returned entries should be persisted to storage.
	 *
	 * Each queue entry is a tuple of [stageId, signature] that can be used to
	 * retrieve the full stage data via getCacheForSignature().
	 *
	 * @public
	 * @returns {Array<[string, string]>} Array of [stageId, signature] tuples to persist
	 */
	flushCacheQueue() {
		const queue = this.#cacheQueue;
		this.#cacheQueue = [];
		return queue;
	}

	/**
	 * Checks if there are pending entries in the cache queue
	 *
	 * @public
	 * @returns {boolean} True if there are entries to flush, false otherwise
	 */
	hasPendingCacheQueue() {
		return this.#cacheQueue.length > 0;
	}
}
