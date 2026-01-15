import micromatch from "micromatch";
import ResourceRequestGraph, {Request} from "./ResourceRequestGraph.js";
import ResourceIndex from "./index/ResourceIndex.js";
import TreeRegistry from "./index/TreeRegistry.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:cache:ResourceRequestManager");

class ResourceRequestManager {
	#taskName;
	#projectName;
	#requestGraph;

	#treeRegistries = [];
	#treeUpdateDeltas = new Map();

	#hasNewOrModifiedCacheEntries;
	#useDifferentialUpdate;
	#unusedAtLeastOnce;

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
						`'${this.#taskName}' of project '${this.#projectName}'`);
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
	 * during task execution. This can be used to form a cache keys for restoring cached task results.
	 *
	 * @returns {Promise<string[]>} Array of signature strings
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
	 * Update all indices based on current resources (no delta update)
	 *
	 * @param {module:@ui5/fs.AbstractReader} reader - Reader for accessing project resources
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
	 * Filter relevant resource changes and update the indices if necessary
	 *
	 * @param {module:@ui5/fs.AbstractReader} reader - Reader for accessing project resources
	 * @param {string[]} changedResourcePaths - Array of changed project resource path
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
		if (this.#useDifferentialUpdate) {
			return await this.#flushTreeChangesWithDiffTracking();
		} else {
			return await this.#flushTreeChangesWithoutDiffTracking();
		}
	}

	/**
	 * Matches changed resources against a set of requests
	 *
	 * Tests each request against the changed resource paths using exact path matching
	 * for 'path'/'dep-path' requests and glob pattern matching for 'patterns'/'dep-patterns' requests.
	 *
	 * @private
	 * @param {Request[]} resourceRequests - Array of resource requests to match against
	 * @param {string[]} resourcePaths - Changed project resource paths
	 * @returns {string[]} Array of matched resource paths
	 */
	#matchResourcePaths(resourceRequests, resourcePaths) {
		const matchedResources = [];
		for (const {type, value} of resourceRequests) {
			if (type === "path") {
				if (resourcePaths.includes(value)) {
					matchedResources.push(value);
				}
			} else {
				matchedResources.push(...micromatch(resourcePaths, value));
			}
		}
		return matchedResources;
	}

	/**
	 * Flushes all tree registries to apply batched updates, ignoring how trees changed
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
	 * Flushes all tree registries to apply batched updates, keeping track of how trees changed
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
	 * @returns {Promise<object>} Object containing sets of added, updated, and removed resource paths
	 */
	async #flushTreeChanges() {
		return await Promise.all(this.#treeRegistries.map((registry) => registry.flush()));
	}

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

	getDeltas() {
		const deltas = new Map();
		for (const {originalSignature, newSignature, diff} of this.#treeUpdateDeltas.values()) {
			let changedPaths;
			if (diff) {
				const {added, updated, removed} = diff;
				changedPaths = Array.from(new Set([...added, ...updated, ...removed]));
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
	 *
	 * @param {ResourceRequests} requestRecording - Project resource requests (paths and patterns)
	 * @param {module:@ui5/fs.AbstractReader} reader - Reader for accessing project resources
	 * @returns {Promise<string>} Signature hash string of the resource index
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

	recordNoRequests() {
		this.#unusedAtLeastOnce = true;
		return "X"; // Signature for when no requests were made
	}

	async #addRequestSet(requests, reader) {
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
	 * @private
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

	hasNewOrModifiedCacheEntries() {
		return this.#hasNewOrModifiedCacheEntries;
	}

	/**
	 * Serializes the task cache to a plain object for persistence
	 *
	 * Exports the resource request graph in a format suitable for JSON serialization.
	 * The serialized data can be passed to the constructor to restore the cache state.
	 *
	 * @returns {TaskCacheMetadata} Serialized cache metadata containing the request set graph
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
