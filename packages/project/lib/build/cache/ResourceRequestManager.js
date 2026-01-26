import micromatch from "micromatch";
import ResourceRequestGraph, {Request} from "./ResourceRequestGraph.js";
import ResourceIndex from "./index/ResourceIndex.js";
import TreeRegistry from "./index/TreeRegistry.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:cache:ResourceRequestManager");

/**
 * Manages resource requests and their associated indices for a single task
 *
 * Tracks all resources accessed by a task during execution and maintains resource indices
 * for cache validation and differential updates. Supports both full and delta-based caching
 * strategies.
 *
 * @class
 */
class ResourceRequestManager {
	#taskName;
	#projectName;
	#requestGraph;

	#treeRegistries = [];
	#treeUpdateDeltas = new Map();

	#hasNewOrModifiedCacheEntries;
	#useDifferentialUpdate;
	#unusedAtLeastOnce;

	/**
	 * Creates a new ResourceRequestManager instance
	 *
	 * @param {string} projectName Name of the project
	 * @param {string} taskName Name of the task
	 * @param {boolean} useDifferentialUpdate Whether to track differential updates
	 * @param {ResourceRequestGraph} [requestGraph] Optional pre-existing request graph from cache
	 * @param {boolean} [unusedAtLeastOnce=false] Whether the task has been unused at least once
	 */
	constructor(projectName, taskName, useDifferentialUpdate, requestGraph, unusedAtLeastOnce = false) {
		this.#projectName = projectName;
		this.#taskName = taskName;
		this.#useDifferentialUpdate = useDifferentialUpdate;
		this.#unusedAtLeastOnce = unusedAtLeastOnce;
		if (requestGraph) {
			this.#requestGraph = requestGraph;
			this.#hasNewOrModifiedCacheEntries = false; // Using cache
		} else {
			this.#requestGraph = new ResourceRequestGraph();
			this.#hasNewOrModifiedCacheEntries = true;
		}
	}

	/**
	 * Factory method to restore a ResourceRequestManager from cached data
	 *
	 * Deserializes a previously cached request graph and its associated resource indices,
	 * including both root indices and delta indices for differential updates.
	 *
	 * @param {string} projectName Name of the project
	 * @param {string} taskName Name of the task
	 * @param {boolean} useDifferentialUpdate Whether to track differential updates
	 * @param {object} cacheData Cached metadata object
	 * @param {object} cacheData.requestSetGraph Serialized request graph
	 * @param {Array<object>} cacheData.rootIndices Array of root resource indices
	 * @param {Array<object>} [cacheData.deltaIndices] Array of delta resource indices
	 * @param {boolean} [cacheData.unusedAtLeastOnce] Whether the task has been unused
	 * @returns {ResourceRequestManager} Restored manager instance
	 */
	static fromCache(projectName, taskName, useDifferentialUpdate, {
		requestSetGraph, rootIndices, deltaIndices, unusedAtLeastOnce
	}) {
		const requestGraph = ResourceRequestGraph.fromCacheObject(requestSetGraph);
		const resourceRequestManager = new ResourceRequestManager(
			projectName, taskName, useDifferentialUpdate, requestGraph, unusedAtLeastOnce);
		const registries = new Map();
		// Restore root resource indices
		for (const {nodeId, resourceIndex: serializedIndex} of rootIndices) {
			const metadata = requestGraph.getMetadata(nodeId);
			const registry = resourceRequestManager.#newTreeRegistry();
			registries.set(nodeId, registry);
			metadata.resourceIndex = ResourceIndex.fromCacheShared(serializedIndex, registry);
		}
		// Restore delta resource indices
		if (deltaIndices) {
			for (const {nodeId, addedResourceIndex} of deltaIndices) {
				const node = requestGraph.getNode(nodeId);
				const {resourceIndex: parentResourceIndex} = requestGraph.getMetadata(node.getParentId());
				const registry = registries.get(node.getParentId());
				if (!registry) {
					throw new Error(`Missing tree registry for parent of node ID ${nodeId} of task ` +
					`'${taskName}' of project '${projectName}'`);
				}
				const resourceIndex = parentResourceIndex.deriveTreeWithIndex(addedResourceIndex);

				requestGraph.setMetadata(nodeId, {
					resourceIndex,
				});
			}
		}
		return resourceRequestManager;
	}

	/**
	 * Gets all project index signatures for this task
	 *
	 * Returns signatures from all recorded project-request sets. Each signature represents
	 * a unique combination of resources belonging to the current project that were accessed
	 * during task execution. This can be used to form cache keys for restoring cached task results.
	 *
	 * @public
	 * @returns {string[]} Array of signature strings
	 * @throws {Error} If resource index is missing for any request set
	 */
	getIndexSignatures() {
		const requestSetIds = this.#requestGraph.getAllNodeIds();
		const signatures = requestSetIds.map((requestSetId) => {
			const {resourceIndex} = this.#requestGraph.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Resource index missing for request set ID ${requestSetId}`);
			}
			return resourceIndex.getSignature();
		});
		if (this.#unusedAtLeastOnce) {
			signatures.push("X"); // Signature for when no requests were made
		}
		return signatures;
	}

	/**
	 * Updates all indices based on current resources without delta tracking
	 *
	 * Performs a full refresh of all resource indices by fetching current resources
	 * and updating or removing indexed resources as needed. Does not track changes
	 * between the old and new state.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async refreshIndices(reader) {
		if (this.#requestGraph.getSize() === 0) {
			// No requests recorded -> No updates necessary
			return false;
		}

		const resourceCache = new Map();
		for (const {nodeId} of this.#requestGraph.traverseByDepth()) {
			const {resourceIndex} = this.#requestGraph.getMetadata(nodeId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for request set ID ${nodeId}`);
			}
			const addedRequests = this.#requestGraph.getNode(nodeId).getAddedRequests();
			const resourcesToUpdate = await this.#getResourcesForRequests(addedRequests, reader, resourceCache);

			// Determine resources to remove
			const indexedResourcePaths = resourceIndex.getResourcePaths();
			const currentResourcePaths = resourcesToUpdate.map((res) => res.getOriginalPath());
			const resourcesToRemove = indexedResourcePaths.filter((resPath) => {
				return !currentResourcePaths.includes(resPath);
			});
			if (resourcesToRemove.length) {
				await resourceIndex.removeResources(resourcesToRemove);
			}
			if (resourcesToUpdate.length) {
				await resourceIndex.upsertResources(resourcesToUpdate);
			}
		}
	}

	/**
	 * Filters relevant resource changes and updates the indices if necessary
	 *
	 * Processes changed resource paths, identifies which request sets are affected,
	 * and updates their resource indices accordingly. Supports both full updates and
	 * differential tracking based on the manager configuration.
	 *
	 * @public
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @param {string[]} changedResourcePaths Array of changed project resource paths
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async updateIndices(reader, changedResourcePaths) {
		const matchingRequestSetIds = [];
		const updatesByRequestSetId = new Map();
		if (this.#requestGraph.getSize() === 0) {
			// No requests recorded -> No updates necessary
			return false;
		}

		// Process all nodes, parents before children
		for (const {nodeId, node, parentId} of this.#requestGraph.traverseByDepth()) {
			const addedRequests = node.getAddedRequests(); // Resource requests added at this level
			let relevantUpdates;
			if (addedRequests.length) {
				relevantUpdates = this.#matchResourcePaths(addedRequests, changedResourcePaths);
			} else {
				relevantUpdates = [];
			}
			if (parentId) {
				// Include updates from parent nodes
				const parentUpdates = updatesByRequestSetId.get(parentId);
				if (parentUpdates && parentUpdates.length) {
					relevantUpdates.push(...parentUpdates);
				}
			}
			if (relevantUpdates.length) {
				updatesByRequestSetId.set(nodeId, relevantUpdates);
				matchingRequestSetIds.push(nodeId);
			}
		}
		if (!matchingRequestSetIds.length) {
			return false; // No relevant changes for any request set
		}

		const resourceCache = new Map();
		// Update matching resource indices
		for (const requestSetId of matchingRequestSetIds) {
			const {resourceIndex} = this.#requestGraph.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for request set ID ${requestSetId}`);
			}

			const resourcePathsToUpdate = updatesByRequestSetId.get(requestSetId);
			const resourcesToUpdate = [];
			const removedResourcePaths = [];
			for (const resourcePath of resourcePathsToUpdate) {
				let resource;
				if (resourceCache.has(resourcePath)) {
					resource = resourceCache.get(resourcePath);
				} else {
					resource = await reader.byPath(resourcePath);
					resourceCache.set(resourcePath, resource);
				}
				if (resource) {
					resourcesToUpdate.push(resource);
				} else {
					// Resource has been removed
					removedResourcePaths.push(resourcePath);
				}
			}
			if (removedResourcePaths.length) {
				await resourceIndex.removeResources(removedResourcePaths);
			}
			if (resourcesToUpdate.length) {
				await resourceIndex.upsertResources(resourcesToUpdate);
			}
		}
		let hasChanges;
		if (this.#useDifferentialUpdate) {
			hasChanges = await this.#flushTreeChangesWithDiffTracking();
		} else {
			hasChanges = await this.#flushTreeChangesWithoutDiffTracking();
		}
		if (hasChanges) {
			this.#hasNewOrModifiedCacheEntries = true;
		}
		return hasChanges;
	}

	/**
	 * Matches changed resources against a set of requests
	 *
	 * Tests each request against the changed resource paths using exact path matching
	 * for 'path'/'dep-path' requests and glob pattern matching for 'patterns'/'dep-patterns' requests.
	 *
	 * @param {Request[]} resourceRequests - Array of resource requests to match against
	 * @param {string[]} resourcePaths - Changed project resource paths
	 * @returns {string[]} Array of matched resource paths
	 */
	#matchResourcePaths(resourceRequests, resourcePaths) {
		const matchedResources = [];
		for (const {type, value} of resourceRequests) {
			if (type === "path") {
				if (resourcePaths.includes(value) && !matchedResources.includes(value)) {
					matchedResources.push(value);
				}
			} else {
				const globMatches = micromatch(resourcePaths, value, {
					dot: true
				});
				for (const match of globMatches) {
					if (!matchedResources.includes(match)) {
						matchedResources.push(match);
					}
				}
			}
		}
		return matchedResources;
	}

	/**
	 * Flushes all tree registries to apply batched updates without tracking changes
	 *
	 * Commits all pending tree modifications but does not record the specific changes
	 * (added, updated, removed resources). Used when differential updates are disabled.
	 *
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async #flushTreeChangesWithoutDiffTracking() {
		const results = await this.#flushTreeChanges();

		// Check for changes
		for (const res of results) {
			if (res.added.length || res.updated.length || res.unchanged.length || res.removed.length) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Flushes all tree registries to apply batched updates while tracking changes
	 *
	 * Commits all pending tree modifications and records detailed information about
	 * which resources were added, updated, or removed. Used when differential updates
	 * are enabled to support incremental cache invalidation.
	 *
	 * @returns {Promise<boolean>} True if any changes were detected, false otherwise
	 */
	async #flushTreeChangesWithDiffTracking() {
		const requestSetIds = this.#requestGraph.getAllNodeIds();
		const previousTreeSignatures = new Map();
		// Record current signatures and create mapping between trees and request sets
		requestSetIds.map((requestSetId) => {
			const {resourceIndex} = this.#requestGraph.getMetadata(requestSetId);
			if (!resourceIndex) {
				throw new Error(`Resource index missing for request set ID ${requestSetId}`);
			}
			// Remember the original signature
			previousTreeSignatures.set(resourceIndex.getTree(), [requestSetId, resourceIndex.getSignature()]);
		});
		const results = await this.#flushTreeChanges();
		let hasChanges = false;
		for (const res of results) {
			if (res.added.length || res.updated.length || res.unchanged.length || res.removed.length) {
				hasChanges = true;
			}
			for (const [tree, diff] of res.treeStats) {
				const [requestSetId, originalSignature] = previousTreeSignatures.get(tree);
				const newSignature = tree.getRootHash();
				this.#addDeltaEntry(requestSetId, originalSignature, newSignature, diff);
			}
		}
		return hasChanges;
	}

	/**
	 * Flushes all tree registries to apply batched updates
	 *
	 * Commits all pending tree modifications across all registries in parallel.
	 * Must be called after operations that schedule updates via registries.
	 *
	 * @returns {Promise<Array<object>>} Array of flush results from all registries,
	 *   each containing added, updated, unchanged, and removed resource paths
	 */
	async #flushTreeChanges() {
		return await Promise.all(this.#treeRegistries.map((registry) => registry.flush()));
	}

	/**
	 * Adds or updates a delta entry for tracking resource index changes
	 *
	 * Records the transition from an original signature to a new signature along with
	 * the specific resources that changed. Accumulates changes across multiple updates.
	 *
	 * @param {string} requestSetId Identifier of the request set
	 * @param {string} originalSignature Original resource index signature
	 * @param {string} newSignature New resource index signature
	 * @param {object} diff Object containing arrays of added, updated, unchanged, and removed resource paths
	 */
	#addDeltaEntry(requestSetId, originalSignature, newSignature, diff) {
		if (!this.#treeUpdateDeltas.has(requestSetId)) {
			this.#treeUpdateDeltas.set(requestSetId, {
				originalSignature,
				newSignature,
				diff
			});
			return;
		}
		const entry = this.#treeUpdateDeltas.get(requestSetId);

		entry.previousSignatures ??= [];
		entry.previousSignatures.push(entry.originalSignature);
		entry.originalSignature = originalSignature;
		entry.newSignature = newSignature;

		const {added, updated, unchanged, removed} = entry.diff;
		for (const resourcePath of diff.added) {
			if (!added.includes(resourcePath)) {
				added.push(resourcePath);
			}
		}
		for (const resourcePath of diff.updated) {
			if (!updated.includes(resourcePath)) {
				updated.push(resourcePath);
			}
		}
		for (const resourcePath of diff.unchanged) {
			if (!unchanged.includes(resourcePath)) {
				unchanged.push(resourcePath);
			}
		}
		for (const resourcePath of diff.removed) {
			if (!removed.includes(resourcePath)) {
				removed.push(resourcePath);
			}
		}
	}

	/**
	 * Gets all delta entries for differential cache updates
	 *
	 * Returns a map of signature transitions and their associated changed resource paths.
	 * Only includes deltas where no resources were removed, as removed resources prevent
	 * differential updates.
	 *
	 * @public
	 * @returns {Map<string, object>} Map from original signature to delta information
	 *   containing newSignature and changedPaths array
	 */
	getDeltas() {
		const deltas = new Map();
		for (const {originalSignature, newSignature, diff} of this.#treeUpdateDeltas.values()) {
			let changedPaths;
			if (diff) {
				const {added, updated, removed} = diff;
				if (removed.length) {
					// Cannot use differential build if a resource has been removed
					continue;
				}
				changedPaths = Array.from(new Set([...added, ...updated]));
			} else {
				changedPaths = [];
			}
			deltas.set(originalSignature, {
				newSignature,
				changedPaths,
			});
		}
		return deltas;
	}

	/**
	 * Adds a new set of resource requests and returns their signature
	 *
	 * Processes recorded resource requests (both path and pattern-based), creates or reuses
	 * a request set in the graph, and returns the resulting resource index signature.
	 *
	 * @public
	 * @param {object} requestRecording Project resource requests
	 * @param {string[]} requestRecording.paths Array of requested resource paths
	 * @param {Array<string[]>} requestRecording.patterns Array of glob pattern arrays
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @returns {Promise<object>} Object containing setId and signature of the resource index
	 */
	async addRequests(requestRecording, reader) {
		const projectRequests = [];
		for (const pathRead of requestRecording.paths) {
			projectRequests.push(new Request("path", pathRead));
		}
		for (const patterns of requestRecording.patterns) {
			projectRequests.push(new Request("patterns", patterns));
		}
		return await this.#addRequestSet(projectRequests, reader);
	}

	/**
	 * Records that a task made no resource requests
	 *
	 * Marks the manager as having been unused at least once and returns a special
	 * signature indicating no requests were made.
	 *
	 * @public
	 * @returns {string} Special signature "X" indicating no requests
	 */
	recordNoRequests() {
		if (!this.#unusedAtLeastOnce) {
			this.#hasNewOrModifiedCacheEntries = true;
		}
		this.#unusedAtLeastOnce = true;
		return "X"; // Signature for when no requests were made
	}

	/**
	 * Adds a request set and creates or reuses a resource index
	 *
	 * Attempts to find an existing matching request set to reuse. If not found, creates
	 * a new request set with either a derived or fresh resource index based on whether
	 * a parent request set exists.
	 *
	 * @param {Request[]} requests Array of resource requests
	 * @param {module:@ui5/fs.AbstractReader} reader Reader for accessing project resources
	 * @returns {Promise<object>} Object containing setId and signature of the resource index
	 */
	async #addRequestSet(requests, reader) {
		this.#hasNewOrModifiedCacheEntries = true;
		// Try to find an existing request set that we can reuse
		let setId = this.#requestGraph.findExactMatch(requests);
		let resourceIndex;
		if (setId) {
			// Reuse existing resource index.
			// Note: This index has already been updated before the task executed, so no update is necessary here
			resourceIndex = this.#requestGraph.getMetadata(setId).resourceIndex;
		} else {
			// New request set, check whether we can create a delta
			const metadata = {}; // Will populate with resourceIndex below
			setId = this.#requestGraph.addRequestSet(requests, metadata);

			const requestSet = this.#requestGraph.getNode(setId);
			const parentId = requestSet.getParentId();
			if (parentId) {
				const {resourceIndex: parentResourceIndex} = this.#requestGraph.getMetadata(parentId);
				// Add resources from delta to index
				const addedRequests = requestSet.getAddedRequests();
				const resourcesToAdd =
					await this.#getResourcesForRequests(addedRequests, reader);
				if (!resourcesToAdd.length) {
					throw new Error(`Unexpected empty added resources for request set ID ${setId} ` +
						`of task '${this.#taskName}' of project '${this.#projectName}'`);
				}
				log.verbose(`Task '${this.#taskName}' of project '${this.#projectName}' ` +
					`created derived resource index for request set ID ${setId} ` +
					`based on parent ID ${parentId} with ${resourcesToAdd.length} additional resources`);
				resourceIndex = await parentResourceIndex.deriveTree(resourcesToAdd);
			} else {
				const resourcesRead =
					await this.#getResourcesForRequests(requests, reader);
				resourceIndex = await ResourceIndex.createShared(resourcesRead, Date.now(), this.#newTreeRegistry());
			}
			metadata.resourceIndex = resourceIndex;
		}
		return {
			setId,
			signature: resourceIndex.getSignature(),
		};
	}

	/**
	 * Associates a request set from this manager with one from another manager
	 *
	 * @public
	 * @param {string} ourRequestSetId Request set ID from this manager
	 * @param {string} foreignRequestSetId Request set ID from another manager
	 * @todo Implementation pending
	 */
	addAffiliatedRequestSet(ourRequestSetId, foreignRequestSetId) {
		// TODO
	}

	/**
	 * Creates and registers a new tree registry
	 *
	 * Tree registries enable batched updates across multiple derived trees,
	 * improving performance when multiple indices share common subtrees.
	 *
	 * @returns {TreeRegistry} New tree registry instance
	 */
	#newTreeRegistry() {
		const registry = new TreeRegistry();
		this.#treeRegistries.push(registry);
		return registry;
	}

	/**
	 * Retrieves resources for a set of resource requests
	 *
	 * Processes different request types:
	 * - 'path': Retrieves single resource by path from the given reader
	 * - 'patterns': Retrieves resources matching glob patterns from the given reader
	 *
	 * @param {Request[]|Array<{type: string, value: string|string[]}>} resourceRequests - Resource requests to process
	 * @param {module:@ui5/fs.AbstractReader} reader - Resource reader
	 * @param {Map<string, module:@ui5/fs.Resource>} [resourceCache]
	 * @returns {Promise<Array<module:@ui5/fs.Resource>>} Array of matched resources
	 */
	async #getResourcesForRequests(resourceRequests, reader, resourceCache) {
		const resourcesMap = new Map();
		await Promise.all(resourceRequests.map(async ({type, value}) => {
			if (type === "path") {
				if (resourcesMap.has(value)) {
					// Resource already found
					return;
				}
				if (resourceCache?.has(value)) {
					const cachedResource = resourceCache.get(value);
					resourcesMap.set(cachedResource.getOriginalPath(), cachedResource);
				}
				const resource = await reader.byPath(value);
				if (resource) {
					resourcesMap.set(resource.getOriginalPath(), resource);
				}
			} else if (type === "patterns") {
				const matchedResources = await reader.byGlob(value);
				for (const resource of matchedResources) {
					resourcesMap.set(resource.getOriginalPath(), resource);
				}
			}
		}));
		return Array.from(resourcesMap.values());
	}

	/**
	 * Checks whether new or modified cache entries exist
	 *
	 * Returns false if the manager was restored from cache and no modifications were made.
	 * Returns true if this is a new manager or if new request sets have been added.
	 *
	 * @public
	 * @returns {boolean} True if cache entries need to be written
	 */
	hasNewOrModifiedCacheEntries() {
		return this.#hasNewOrModifiedCacheEntries;
	}

	/**
	 * Serializes the manager to a plain object for persistence
	 *
	 * Exports the resource request graph and all resource indices in a format suitable
	 * for JSON serialization. The serialized data can be passed to fromCache() to restore
	 * the manager state. Returns undefined if no new or modified cache entries exist.
	 *
	 * @public
	 * @returns {object|undefined} Serialized cache metadata or undefined if no changes
	 * @returns {object} return.requestSetGraph Serialized request graph
	 * @returns {Array<object>} return.rootIndices Array of root resource indices with node IDs
	 * @returns {Array<object>} return.deltaIndices Array of delta resource indices with node IDs
	 * @returns {boolean} return.unusedAtLeastOnce Whether the task has been unused
	 */
	toCacheObject() {
		if (!this.#hasNewOrModifiedCacheEntries) {
			return;
		}
		const rootIndices = [];
		const deltaIndices = [];
		for (const {nodeId, parentId} of this.#requestGraph.traverseByDepth()) {
			const {resourceIndex} = this.#requestGraph.getMetadata(nodeId);
			if (!resourceIndex) {
				throw new Error(`Missing resource index for node ID ${nodeId}`);
			}
			if (!parentId) {
				rootIndices.push({
					nodeId,
					resourceIndex: resourceIndex.toCacheObject(),
				});
			} else {
				const {resourceIndex: rootResourceIndex} = this.#requestGraph.getMetadata(parentId);
				if (!rootResourceIndex) {
					throw new Error(`Missing root resource index for parent ID ${parentId}`);
				}
				// Store the metadata for all added resources. Note: Those resources might not be available
				// in the current tree. In that case we store an empty array.
				const addedResourceIndex = resourceIndex.getAddedResourceIndex(rootResourceIndex);
				deltaIndices.push({
					nodeId,
					addedResourceIndex,
				});
			}
		}
		return {
			requestSetGraph: this.#requestGraph.toCacheObject(),
			rootIndices,
			deltaIndices,
			unusedAtLeastOnce: this.#unusedAtLeastOnce,
		};
	}
}

export default ResourceRequestManager;
